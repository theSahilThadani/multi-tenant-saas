"""
Migrate legacy tenants.api_key values to the new pat_tokens table.

For each tenant with a non-NULL api_key, creates a PAT entry with:
  - SHA-256 hash of the existing key
  - Scopes: users:read, users:write (matches current capability)
  - Mapped to the tenant admin user
  - No expiry (legacy keys don't expire)

Prerequisites:
  - pat_tokens table must already exist (run add_pat_tokens.sql first)
  - Database credentials via environment variables or .env file

Usage:
    pip install psycopg2-binary python-dotenv
    python migrate_legacy_pats.py
"""

import os
import hashlib

import psycopg2
from psycopg2.extras import RealDictCursor

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def get_conn():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ.get("DB_PORT", "5432"),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        connect_timeout=5,
    )


def migrate():
    conn = get_conn()
    conn.autocommit = False

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Find tenants with a legacy api_key
            cur.execute(
                """SELECT t.id, t.name, t.slug, t.api_key,
                          tu.cognito_sub, tu.email
                   FROM tenants t
                   LEFT JOIN tenant_users tu
                     ON tu.tenant_id = t.id AND tu.role = 'tenant_admin'
                   WHERE t.api_key IS NOT NULL
                   ORDER BY t.created_at"""
            )
            tenants = cur.fetchall()

        if not tenants:
            print("All tenants already migrated or no legacy API keys found.")
            return

        print(f"Found {len(tenants)} tenant(s) with legacy API keys:\n")

        migrated = []
        with conn.cursor() as cur:
            for t in tenants:
                api_key = t["api_key"]
                token_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
                token_prefix = "legacy_" + api_key[:8]

                # Check if already migrated
                cur.execute(
                    "SELECT 1 FROM pat_tokens WHERE token_hash = %s",
                    (token_hash,),
                )
                if cur.fetchone():
                    print(f"  SKIP {t['slug']} — already migrated")
                    continue

                admin_sub = t["cognito_sub"] or "unknown"
                admin_email = t["email"] or "system-migration"

                cur.execute(
                    """INSERT INTO pat_tokens
                           (token_hash, token_prefix, name, tenant_id, user_id,
                            user_email, user_role, scopes, created_by)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        token_hash,
                        token_prefix,
                        "Legacy Key (auto-migrated)",
                        str(t["id"]),
                        admin_sub,
                        admin_email,
                        "tenant_admin",
                        ["users:read", "users:write"],
                        "system-migration",
                    ),
                )
                migrated.append({
                    "slug": t["slug"],
                    "name": t["name"],
                    "prefix": token_prefix,
                })

        conn.commit()

        if migrated:
            print(f"\n{'Tenant Slug':<25} {'Tenant Name':<30} {'Token Prefix'}")
            print("-" * 75)
            for row in migrated:
                print(f"{row['slug']:<25} {row['name']:<30} {row['prefix']}")
            print(f"\nMigrated {len(migrated)} tenant(s).")
            print("Legacy keys will continue to work via the Lambda Authorizer fallback.")
        else:
            print("No new tenants to migrate.")

    except Exception as e:
        conn.rollback()
        print(f"Error: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
