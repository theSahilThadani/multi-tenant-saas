"""
User Sync Lambda

Used by: External systems (HRMS, directory services, internal backends)
Purpose: Push users into an existing tenant workspace via API key auth

Routes:
  POST /sync/api-key/generate  → Generate or rotate legacy API key (Cognito token auth)
  POST /users/create           → Create a single user in a tenant workspace (API key auth)

PAT Management Routes (all require Bearer token + tenant_admin):
  GET  /api-keys/users         → List tenant users for PAT assignment
  POST /api-keys               → Create a new PAT for a selected user
  GET  /api-keys               → List all PATs for the tenant
  DELETE /api-keys/{prefix}    → Revoke a PAT
"""

import os
import json
import re
import uuid
import boto3

import db


# ─────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────

def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization,X-API-Key",
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        },
        "body": json.dumps(body, default=str),
    }


EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
VALID_ROLES = {"user", "tenant_admin"}

# Known PAT scopes — new scopes can be added here without schema changes
KNOWN_SCOPES = {
    "users:read",
    "users:write",
    "tenant:read",
    "idp:manage",
    "incidents:read",
    "incidents:write",
    "reports:read",
}

cognito = boto3.client("cognito-idp")
ses = boto3.client("ses")


# ─────────────────────────────────────────────────────
# AUTH HELPERS
# ─────────────────────────────────────────────────────

def _require_tenant_admin(event):
    """
    Verify Bearer token, require custom:role = tenant_admin.
    Returns (tenant_slug, tenant_dict, caller_email, None) on success.
    Returns (None, None, None, error_response) on failure.
    """
    headers = event.get("headers") or {}
    auth_header = headers.get("Authorization") or headers.get("authorization") or ""

    if not auth_header.lower().startswith("bearer "):
        return None, None, None, response(401, {
            "error": "MISSING_TOKEN",
            "message": "Authorization: Bearer <token> header is required",
        })

    access_token = auth_header.split(" ", 1)[1].strip()

    try:
        user_info = cognito.get_user(AccessToken=access_token)
    except cognito.exceptions.NotAuthorizedException:
        return None, None, None, response(401, {
            "error": "INVALID_TOKEN",
            "message": "Token is invalid or expired",
        })
    except Exception as e:
        return None, None, None, response(401, {
            "error": "INVALID_TOKEN",
            "message": str(e),
        })

    tenant_slug = ""
    caller_role = ""
    caller_email = ""
    for attr in user_info.get("UserAttributes", []):
        if attr["Name"] == "custom:tenant_id":
            tenant_slug = attr["Value"]
        if attr["Name"] == "custom:role":
            caller_role = attr["Value"]
        if attr["Name"] == "email":
            caller_email = attr["Value"]

    if caller_role != "tenant_admin":
        return None, None, None, response(403, {
            "error": "FORBIDDEN",
            "message": "Only tenant admins can manage API keys",
        })

    if not tenant_slug:
        return None, None, None, response(403, {
            "error": "NO_TENANT",
            "message": "Your account is not associated with any tenant",
        })

    tenant = db.get_tenant_by_slug(tenant_slug)
    if not tenant:
        return None, None, None, response(404, {
            "error": "TENANT_NOT_FOUND",
            "message": f"Tenant '{tenant_slug}' not found or inactive",
        })

    return tenant_slug, tenant, caller_email, None


# ═════════════════════════════════════════════════════
# ROUTE 1: GENERATE / ROTATE API KEY
# ═════════════════════════════════════════════════════

def handle_generate_api_key(event):
    """
    POST /sync/api-key/generate
    Header: Authorization: Bearer <tenant_admin_access_token>

    Generates (or rotates) the API key for the caller's tenant.
    The caller must be a tenant_admin authenticated via Cognito OTP.
    """
    user_pool_id = os.environ["COGNITO_USER_POOL_ID"]

    # ── STEP 1: Extract and verify Cognito token ──
    auth_header = (event.get("headers") or {}).get("authorization", "") or \
                  (event.get("headers") or {}).get("Authorization", "")

    if not auth_header or not auth_header.lower().startswith("bearer "):
        return response(401, {
            "error": "MISSING_TOKEN",
            "message": "Authorization: Bearer <token> header is required",
        })

    access_token = auth_header.split(" ", 1)[1].strip()

    print("[GEN-KEY] Verifying Cognito token")
    try:
        user_info = cognito.get_user(AccessToken=access_token)
    except cognito.exceptions.NotAuthorizedException:
        return response(401, {
            "error": "INVALID_TOKEN",
            "message": "Token is invalid or expired",
        })
    except Exception as e:
        return response(401, {
            "error": "INVALID_TOKEN",
            "message": str(e),
        })

    # ── STEP 2: Extract tenant_id and role from Cognito attributes ──
    tenant_slug = ""
    caller_role = ""
    for attr in user_info.get("UserAttributes", []):
        if attr["Name"] == "custom:tenant_id":
            tenant_slug = attr["Value"]
        if attr["Name"] == "custom:role":
            caller_role = attr["Value"]

    print(f"[GEN-KEY] Caller slug={tenant_slug} role={caller_role}")

    # ── STEP 3: Only tenant_admin may generate a key ──
    if caller_role != "tenant_admin":
        return response(403, {
            "error": "FORBIDDEN",
            "message": "Only tenant admins can generate API keys",
        })

    if not tenant_slug:
        return response(403, {
            "error": "NO_TENANT",
            "message": "Your account is not associated with any tenant",
        })

    # ── STEP 4: Look up tenant ──
    tenant = db.get_tenant_by_slug(tenant_slug)
    if not tenant:
        return response(404, {
            "error": "TENANT_NOT_FOUND",
            "message": f"Tenant '{tenant_slug}' not found or inactive",
        })

    # ── STEP 5: Generate and store key ──
    api_key = uuid.uuid4().hex  # 32-char hex, no hyphens
    db.set_tenant_api_key(str(tenant["id"]), api_key)
    print(f"[GEN-KEY] ✅ Key generated for {tenant_slug}")

    return response(200, {
        "apiKey": api_key,
        "tenantSlug": tenant["slug"],
        "tenantName": tenant["name"],
        "message": "API key generated. Store it securely — calling this again will invalidate the current key.",
    })


# ═════════════════════════════════════════════════════
# ROUTE 2: CREATE USER
# ═════════════════════════════════════════════════════

def handle_create_user(event):
    """
    POST /users/create
    Header: X-API-Key: <tenant_api_key>
    Body:   { "email": "alice@company.com", "role": "user" }

    Creates a user in the tenant workspace:
      - Validates inputs and checks duplicates
      - Creates user in Cognito (if not already in pool)
      - Sets custom:tenant_id and custom:role on the Cognito user
      - Inserts into tenant_users table
      - Sends an invite email via SES
    """
    user_pool_id = os.environ["COGNITO_USER_POOL_ID"]
    app_domain = os.environ.get("APP_DOMAIN", "example.com")
    ses_from = os.environ.get("SES_FROM_EMAIL", "")

    # ── STEP 1: Extract API key ──
    headers = event.get("headers") or {}
    api_key = headers.get("x-api-key", "") or headers.get("X-API-Key", "")

    if not api_key:
        return response(401, {
            "error": "MISSING_API_KEY",
            "message": "X-API-Key header is required",
        })

    # ── STEP 2: Resolve tenant from API key ──
    # Try new PAT system first (saas_pat_xxx → SHA-256 → pat_tokens table)
    # Fall back to legacy tenants.api_key column for backward compatibility
    print(f"[CREATE-USER] Resolving tenant from API key")
    tenant = None
    pat_record = None

    if api_key.startswith("saas_pat_"):
        token_hash = db.hash_token(api_key)
        pat_record = db.get_pat_by_hash(token_hash)
        if pat_record:
            # Check scopes — require users:write for user creation
            pat_scopes = pat_record.get("scopes") or []
            if "users:write" not in pat_scopes:
                return response(403, {
                    "error": "INSUFFICIENT_SCOPE",
                    "message": "This API key does not have 'users:write' scope",
                    "requiredScope": "users:write",
                    "tokenScopes": pat_scopes,
                })
            tenant = db.get_tenant_by_id(str(pat_record["tenant_id"]))
            db.update_pat_last_used(token_hash)
            print(f"[CREATE-USER] Authenticated via PAT (user: {pat_record['user_email']})")

    if not tenant:
        # Legacy fallback: check tenants.api_key column
        tenant = db.get_tenant_by_api_key(api_key)

    if not tenant:
        return response(401, {
            "error": "INVALID_API_KEY",
            "message": "API key is invalid or tenant is inactive",
        })

    tenant_id = str(tenant["id"])
    tenant_slug = tenant["slug"]
    tenant_name = tenant["name"]
    print(f"[CREATE-USER] Tenant: {tenant_slug}")

    # ── STEP 3: Parse body ──
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return response(400, {
            "error": "INVALID_BODY",
            "message": "Request body must be valid JSON",
        })

    # ── STEP 4: Validate email ──
    email = body.get("email", "").strip().lower()
    if not email or not EMAIL_REGEX.match(email):
        return response(400, {
            "error": "INVALID_EMAIL",
            "message": "A valid email address is required",
        })

    # ── STEP 5: Validate role ──
    role = body.get("role", "").strip().lower()
    if role not in VALID_ROLES:
        return response(400, {
            "error": "INVALID_ROLE",
            "message": f"Role must be one of: {', '.join(sorted(VALID_ROLES))}",
        })

    print(f"[CREATE-USER] email={email} role={role}")

    # ── STEP 6: Same-tenant duplicate check ──
    if db.get_tenant_user(tenant_id, email):
        return response(409, {
            "error": "ALREADY_MEMBER",
            "message": f"{email} is already a member of this workspace",
        })

    # ── STEP 7: Cross-tenant conflict check ──
    existing_anywhere = db.get_tenant_user_by_email(email)
    if existing_anywhere and str(existing_anywhere["tenant_id"]) != tenant_id:
        return response(409, {
            "error": "BELONGS_TO_ANOTHER_TENANT",
            "message": f"{email} is already registered to a different workspace",
        })

    # ── STEP 8: Create or find user in Cognito ──
    print(f"[CREATE-USER] Checking Cognito for {email}")
    cognito_sub = None
    try:
        existing_user = cognito.admin_get_user(
            UserPoolId=user_pool_id,
            Username=email,
        )
        # User already in pool — extract sub
        for attr in existing_user.get("UserAttributes", []):
            if attr["Name"] == "sub":
                cognito_sub = attr["Value"]
        print(f"[CREATE-USER] User already in Cognito, sub={cognito_sub}")

    except cognito.exceptions.UserNotFoundException:
        # New user — create in pool
        print(f"[CREATE-USER] Creating new Cognito user: {email}")
        create_resp = cognito.admin_create_user(
            UserPoolId=user_pool_id,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
            ],
            MessageAction="SUPPRESS",  # We send our own invite email
        )
        for attr in create_resp["User"].get("Attributes", []):
            if attr["Name"] == "sub":
                cognito_sub = attr["Value"]
        print(f"[CREATE-USER] Created Cognito user, sub={cognito_sub}")

    except Exception as e:
        print(f"[CREATE-USER] Cognito error: {str(e)}")
        return response(500, {
            "error": "INTERNAL_ERROR",
            "message": f"Failed to resolve Cognito user: {str(e)}",
        })

    # ── STEP 9: Set tenant attributes on the Cognito user ──
    print(f"[CREATE-USER] Setting Cognito attributes for {email}")
    try:
        cognito.admin_update_user_attributes(
            UserPoolId=user_pool_id,
            Username=email,
            UserAttributes=[
                {"Name": "custom:tenant_id", "Value": tenant_slug},
                {"Name": "custom:role", "Value": role},
            ],
        )
    except Exception as e:
        print(f"[CREATE-USER] Attribute update error: {str(e)}")
        return response(500, {
            "error": "INTERNAL_ERROR",
            "message": f"Failed to set user attributes: {str(e)}",
        })

    # ── STEP 10: Insert into tenant_users ──
    print(f"[CREATE-USER] Inserting into tenant_users")
    try:
        user_row = db.create_tenant_user(tenant_id, cognito_sub, email, role)
    except Exception as e:
        print(f"[CREATE-USER] DB error: {str(e)}")
        return response(500, {
            "error": "INTERNAL_ERROR",
            "message": f"Failed to save user: {str(e)}",
        })

    # ── STEP 11: Send invite email ──
    login_url = f"https://{tenant_slug}.{app_domain}/login"
    invite_sent = False
    try:
        send_invite_email(ses_from, email, tenant_name, tenant_slug, login_url)
        invite_sent = True
        print(f"[CREATE-USER] Invite email sent to {email}")
    except Exception as e:
        # Non-fatal — user is already created; log and continue
        print(f"[CREATE-USER] WARNING: Invite email failed: {str(e)}")

    print(f"[CREATE-USER] ✅ Done: {email} → {tenant_slug}")

    return response(201, {
        "userId": str(user_row["id"]),
        "email": email,
        "role": role,
        "tenantSlug": tenant_slug,
        "tenantName": tenant_name,
        "cognitoSub": cognito_sub,
        "loginUrl": login_url,
        "inviteEmailSent": invite_sent,
        "status": "created",
    })


# ═════════════════════════════════════════════════════
# ROUTE 3: LIST TENANT USERS (for PAT assignment)
# ═════════════════════════════════════════════════════

def handle_list_tenant_users(event):
    """
    GET /api-keys/users
    Header: Authorization: Bearer <tenant_admin_access_token>

    Returns list of users in the tenant for the PAT user-selection dropdown.
    """
    tenant_slug, tenant, caller_email, err = _require_tenant_admin(event)
    if err:
        return err

    tenant_id = str(tenant["id"])
    users = db.list_tenant_users(tenant_id)

    print(f"[PAT] Listed {len(users)} users for {tenant_slug}")

    return response(200, {
        "users": [
            {
                "userId": u["cognito_sub"],
                "email": u["email"],
                "role": u["role"],
            }
            for u in users
        ],
        "total": len(users),
    })


# ═════════════════════════════════════════════════════
# ROUTE 4: CREATE PAT
# ═════════════════════════════════════════════════════

def handle_create_pat(event):
    """
    POST /api-keys
    Header: Authorization: Bearer <tenant_admin_access_token>
    Body:   { "name": "HRMS Integration", "userId": "<cognito_sub>",
              "scopes": ["users:write", "incidents:read"], "expiresInDays": 365 }

    Creates a PAT for the specified user. Returns the raw token ONCE.
    """
    tenant_slug, tenant, caller_email, err = _require_tenant_admin(event)
    if err:
        return err

    tenant_id = str(tenant["id"])

    # ── Parse body ──
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return response(400, {
            "error": "INVALID_BODY",
            "message": "Request body must be valid JSON",
        })

    # ── Validate name ──
    name = body.get("name", "").strip()
    if not name or len(name) < 2 or len(name) > 100:
        return response(400, {
            "error": "INVALID_NAME",
            "message": "name is required (2-100 characters)",
        })

    # ── Validate userId ──
    user_id = body.get("userId", "").strip()
    if not user_id:
        return response(400, {
            "error": "MISSING_USER_ID",
            "message": "userId (cognito_sub) is required",
        })

    # Verify user belongs to this tenant
    users = db.list_tenant_users(tenant_id)
    target_user = None
    for u in users:
        if u["cognito_sub"] == user_id:
            target_user = u
            break

    if not target_user:
        return response(404, {
            "error": "USER_NOT_FOUND",
            "message": "User not found in this tenant",
        })

    # ── Validate scopes ──
    scopes = body.get("scopes", [])
    if not isinstance(scopes, list) or not scopes:
        return response(400, {
            "error": "INVALID_SCOPES",
            "message": "scopes must be a non-empty array of strings",
        })
    invalid_scopes = [s for s in scopes if s not in KNOWN_SCOPES]
    if invalid_scopes:
        return response(400, {
            "error": "UNKNOWN_SCOPES",
            "message": f"Unknown scopes: {', '.join(invalid_scopes)}",
            "knownScopes": sorted(KNOWN_SCOPES),
        })

    # ── Validate expiry ──
    expires_in_days = body.get("expiresInDays")
    expires_at = None
    if expires_in_days is not None:
        try:
            days = int(expires_in_days)
            if days < 1 or days > 365:
                return response(400, {
                    "error": "INVALID_EXPIRY",
                    "message": "expiresInDays must be between 1 and 365",
                })
            from datetime import datetime, timedelta, timezone
            expires_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        except (ValueError, TypeError):
            return response(400, {
                "error": "INVALID_EXPIRY",
                "message": "expiresInDays must be an integer",
            })

    # ── Generate token ──
    raw_token = "saas_pat_" + uuid.uuid4().hex
    token_hash = db.hash_token(raw_token)
    token_prefix = raw_token[:20]  # "saas_pat_" (9 chars) + first 11 hex chars

    try:
        row = db.create_pat(
            token_hash=token_hash,
            token_prefix=token_prefix,
            name=name,
            tenant_id=tenant_id,
            user_id=user_id,
            user_email=target_user["email"],
            user_role=target_user["role"],
            scopes=scopes,
            created_by=caller_email,
            expires_at=expires_at,
        )
    except Exception as e:
        if "idx_pat_name_tenant" in str(e) or "duplicate key" in str(e).lower():
            return response(409, {
                "error": "DUPLICATE_NAME",
                "message": f"An active key named '{name}' already exists",
            })
        print(f"[PAT] Create error: {e}")
        return response(500, {
            "error": "INTERNAL_ERROR",
            "message": f"Failed to create PAT: {str(e)}",
        })

    print(f"[PAT] Created '{name}' for {target_user['email']} in {tenant_slug} by {caller_email}")

    return response(201, {
        "apiKey": raw_token,  # Shown ONCE — never stored or returned again
        "name": name,
        "tokenPrefix": token_prefix,
        "userId": user_id,
        "userEmail": target_user["email"],
        "userRole": target_user["role"],
        "scopes": scopes,
        "expiresAt": str(row["expires_at"]) if row["expires_at"] else None,
        "createdAt": str(row["created_at"]),
        "createdBy": caller_email,
        "message": "Copy this API key now — it will not be shown again.",
    })


# ═════════════════════════════════════════════════════
# ROUTE 5: LIST PATs
# ═════════════════════════════════════════════════════

def handle_list_pats(event):
    """
    GET /api-keys
    Header: Authorization: Bearer <tenant_admin_access_token>

    Returns all PATs for the caller's tenant. Never returns hash or raw token.
    """
    tenant_slug, tenant, caller_email, err = _require_tenant_admin(event)
    if err:
        return err

    keys = db.list_pats(str(tenant["id"]))

    print(f"[PAT] Listed {len(keys)} keys for {tenant_slug}")

    return response(200, {
        "keys": [
            {
                "tokenPrefix": k["token_prefix"],
                "name": k["name"],
                "userId": k["user_id"],
                "userEmail": k["user_email"],
                "userRole": k["user_role"],
                "scopes": k["scopes"],
                "status": k["status"],
                "createdBy": k["created_by"],
                "lastUsedAt": str(k["last_used_at"]) if k["last_used_at"] else None,
                "expiresAt": str(k["expires_at"]) if k["expires_at"] else None,
                "createdAt": str(k["created_at"]),
            }
            for k in keys
        ],
        "total": len(keys),
    })


# ═════════════════════════════════════════════════════
# ROUTE 6: REVOKE PAT
# ═════════════════════════════════════════════════════

def handle_revoke_pat(event):
    """
    DELETE /api-keys/{prefix}
    Header: Authorization: Bearer <tenant_admin_access_token>

    Revokes a PAT by its token prefix. The key immediately stops working.
    """
    tenant_slug, tenant, caller_email, err = _require_tenant_admin(event)
    if err:
        return err

    # Extract prefix from path: /api-keys/{prefix}
    path = event.get("path", "")
    parts = path.strip("/").split("/")
    if len(parts) < 2:
        return response(400, {
            "error": "MISSING_PREFIX",
            "message": "Token prefix is required in the URL path",
        })
    token_prefix = parts[-1]

    revoked = db.revoke_pat(token_prefix, str(tenant["id"]))
    if not revoked:
        return response(404, {
            "error": "KEY_NOT_FOUND",
            "message": "API key not found or already revoked",
        })

    print(f"[PAT] Revoked {token_prefix} for {tenant_slug} by {caller_email}")

    return response(200, {
        "tokenPrefix": token_prefix,
        "status": "revoked",
        "message": "API key has been revoked and can no longer be used.",
    })


# ═════════════════════════════════════════════════════
# INVITE EMAIL
# ═════════════════════════════════════════════════════

def send_invite_email(from_email, to_email, tenant_name, tenant_slug, login_url):
    """Send workspace invite email via SES."""
    if not from_email:
        print("[EMAIL] No SES_FROM_EMAIL configured, skipping")
        return

    subject = f"You've been added to {tenant_name}"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }}
        .container {{ max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; color: white; }}
        .header h1 {{ margin: 0; font-size: 26px; }}
        .header p {{ margin: 10px 0 0; opacity: 0.9; }}
        .body {{ padding: 30px; }}
        .info-box {{ background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }}
        .info-row {{ display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e9ecef; }}
        .info-row:last-child {{ border-bottom: none; }}
        .info-label {{ color: #666; font-size: 14px; }}
        .info-value {{ font-weight: 600; color: #333; font-size: 14px; }}
        .btn {{ display: inline-block; padding: 14px 32px; background: #4F46E5; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px 0; }}
        .steps {{ margin: 20px 0; }}
        .step {{ padding: 8px 0; padding-left: 30px; position: relative; }}
        .step:before {{ content: attr(data-step); position: absolute; left: 0; width: 22px; height: 22px; background: #4F46E5; color: white; border-radius: 50%; text-align: center; line-height: 22px; font-size: 12px; font-weight: 700; }}
        .footer {{ padding: 20px 30px; text-align: center; color: #999; font-size: 13px; border-top: 1px solid #eee; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>You've been added to {tenant_name}</h1>
          <p>Your account is ready — no password required</p>
        </div>
        <div class="body">
          <p>Hi {to_email},</p>
          <p>An admin has added you to the <strong>{tenant_name}</strong> workspace. You can log in right away using your email — no password needed.</p>

          <div class="info-box">
            <div class="info-row">
              <span class="info-label">Workspace</span>
              <span class="info-value">{tenant_name}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Login URL</span>
              <span class="info-value">{login_url}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Your Email</span>
              <span class="info-value">{to_email}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Authentication</span>
              <span class="info-value">Passwordless (Email OTP)</span>
            </div>
          </div>

          <p><strong>How to log in:</strong></p>
          <div class="steps">
            <div class="step" data-step="1">Visit <a href="{login_url}">{login_url}</a></div>
            <div class="step" data-step="2">Enter your email: {to_email}</div>
            <div class="step" data-step="3">Enter the verification code sent to your inbox</div>
            <div class="step" data-step="4">You're in! 🚀</div>
          </div>

          <div style="text-align: center;">
            <a href="{login_url}" class="btn">Access {tenant_name} →</a>
          </div>

          <p>If you weren't expecting this invite, you can safely ignore this email.</p>
          <p>— The Motadata Team</p>
        </div>
        <div class="footer">
          © 2026 Motadata. All rights reserved.
        </div>
      </div>
    </body>
    </html>
    """

    text_body = f"""
You've been added to {tenant_name}!

Login URL:  {login_url}
Your Email: {to_email}
Auth:       Passwordless (Email OTP)

How to log in:
1. Visit {login_url}
2. Enter your email
3. Enter the verification code sent to your inbox
4. You're in!

If you weren't expecting this invite, you can safely ignore this email.

— The Motadata Team
    """

    ses.send_email(
        Source=from_email,
        Destination={"ToAddresses": [to_email]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {
                "Html": {"Data": html_body, "Charset": "UTF-8"},
                "Text": {"Data": text_body, "Charset": "UTF-8"},
            },
        },
    )


# ═════════════════════════════════════════════════════
# ROUTER
# ═════════════════════════════════════════════════════

def lambda_handler(event, context):
    method = event.get("httpMethod", "")
    path = event.get("path", "")
    print(f"[ROUTER] {method} {path}")

    if method == "OPTIONS":
        return response(200, {})

    # ── Legacy routes ──
    if method == "POST" and path == "/sync/api-key/generate":
        return handle_generate_api_key(event)

    if method == "POST" and path == "/users/create":
        return handle_create_user(event)

    # ── PAT management routes (Bearer token + tenant_admin) ──
    if method == "GET" and path == "/api-keys/users":
        return handle_list_tenant_users(event)

    if method == "POST" and path == "/api-keys":
        return handle_create_pat(event)

    if method == "GET" and path == "/api-keys":
        return handle_list_pats(event)

    if method == "DELETE" and path.startswith("/api-keys/"):
        return handle_revoke_pat(event)

    return response(404, {"error": "NOT_FOUND", "message": f"Route {method} {path} not found"})
