"""
All PostgreSQL operations for onboarding-lambda.
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor

_conn = None


def get_conn():
    """Get or create database connection."""
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg2.connect(
            host=os.environ["DB_HOST"],
            port=os.environ.get("DB_PORT", "5432"),
            dbname=os.environ["DB_NAME"],
            user=os.environ["DB_USER"],
            password=os.environ["DB_PASSWORD"],
            connect_timeout=5,
        )
        _conn.autocommit = True
    return _conn


# ─────────────────────────────────────────────
# READ OPERATIONS
# ─────────────────────────────────────────────

def is_slug_available(slug):
    """Check if slug is not reserved and not taken."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM reserved_slugs WHERE slug = %s", (slug,))
        if cur.fetchone():
            return False, "RESERVED"
        cur.execute("SELECT 1 FROM tenants WHERE slug = %s", (slug,))
        if cur.fetchone():
            return False, "TAKEN"
    return True, None


def get_tenant_by_slug(slug):
    """Get tenant by slug. Returns dict or None."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT id, name, slug, subdomain, cognito_client_id,
                      plan, status, created_at, updated_at
               FROM tenants WHERE slug = %s""",
            (slug,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_tenant_user(tenant_id, email):
    """Get user by tenant_id and email. Returns dict or None."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT id, tenant_id, cognito_sub, email, role
               FROM tenant_users
               WHERE tenant_id = %s AND email = %s""",
            (tenant_id, email),
        )
        row = cur.fetchone()
        return dict(row) if row else None


# ─────────────────────────────────────────────
# WRITE OPERATIONS
# ─────────────────────────────────────────────

def create_tenant(name, slug, subdomain, plan, api_key):
    """Create tenant row. Returns tenant dict with UUID id."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """INSERT INTO tenants (name, slug, subdomain, plan, api_key, status)
               VALUES (%s, %s, %s, %s, %s, 'PENDING')
               RETURNING id, name, slug, subdomain, plan, api_key, status""",
            (name, slug, subdomain, plan, api_key),
        )
        return dict(cur.fetchone())


def update_tenant_client_id(tenant_id, client_id):
    """Save Cognito App Client ID to tenant row."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE tenants SET cognito_client_id = %s, updated_at = NOW() WHERE id = %s",
            (client_id, tenant_id),
        )


def activate_tenant(tenant_id):
    """Mark tenant as ACTIVE."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE tenants SET status = 'ACTIVE', updated_at = NOW() WHERE id = %s",
            (tenant_id,),
        )


def fail_tenant(tenant_id):
    """Mark tenant as FAILED."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE tenants SET status = 'FAILED', updated_at = NOW() WHERE id = %s",
            (tenant_id,),
        )


def create_tenant_user(tenant_id, cognito_sub, email, role):
    """Create user row linked to tenant."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """INSERT INTO tenant_users (tenant_id, cognito_sub, email, role)
               VALUES (%s, %s, %s, %s)
               RETURNING id, tenant_id, email, role""",
            (tenant_id, cognito_sub, email, role),
        )
        return dict(cur.fetchone())


# ─────────────────────────────────────────────
# IDP CONFIG OPERATIONS
# ─────────────────────────────────────────────

def get_idp_config(tenant_id):
    """Get IDP config for a tenant. Returns dict or None."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT id, tenant_id, idp_type, display_name,
                      oidc_client_id, oidc_issuer_url, oidc_scopes,
                      saml_metadata_url,
                      cognito_idp_name, cognito_login_enabled, sso_login_enabled
               FROM tenant_idp_configs
               WHERE tenant_id = %s AND enabled = TRUE""",
            (tenant_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_idp_client_secret(tenant_id):
    """Return stored oidc_client_secret for a tenant. Used when updating without re-entering secret."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT oidc_client_secret FROM tenant_idp_configs WHERE tenant_id = %s AND enabled = TRUE",
            (tenant_id,),
        )
        row = cur.fetchone()
        return row[0] if row else None


def save_idp_config(tenant_id, idp_type, display_name, cognito_idp_name,
                    oidc_client_id=None, oidc_client_secret=None,
                    oidc_issuer_url=None, oidc_scopes=None,
                    saml_metadata_url=None, saml_metadata_xml=None,
                    cognito_login_enabled=True, sso_login_enabled=True):
    """Upsert IDP config row for a tenant."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """INSERT INTO tenant_idp_configs
                   (tenant_id, idp_type, display_name, cognito_idp_name,
                    oidc_client_id, oidc_client_secret, oidc_issuer_url, oidc_scopes,
                    saml_metadata_url, saml_metadata_xml,
                    cognito_login_enabled, sso_login_enabled)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (tenant_id) DO UPDATE SET
                   idp_type              = EXCLUDED.idp_type,
                   display_name          = EXCLUDED.display_name,
                   cognito_idp_name      = EXCLUDED.cognito_idp_name,
                   oidc_client_id        = EXCLUDED.oidc_client_id,
                   oidc_client_secret    = EXCLUDED.oidc_client_secret,
                   oidc_issuer_url       = EXCLUDED.oidc_issuer_url,
                   oidc_scopes           = EXCLUDED.oidc_scopes,
                   saml_metadata_url     = EXCLUDED.saml_metadata_url,
                   saml_metadata_xml     = EXCLUDED.saml_metadata_xml,
                   cognito_login_enabled = EXCLUDED.cognito_login_enabled,
                   sso_login_enabled     = EXCLUDED.sso_login_enabled,
                   enabled               = TRUE,
                   updated_at            = NOW()
               RETURNING id, tenant_id, idp_type, display_name, cognito_idp_name,
                         oidc_client_id, oidc_issuer_url, oidc_scopes,
                         saml_metadata_url, cognito_login_enabled, sso_login_enabled""",
            (tenant_id, idp_type, display_name, cognito_idp_name,
             oidc_client_id, oidc_client_secret, oidc_issuer_url, oidc_scopes,
             saml_metadata_url, saml_metadata_xml,
             cognito_login_enabled, sso_login_enabled),
        )
        return dict(cur.fetchone())


def delete_idp_config(tenant_id):
    """Soft-delete IDP config (set enabled=FALSE)."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE tenant_idp_configs SET enabled = FALSE, updated_at = NOW() WHERE tenant_id = %s",
            (tenant_id,),
        )


def update_idp_login_modes(tenant_id, cognito_login_enabled, sso_login_enabled):
    """Toggle OTP / SSO on the IDP config row."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE tenant_idp_configs
               SET cognito_login_enabled = %s, sso_login_enabled = %s, updated_at = NOW()
               WHERE tenant_id = %s AND enabled = TRUE""",
            (cognito_login_enabled, sso_login_enabled, tenant_id),
        )


# ─────────────────────────────────────────────
# MAGIC LINK TOKEN OPERATIONS
# ─────────────────────────────────────────────

def create_magic_link_token(token_hash, email, tenant_id, purpose, context, ttl_minutes):
    """Insert a new magic link token."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO magic_link_tokens (token_hash, email, tenant_id, purpose, context, expires_at)
               VALUES (%s, %s, %s, %s, %s::jsonb, NOW() + INTERVAL '%s minutes')""",
            (token_hash, email, tenant_id, purpose,
             __import__('json').dumps(context), ttl_minutes),
        )


def get_magic_link_token(token_hash):
    """Look up a magic link token by its SHA-256 hash. Returns dict or None."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT id, token_hash, email, tenant_id, purpose, context,
                      expires_at, used_at, created_at
               FROM magic_link_tokens
               WHERE token_hash = %s""",
            (token_hash,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_tenant_by_slug_or_id(slug_or_id):
    """Get tenant by slug or UUID id. Returns dict or None."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT id, name, slug, subdomain, cognito_client_id,
                      plan, status, created_at, updated_at
               FROM tenants WHERE slug = %s OR id::text = %s""",
            (slug_or_id, str(slug_or_id)),
        )
        row = cur.fetchone()
        return dict(row) if row else None


# ─────────────────────────────────────────────
# DEMO APPROVAL OPERATIONS
# ─────────────────────────────────────────────

def create_demo_approval(tenant_id, title, description, requested_by, approver_email):
    """Create a demo approval request."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """INSERT INTO demo_approvals (tenant_id, title, description, requested_by, approver_email)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING id, tenant_id, title, description, requested_by,
                         approver_email, status, created_at""",
            (tenant_id, title, description, requested_by, approver_email),
        )
        return dict(cur.fetchone())


def get_demo_approval(approval_id):
    """Get a demo approval by ID. Returns dict or None."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT id, tenant_id, title, description, requested_by,
                      approver_email, status, decided_at, decision_comment, created_at
               FROM demo_approvals WHERE id = %s""",
            (approval_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def decide_demo_approval(approval_id, status, comment):
    """Approve or reject a demo approval."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """UPDATE demo_approvals
               SET status = %s, decision_comment = %s, decided_at = NOW()
               WHERE id = %s AND status = 'pending'
               RETURNING id, status, decided_at""",
            (status, comment, approval_id),
        )
        row = cur.fetchone()
        return dict(row) if row else None