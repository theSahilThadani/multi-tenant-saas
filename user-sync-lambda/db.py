"""
All PostgreSQL operations for user-sync-lambda.
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
