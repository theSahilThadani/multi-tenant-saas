-- Migration: add_tenant_idp_configs
-- Per-tenant SSO/IDP configuration table

CREATE TABLE tenant_idp_configs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- 'oidc' or 'saml'
    idp_type     VARCHAR(10) NOT NULL CHECK (idp_type IN ('oidc', 'saml')),
    display_name VARCHAR(100) NOT NULL,  -- shown on SSO button e.g. "Sign in with Google"

    -- OIDC fields (idp_type = 'oidc')
    oidc_client_id     VARCHAR(255),
    oidc_client_secret TEXT,             -- stored as-is; encrypt at rest via RDS/KMS
    oidc_issuer_url    VARCHAR(500),     -- e.g. https://accounts.google.com
    oidc_scopes        VARCHAR(255) DEFAULT 'openid email profile',

    -- SAML fields (idp_type = 'saml')
    saml_metadata_url  VARCHAR(1000),    -- preferred: IDP provides a URL
    saml_metadata_xml  TEXT,             -- fallback: raw XML

    -- Cognito IDP name registered in the User Pool (e.g. 'xyz-oidc', 'xyz-saml')
    cognito_idp_name VARCHAR(100) NOT NULL,

    -- Login mode toggles (mirrored from App Client SupportedIdentityProviders)
    cognito_login_enabled BOOLEAN NOT NULL DEFAULT TRUE,  -- OTP / COGNITO login active
    sso_login_enabled     BOOLEAN NOT NULL DEFAULT TRUE,  -- this IDP login active

    enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id)  -- one IDP config per tenant
);

CREATE INDEX idx_tenant_idp_tenant_id ON tenant_idp_configs (tenant_id);

-- Required for ON CONFLICT (cognito_sub) upsert in federated user provisioning
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_users_cognito_sub
    ON tenant_users (cognito_sub);
