"""
PAT Authorizer Lambda

Dual-mode API Gateway REQUEST authorizer:
  1. Authorization: Bearer <JWT>  → Cognito token validation
  2. X-API-Key: saas_pat_xxx      → SHA-256 hash → PostgreSQL lookup

Returns an IAM policy + context map that downstream Lambdas can read
from event["requestContext"]["authorizer"].

Context keys:
  auth_type   - "cognito" or "pat"
  tenant_id   - tenant UUID (string)
  user_id     - cognito_sub
  email       - user email
  role        - user role (tenant_admin, user, etc.)
  scopes      - comma-separated scope list (PAT only)
"""

import os
import hashlib

import boto3
import psycopg2
from psycopg2.extras import RealDictCursor


# ─────────────────────────────────────────────
# CLIENTS
# ─────────────────────────────────────────────

cognito = boto3.client("cognito-idp")

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
# POLICY HELPERS
# ─────────────────────────────────────────────

def generate_policy(principal_id, effect, method_arn, context=None):
    """Build an IAM policy document for API Gateway."""
    # Use wildcard ARN so the policy works for all routes (authorizer caching)
    arn_parts = method_arn.split(":")
    api_gw_arn = ":".join(arn_parts[:5])
    rest_parts = arn_parts[5].split("/")
    resource_arn = f"{api_gw_arn}:{rest_parts[0]}/{rest_parts[1]}/*"

    policy = {
        "principalId": principal_id,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": effect,
                    "Resource": resource_arn,
                }
            ],
        },
    }

    if context:
        # API Gateway authorizer context values must be strings, numbers, or booleans
        policy["context"] = {k: str(v) if v is not None else "" for k, v in context.items()}

    return policy


def deny_policy(method_arn):
    """Return a Deny policy."""
    return generate_policy("unauthorized", "Deny", method_arn)


# ─────────────────────────────────────────────
# COGNITO PATH
# ─────────────────────────────────────────────

def validate_cognito_token(access_token, method_arn):
    """Validate a Cognito Bearer token and return an Allow policy with context."""
    try:
        user_info = cognito.get_user(AccessToken=access_token)
    except Exception as e:
        print(f"[AUTHORIZER] Cognito validation failed: {e}")
        return None

    # Extract attributes
    attrs = {}
    for attr in user_info.get("UserAttributes", []):
        attrs[attr["Name"]] = attr["Value"]

    user_id = attrs.get("sub", "")
    email = attrs.get("email", "")
    tenant_id = attrs.get("custom:tenant_id", "")
    role = attrs.get("custom:role", "")

    print(f"[AUTHORIZER] Cognito OK: email={email} tenant={tenant_id} role={role}")

    return generate_policy(user_id, "Allow", method_arn, context={
        "auth_type": "cognito",
        "tenant_id": tenant_id,
        "user_id": user_id,
        "email": email,
        "role": role,
        "scopes": "",
    })


# ─────────────────────────────────────────────
# PAT PATH
# ─────────────────────────────────────────────

def validate_pat(api_key, method_arn):
    """Validate a PAT via SHA-256 hash → PostgreSQL lookup."""
    token_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()

    try:
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

        if not row:
            print("[AUTHORIZER] PAT not found or expired")
            return None

        # Update last_used_at (fire-and-forget, don't block auth)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE pat_tokens SET last_used_at = NOW() WHERE token_hash = %s",
                    (token_hash,),
                )
        except Exception as e:
            print(f"[AUTHORIZER] Failed to update last_used_at: {e}")

        scopes_str = ",".join(row["scopes"]) if row["scopes"] else ""

        print(f"[AUTHORIZER] PAT OK: user={row['user_email']} tenant={row['tenant_id']} scopes={scopes_str}")

        return generate_policy(str(row["user_id"]), "Allow", method_arn, context={
            "auth_type": "pat",
            "tenant_id": str(row["tenant_id"]),
            "user_id": str(row["user_id"]),
            "email": row["user_email"],
            "role": row["user_role"],
            "scopes": scopes_str,
        })

    except Exception as e:
        print(f"[AUTHORIZER] PAT validation error: {e}")
        return None


# ─────────────────────────────────────────────
# HANDLER
# ─────────────────────────────────────────────

def lambda_handler(event, context):
    """
    API Gateway REQUEST authorizer entry point.

    Checks for:
      1. Authorization: Bearer <jwt>   → Cognito path
      2. X-API-Key: saas_pat_xxx       → PAT path
      3. Neither                       → Deny
    """
    method_arn = event.get("methodArn", "")
    headers = event.get("headers") or {}

    # ── Check Bearer token first ──
    auth_header = headers.get("Authorization") or headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        access_token = auth_header.split(" ", 1)[1].strip()
        if access_token:
            result = validate_cognito_token(access_token, method_arn)
            if result:
                return result
            print("[AUTHORIZER] Cognito token invalid, checking for API key fallback")

    # ── Check X-API-Key header ──
    api_key = headers.get("X-API-Key") or headers.get("x-api-key") or ""
    if api_key:
        result = validate_pat(api_key, method_arn)
        if result:
            return result

    # ── Neither valid → Deny ──
    print("[AUTHORIZER] No valid credentials provided")
    raise Exception("Unauthorized")
