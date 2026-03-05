"""
All PostgreSQL operations for user-sync-lambda.
"""

import os
import hashlib

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

def get_tenant_by_api_key(api_key):
    """Look up an ACTIVE tenant by its API key. Returns dict or None."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT id, name, slug, subdomain, cognito_client_id, plan, status
               FROM tenants
               WHERE api_key = %s AND status = 'ACTIVE'""",
            (api_key,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_tenant_by_id(tenant_id):
    """Get an ACTIVE tenant by its UUID. Returns dict or None."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT id, name, slug, subdomain, cognito_client_id, plan, status
               FROM tenants
               WHERE id = %s AND status = 'ACTIVE'""",
            (tenant_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_tenant_by_slug(slug):
    """Get an ACTIVE tenant by slug. Returns dict or None."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT id, name, slug, subdomain, cognito_client_id, plan, status
               FROM tenants
               WHERE slug = %s AND status = 'ACTIVE'""",
            (slug,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_tenant_user(tenant_id, email):
    """Check if email already exists in a specific tenant. Returns dict or None."""
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


def get_tenant_user_by_email(email):
    """Check if email belongs to ANY tenant (cross-tenant conflict check). Returns dict or None."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT id, tenant_id, email, role
               FROM tenant_users
               WHERE email = %s
               LIMIT 1""",
            (email,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


# ─────────────────────────────────────────────
# WRITE OPERATIONS
# ─────────────────────────────────────────────

def create_tenant_user(tenant_id, cognito_sub, email, role):
    """Create user row linked to tenant. Returns the new row."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """INSERT INTO tenant_users (tenant_id, cognito_sub, email, role)
               VALUES (%s, %s, %s, %s)
               RETURNING id, tenant_id, email, role""",
            (tenant_id, cognito_sub, email, role),
        )
        return dict(cur.fetchone())


def set_tenant_api_key(tenant_id, api_key):
    """Generate or rotate the API key for a tenant."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE tenants SET api_key = %s, updated_at = NOW() WHERE id = %s",
            (api_key, tenant_id),
        )


# ─────────────────────────────────────────────
# PAT OPERATIONS
# ─────────────────────────────────────────────

def hash_token(raw_token):
    """SHA-256 hash a raw PAT string."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_pat(token_hash, token_prefix, name, tenant_id, user_id,
               user_email, user_role, scopes, created_by, expires_at=None):
    """Insert a new PAT. Returns the new row dict."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """INSERT INTO pat_tokens
                   (token_hash, token_prefix, name, tenant_id, user_id,
                    user_email, user_role, scopes, created_by, expires_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING token_prefix, name, tenant_id, user_id, user_email,
                         user_role, scopes, status, created_by, expires_at, created_at""",
            (token_hash, token_prefix, name, tenant_id, user_id,
             user_email, user_role, scopes, created_by, expires_at),
        )
        return dict(cur.fetchone())


def list_pats(tenant_id):
    """List all PATs for a tenant. Never returns token_hash."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT token_prefix, name, user_id, user_email, user_role,
                      scopes, status, created_by, last_used_at, expires_at, created_at
               FROM pat_tokens
               WHERE tenant_id = %s
               ORDER BY created_at DESC""",
            (tenant_id,),
        )
        return [dict(row) for row in cur.fetchall()]


def revoke_pat(token_prefix, tenant_id):
    """Revoke a PAT by its prefix + tenant_id. Returns True if a row was updated."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE pat_tokens
               SET status = 'revoked'
               WHERE token_prefix = %s AND tenant_id = %s AND status = 'active'""",
            (token_prefix, tenant_id),
        )
        return cur.rowcount > 0


def get_pat_by_hash(token_hash):
    """Look up an active, non-expired PAT by hash. Returns dict or None."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT token_hash, tenant_id, user_id, user_email, user_role, scopes
               FROM pat_tokens
               WHERE token_hash = %s
                 AND status = 'active'
                 AND (expires_at IS NULL OR expires_at > NOW())""",
            (token_hash,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def update_pat_last_used(token_hash):
    """Touch last_used_at timestamp on each authenticated request."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE pat_tokens SET last_used_at = NOW() WHERE token_hash = %s",
            (token_hash,),
        )


def list_tenant_users(tenant_id):
    """List all users in a tenant (for PAT user selection dropdown)."""
    conn = get_conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """SELECT cognito_sub, email, role
               FROM tenant_users
               WHERE tenant_id = %s
               ORDER BY email""",
            (tenant_id,),
        )
        return [dict(row) for row in cur.fetchall()]
