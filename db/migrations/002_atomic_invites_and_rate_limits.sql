-- Migration 002: Atomic invitation review/redemption RPCs, verified org linkage, and advisory-locked rate limiting.

ALTER TABLE voxrelay.access_requests
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES voxrelay.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_role TEXT NOT NULL DEFAULT 'interpreter';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'access_requests_approved_role_check'
  ) THEN
    ALTER TABLE voxrelay.access_requests
      ADD CONSTRAINT access_requests_approved_role_check
      CHECK (approved_role IN ('interpreter', 'admin'));
  END IF;
END $$;

-- Atomic review transition: only 'pending' requests can move to 'approved' or 'rejected',
-- and the corresponding audit_events record is written inside the same transaction.
CREATE OR REPLACE FUNCTION voxrelay.review_access_request(
  p_request_id BIGINT,
  p_decision TEXT,
  p_note TEXT,
  p_reviewer_id UUID,
  p_invite_hash TEXT DEFAULT NULL,
  p_invite_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_provision_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = voxrelay, pg_catalog
AS $$
DECLARE
  v_row voxrelay.access_requests%ROWTYPE;
  v_existing_status TEXT;
  v_next_status TEXT;
  v_approved_role TEXT;
BEGIN
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid review decision';
  END IF;

  IF p_decision = 'approve' THEN
    IF p_invite_hash IS NULL OR length(trim(p_invite_hash)) = 0 THEN
      RAISE EXCEPTION 'Invite token hash is required for approval';
    END IF;
    v_next_status := 'approved';
  ELSE
    v_next_status := 'rejected';
  END IF;

  SELECT status INTO v_existing_status
  FROM voxrelay.access_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_existing_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_reviewed', 'status', v_existing_status);
  END IF;

  UPDATE voxrelay.access_requests
  SET
    status = v_next_status,
    reviewer_note = COALESCE(p_note, ''),
    reviewed_by = p_reviewer_id,
    reviewed_at = now(),
    invite_token_hash = CASE WHEN p_decision = 'approve' THEN p_invite_hash ELSE NULL END,
    invite_expires_at = CASE WHEN p_decision = 'approve' THEN p_invite_expires_at ELSE NULL END,
    org_id = CASE WHEN p_decision = 'approve' THEN p_provision_org_id ELSE NULL END,
    approved_role = CASE
      WHEN p_decision = 'approve' AND audience = 'organization' AND p_provision_org_id IS NOT NULL THEN 'admin'
      ELSE 'interpreter'
    END
  WHERE id = p_request_id AND status = 'pending'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_reviewed');
  END IF;

  INSERT INTO voxrelay.audit_events (actor_id, org_id, area, type, object_ref, result)
  VALUES (
    p_reviewer_id,
    v_row.org_id,
    'admin',
    CASE WHEN p_decision = 'approve' THEN 'access_request_approved' ELSE 'access_request_rejected' END,
    p_request_id::TEXT,
    v_next_status
  );

  v_approved_role := v_row.approved_role;
  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'email', v_row.email,
    'audience', v_row.audience,
    'org_id', v_row.org_id,
    'approved_role', v_approved_role,
    'status', v_row.status
  );
END;
$$;

-- Atomic conditional invitation claim: verifies token hash, status='approved',
-- invited email match, and non-expiration before transitioning to 'redeemed'.
CREATE OR REPLACE FUNCTION voxrelay.claim_access_invite(
  p_token_hash TEXT,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = voxrelay, pg_catalog
AS $$
DECLARE
  v_row voxrelay.access_requests%ROWTYPE;
  v_existing voxrelay.access_requests%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;

  UPDATE voxrelay.access_requests
  SET
    status = 'redeemed',
    invite_token_hash = NULL
  WHERE invite_token_hash = p_token_hash
    AND status = 'approved'
    AND lower(trim(email)) = lower(trim(p_email))
    AND (invite_expires_at IS NULL OR invite_expires_at > now())
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'id', v_row.id,
      'email', v_row.email,
      'audience', v_row.audience,
      'org_id', v_row.org_id,
      'approved_role', v_row.approved_role
    );
  END IF;

  SELECT * INTO v_existing
  FROM voxrelay.access_requests
  WHERE invite_token_hash = p_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_used');
  END IF;

  IF v_existing.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_approved');
  END IF;

  IF v_existing.invite_expires_at IS NOT NULL AND v_existing.invite_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;

  IF lower(trim(v_existing.email)) <> lower(trim(p_email)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'email_mismatch');
  END IF;

  RETURN jsonb_build_object('ok', false, 'code', 'invalid');
END;
$$;

-- Atomic advisory-locked rate limiter: serializes concurrent checks per bucket key.
CREATE OR REPLACE FUNCTION voxrelay.consume_rate_limit(
  p_key_hash TEXT,
  p_max_requests INTEGER,
  p_window_ms BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = voxrelay, pg_catalog
AS $$
DECLARE
  v_count INTEGER;
  v_since TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_key_hash));
  v_since := now() - ((p_window_ms::DOUBLE PRECISION / 1000.0) * INTERVAL '1 second');

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM voxrelay.rate_events
  WHERE key_hash = p_key_hash
    AND created_at >= v_since;

  IF v_count >= p_max_requests THEN
    RETURN false;
  END IF;

  INSERT INTO voxrelay.rate_events (key_hash, created_at)
  VALUES (p_key_hash, now());

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION voxrelay.review_access_request(BIGINT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION voxrelay.review_access_request(BIGINT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID) TO service_role;

REVOKE ALL ON FUNCTION voxrelay.claim_access_invite(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION voxrelay.claim_access_invite(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION voxrelay.consume_rate_limit(TEXT, INTEGER, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION voxrelay.consume_rate_limit(TEXT, INTEGER, BIGINT) TO service_role;
