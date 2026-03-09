"""
All PostgreSQL operations for cognito-triggers-lambda.
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
# MAGIC LINK TOKEN OPERATIONS
# ─────────────────────────────────────────────

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


def consume_magic_link_token(token_hash):
    """Mark a magic link token as used. Returns True if consumed, False if already used."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE magic_link_tokens
               SET used_at = NOW()
               WHERE token_hash = %s AND used_at IS NULL
               RETURNING id""",
            (token_hash,),
        )
        return cur.fetchone() is not None
