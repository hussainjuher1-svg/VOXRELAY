-- Migration 002: Two-phase invitation reservation/finalization/release,
-- in-transaction organization provisioning on approval, and advisory-locked rate limiting.

ALTER TABLE voxrelay.access_requests
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES voxrelay.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_role TEXT NOT NULL DEFAULT 'interpreter',
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provisioned_user_id UUID;

ALTER TABLE voxrelay.access_requests
  DROP CONSTRAINT IF EXISTS access_requests_status_check;

ALTER TABLE voxrelay.access_requests
  ADD CONSTRAINT access_requests_status_check
  CHECK (status IN ('pending', 'approved', 'reserved', 'rejected', 'redeemed'));

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

CREATE INDEX IF NOT EXISTS idx_voxrelay_access_requests_claim
  ON voxrelay.access_requests(id, claim_token)
  WHERE claim_token IS NOT NULL;

-- Drop older signature if present from an earlier revision of Migration 002
DROP FUNCTION IF EXISTS voxrelay.review_access_request(BIGINT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID);
DROP FUNCTION IF EXISTS voxrelay.claim_access_invite(TEXT, TEXT);

-- Atomic review transition:
--   1. Locks pending access_requests row FOR UPDATE
--   2. Confirms status = 'pending'
--   3. Creates organization record INSIDE the same transaction for approved organization requests
--   4. Stores verified org_id and approved_role on the request
--   5. Inserts audit_events inside the same transaction (any failure rolls everything back)
CREATE OR REPLACE FUNCTION voxrelay.review_access_request(
  p_request_id BIGINT,
  p_decision TEXT,
  p_note TEXT,
  p_reviewer_id UUID,
  p_invite_hash TEXT DEFAULT NULL,
  p_invite_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = voxrelay, pg_catalog
AS $$
DECLARE
  v_req voxrelay.access_requests%ROWTYPE;
  v_row voxrelay.access_requests%ROWTYPE;
  v_next_status TEXT;
  v_org_id UUID := NULL;
  v_org_name TEXT;
  v_approved_role TEXT := 'interpreter';
BEGIN
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid review decision';
  END IF;

  IF p_decision = 'approve' AND (p_invite_hash IS NULL OR length(trim(p_invite_hash)) = 0) THEN
    RAISE EXCEPTION 'Invite token hash is required for approval';
  END IF;

  SELECT * INTO v_req
  FROM voxrelay.access_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_reviewed', 'status', v_req.status);
  END IF;

  IF p_decision = 'approve' THEN
    v_next_status := 'approved';
    IF v_req.audience = 'organization' THEN
      IF v_req.org_id IS NOT NULL THEN
        v_org_id := v_req.org_id;
      ELSE
        v_org_name := left(COALESCE(NULLIF(trim(v_req.organization), ''), 'Organization #' || p_request_id::TEXT), 120);
        INSERT INTO voxrelay.organizations (name, created_by)
        VALUES (v_org_name, p_reviewer_id)
        RETURNING id INTO v_org_id;
      END IF;
      v_approved_role := 'admin';
    END IF;
  ELSE
    v_next_status := 'rejected';
    v_org_id := NULL;
    v_approved_role := 'interpreter';
  END IF;

  UPDATE voxrelay.access_requests
  SET
    status = v_next_status,
    reviewer_note = COALESCE(p_note, ''),
    reviewed_by = p_reviewer_id,
    reviewed_at = now(),
    invite_token_hash = CASE WHEN p_decision = 'approve' THEN p_invite_hash ELSE NULL END,
    invite_expires_at = CASE WHEN p_decision = 'approve' THEN p_invite_expires_at ELSE NULL END,
    org_id = v_org_id,
    approved_role = v_approved_role,
    claim_token = NULL,
    claim_expires_at = NULL
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

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'email', v_row.email,
    'audience', v_row.audience,
    'org_id', v_row.org_id,
    'approved_role', v_row.approved_role,
    'status', v_row.status
  );
END;
$$;

-- Phase 1 of two-phase invite redemption: atomically reserve an approved (or lease-expired) invitation.
-- Keeps invite_token_hash intact so recoverable provisioning failures can release and retry safely.
CREATE OR REPLACE FUNCTION voxrelay.reserve_access_invite(
  p_token_hash TEXT,
  p_email TEXT,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = voxrelay, pg_catalog
AS $$
DECLARE
  v_existing voxrelay.access_requests%ROWTYPE;
  v_claim UUID;
  v_claim_exp TIMESTAMPTZ;
BEGIN
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;

  SELECT * INTO v_existing
  FROM voxrelay.access_requests
  WHERE invite_token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_used');
  END IF;

  IF v_existing.status = 'redeemed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_redeemed');
  END IF;

  IF v_existing.status = 'rejected' OR v_existing.status = 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_approved');
  END IF;

  IF v_existing.invite_expires_at IS NOT NULL AND v_existing.invite_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;

  IF lower(trim(v_existing.email)) <> lower(trim(p_email)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'email_mismatch');
  END IF;

  IF v_existing.status = 'reserved' AND (v_existing.claim_expires_at IS NULL OR v_existing.claim_expires_at > now()) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'in_progress');
  END IF;

  v_claim := gen_random_uuid();
  v_claim_exp := now() + (GREATEST(10, COALESCE(p_lease_seconds, 120)) * INTERVAL '1 second');

  UPDATE voxrelay.access_requests
  SET
    status = 'reserved',
    claim_token = v_claim,
    claim_expires_at = v_claim_exp
  WHERE id = v_existing.id
    AND invite_token_hash = p_token_hash
    AND (
      status = 'approved'
      OR (status = 'reserved' AND claim_expires_at IS NOT NULL AND claim_expires_at <= now())
    );

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'in_progress');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_existing.id,
    'claim_token', v_claim,
    'claim_expires_at', v_claim_exp,
    'email', v_existing.email,
    'audience', v_existing.audience,
    'org_id', v_existing.org_id,
    'approved_role', v_existing.approved_role
  );
END;
$$;

-- Phase 2 of two-phase invite redemption: finalize to 'redeemed' and write audit_events atomically
-- only after Auth user and membership provisioning succeed.
CREATE OR REPLACE FUNCTION voxrelay.finalize_access_invite(
  p_request_id BIGINT,
  p_claim_token UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = voxrelay, pg_catalog
AS $$
DECLARE
  v_row voxrelay.access_requests%ROWTYPE;
BEGIN
  UPDATE voxrelay.access_requests
  SET
    status = 'redeemed',
    invite_token_hash = NULL,
    claim_token = NULL,
    claim_expires_at = NULL,
    provisioned_user_id = p_user_id
  WHERE id = p_request_id
    AND status = 'reserved'
    AND claim_token = p_claim_token
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'lease_lost');
  END IF;

  INSERT INTO voxrelay.audit_events (actor_id, org_id, area, type, object_ref, result)
  VALUES (
    p_user_id,
    v_row.org_id,
    'auth',
    'invite_signup',
    p_request_id::TEXT,
    'ok'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'org_id', v_row.org_id,
    'status', v_row.status
  );
END;
$$;

-- Recovery path: release a reservation lease if provisioning failed before finalization.
CREATE OR REPLACE FUNCTION voxrelay.release_access_invite(
  p_request_id BIGINT,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = voxrelay, pg_catalog
AS $$
BEGIN
  UPDATE voxrelay.access_requests
  SET
    status = 'approved',
    claim_token = NULL,
    claim_expires_at = NULL
  WHERE id = p_request_id
    AND status = 'reserved'
    AND claim_token = p_claim_token;

  RETURN FOUND;
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

REVOKE ALL ON FUNCTION voxrelay.review_access_request(BIGINT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION voxrelay.review_access_request(BIGINT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) TO service_role;

REVOKE ALL ON FUNCTION voxrelay.reserve_access_invite(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION voxrelay.reserve_access_invite(TEXT, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION voxrelay.finalize_access_invite(BIGINT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION voxrelay.finalize_access_invite(BIGINT, UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION voxrelay.release_access_invite(BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION voxrelay.release_access_invite(BIGINT, UUID) TO service_role;

REVOKE ALL ON FUNCTION voxrelay.consume_rate_limit(TEXT, INTEGER, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION voxrelay.consume_rate_limit(TEXT, INTEGER, BIGINT) TO service_role;
