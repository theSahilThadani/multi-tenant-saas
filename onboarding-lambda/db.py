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