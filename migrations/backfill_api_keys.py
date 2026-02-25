"""
Backfill API keys for existing tenants that don't have one yet.

Run this once after deploying user-sync-lambda to give every existing
tenant an API key so they can use the /users/create endpoint.

Usage:
    pip install psycopg2-binary python-dotenv
    python backfill_api_keys.py

Set DB credentials via environment variables or a .env file:
    DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
"""

import os
import uuid

import psycopg2
from psycopg2.extras import RealDictCursor

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv is optional


def get_conn():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ.get("DB_PORT", "5432"),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        connect_timeout=5,
    )


def backfill():
    conn = get_conn()
    conn.autocommit = False

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Find tenants without an api_key
            cur.execute(
                "SELECT id, name, slug FROM tenants WHERE api_key IS NULL ORDER BY created_at"
            )
            tenants = cur.fetchall()

        if not tenants:
            print("✅ All tenants already have an API key. Nothing to do.")
            return

        print(f"Found {len(tenants)} tenant(s) without an API key:\n")

        updated = []
        with conn.cursor() as cur:
            for tenant in tenants:
                api_key = uuid.uuid4().hex  # 32-char hex
                cur.execute(
                    "UPDATE tenants SET api_key = %s, updated_at = NOW() WHERE id = %s",
                    (api_key, tenant["id"]),
                )
                updated.append({
                    "slug": tenant["slug"],
                    "name": tenant["name"],
                    "api_key": api_key,
                })

        conn.commit()

        print(f"{'Tenant Slug':<25} {'Tenant Name':<30} {'API Key'}")
        print("-" * 90)
        for row in updated:
            print(f"{row['slug']:<25} {row['name']:<30} {row['api_key']}")

        print(f"\n✅ Backfilled {len(updated)} tenant(s). Store these keys securely.")
        print("   They are shown only once here — they are hashed in the DB.\n")
        print("   Note: Tenant admins can also rotate their key at any time via:")
        print("   POST /sync/api-key/generate  (Authorization: Bearer <access_token>)")

    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    backfill()
