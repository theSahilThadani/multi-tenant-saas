-- Migration: add_magic_link_tokens
-- Magic link authentication tokens
-- Raw token sent in email URL; SHA-256 hash stored in DB
-- Single-use: used_at set on first verification

CREATE TABLE magic_link_tokens (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token_hash    VARCHAR(64) NOT NULL UNIQUE,       -- SHA-256 hex of raw token
    email         VARCHAR(255) NOT NULL,
    tenant_id     UUID REFERENCES tenants(id),       -- NULL for main-site links
    purpose       VARCHAR(50) NOT NULL               -- 'auth', 'invitation', 'guest'
                  CHECK (purpose IN ('auth', 'invitation', 'guest')),
    context       JSONB DEFAULT '{}',                -- target_url, resource_id, role, etc.
    expires_at    TIMESTAMPTZ NOT NULL,
    used_at       TIMESTAMPTZ,                       -- NULL = unused; set on first use
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by token hash (primary verification path)
CREATE INDEX idx_magic_link_token_hash ON magic_link_tokens (token_hash);

-- Lookup by email (admin listing, cleanup)
CREATE INDEX idx_magic_link_email ON magic_link_tokens (email);

-- Cleanup: find expired unused tokens
CREATE INDEX idx_magic_link_expires ON magic_link_tokens (expires_at)
    WHERE used_at IS NULL;
