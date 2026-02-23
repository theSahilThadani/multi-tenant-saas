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