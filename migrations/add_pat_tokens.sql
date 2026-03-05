-- Migration: add_pat_tokens
-- Personal Access Token (PAT) system for API key authentication
-- Tokens are SHA-256 hashed; raw token shown only once at creation

CREATE TABLE pat_tokens (
    token_hash    VARCHAR(64) PRIMARY KEY,       -- SHA-256 hex of raw token (never store plaintext)
    token_prefix  VARCHAR(20) NOT NULL,           -- e.g. "saas_pat_a3f8bc12" for display/identification
    name          VARCHAR(100) NOT NULL,          -- human-friendly label e.g. "HRMS Integration"
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id       VARCHAR(255) NOT NULL,          -- cognito_sub of the user this PAT acts as
    user_email    VARCHAR(255) NOT NULL,
    user_role     VARCHAR(50) NOT NULL,           -- role at creation time (tenant_admin, user)
    scopes        TEXT[] NOT NULL DEFAULT '{}',   -- e.g. {"users:read","users:write","incidents:read"}
    status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'revoked')),
    created_by    VARCHAR(255) NOT NULL,          -- email of admin who created this PAT
    last_used_at  TIMESTAMPTZ,                    -- updated on each authenticated request
    expires_at    TIMESTAMPTZ,                    -- NULL = never expires
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by tenant (for listing PATs in admin UI)
CREATE INDEX idx_pat_tenant ON pat_tokens (tenant_id, created_at DESC);

-- Partial index for active tokens only (authorizer queries)
CREATE INDEX idx_pat_status ON pat_tokens (status) WHERE status = 'active';

-- Prevent duplicate names within the same tenant (active keys only)
CREATE UNIQUE INDEX idx_pat_name_tenant ON pat_tokens (tenant_id, name)
    WHERE status = 'active';
