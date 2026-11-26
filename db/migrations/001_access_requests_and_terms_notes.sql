-- Migration 001: Persist full access request metadata, review/invite lifecycle, and terminology notes.
ALTER TABLE voxrelay.access_requests
  ADD COLUMN IF NOT EXISTS organization TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS languages TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewer_note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'access_requests_status_check' AND conrelid = 'voxrelay.access_requests'::regclass
  ) THEN
    ALTER TABLE voxrelay.access_requests
      ADD CONSTRAINT access_requests_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'redeemed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_voxrelay_access_requests_status ON voxrelay.access_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voxrelay_access_requests_invite ON voxrelay.access_requests(invite_token_hash) WHERE invite_token_hash IS NOT NULL;

ALTER TABLE voxrelay.terms
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
