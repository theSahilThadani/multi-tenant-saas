"""
PostgreSQL operations for signin-lambda.
READ-ONLY — no write operations.
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor

_conn = None


def get_conn():
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


def get_tenant_by_slug(slug):
    """Get tenant by slug."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT id, name, slug, subdomain, cognito_client_id,
                      plan, status, created_at
               FROM tenants WHERE slug = %s AND status = 'ACTIVE'""",
            (slug,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_tenant_user(tenant_id, email):
    """Get user by tenant and email."""
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


def get_idp_config(tenant_id):
    """Get IDP config for a tenant. Read-only."""
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


def upsert_tenant_user_by_sub(tenant_id, cognito_sub, email, role):
    """Insert federated user into tenant_users; update email if already exists by cognito_sub."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """INSERT INTO tenant_users (tenant_id, cognito_sub, email, role)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (cognito_sub) DO UPDATE SET
                   email = EXCLUDED.email
               RETURNING id, tenant_id, cognito_sub, email, role""",
            (tenant_id, cognito_sub, email, role),
        )
        return dict(cur.fetchone())