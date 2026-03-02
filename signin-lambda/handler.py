"""
Signin Lambda — Tenant Login

Used by: acme-corp.motadata.com (tenant subdomains)
Handles: Scenarios 5, 6

Routes:
  POST /signin/send-otp     → Validate user belongs + send OTP
  POST /signin/verify-otp   → Verify OTP + return dashboard tokens
  GET  /signin/tenant-info  → Get tenant info for branded login page
"""

import os
import json
import re
import base64
import urllib.request
import urllib.parse
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
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        },
        "body": json.dumps(body, default=str),
    }


EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

cognito = boto3.client("cognito-idp")
s3 = boto3.client("s3")


# ═════════════════════════════════════════════════════
# ROUTE 1: SEND OTP (TENANT LOGIN)
# ═════════════════════════════��═══════════════════════

def handle_send_otp(event):
    """
    POST /signin/send-otp
    Body: { "email": "user@acme.com", "tenantSlug": "acme-corp" }

    DIFFERENCES FROM ONBOARDING:
      - NEVER creates new users
      - Validates user belongs to this specific tenant
      - Uses tenant's own Cognito client (not shared signup client)
      - Rejects users from other tenants
    """
    try:
        body = json.loads(event.get("body", "{}"))
        email = body.get("email", "").strip().lower()
        tenant_slug = body.get("tenantSlug", "").strip().lower()

        if not email or not EMAIL_REGEX.match(email):
            return response(400, {"error": "INVALID_EMAIL"})

        if not tenant_slug:
            return response(400, {
                "error": "MISSING_TENANT",
                "message": "Tenant slug is required for signin",
            })

        user_pool_id = os.environ["COGNITO_USER_POOL_ID"]

        print(f"[SIGNIN-OTP] Email: {email}, Tenant: {tenant_slug}")

        # ── Step 1: Get tenant from PG ──
        tenant = db.get_tenant_by_slug(tenant_slug)
        if not tenant:
            return response(404, {
                "error": "TENANT_NOT_FOUND",
                "message": "This workspace does not exist",
            })

        tenant_client_id = tenant.get("cognito_client_id")
        if not tenant_client_id:
            return response(500, {
                "error": "TENANT_NOT_CONFIGURED",
                "message": "Workspace is not properly configured",
            })

        # ── Step 2: Check user exists in Cognito ──
        try:
            user_info = cognito.admin_get_user(
                UserPoolId=user_pool_id,
                Username=email,
            )
        except cognito.exceptions.UserNotFoundException:
            return response(403, {
                "error": "USER_NOT_FOUND",
                "message": "No account found for this workspace. Contact your admin.",
            })

        # ── Step 3: Check user belongs to THIS tenant ──
        user_tenant = ""
        for attr in user_info.get("UserAttributes", []):
            if attr["Name"] == "custom:tenant_id":
                user_tenant = attr["Value"]

        if not user_tenant:
            return response(403, {
                "error": "NO_WORKSPACE",
                "message": "This email is not associated with any workspace.",
            })

        if user_tenant != tenant_slug:
            return response(403, {
                "error": "WRONG_WORKSPACE",
                "message": f"This email belongs to a different workspace. Try {user_tenant}.{os.environ.get('APP_DOMAIN', 'motadata.com')}",
            })

        print(f"[SIGNIN-OTP] User belongs to {tenant_slug} ✅, sending OTP")

        # ── Step 4: Send OTP using TENANT'S client ──
        auth_response = cognito.initiate_auth(
            ClientId=tenant_client_id,
            AuthFlow="USER_AUTH",
            AuthParameters={
                "USERNAME": email,
                "PREFERRED_CHALLENGE": "EMAIL_OTP",
            },
        )

        session = auth_response.get("Session", "")

        return response(200, {
            "message": f"Verification code sent to {email}",
            "email": email,
            "session": session,
            "tenantSlug": tenant_slug,
            "tenantName": tenant.get("name", ""),
        })

    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})
    except Exception as e:
        print(f"[SIGNIN-OTP] ERROR: {str(e)}")
        return response(500, {"error": "SIGNIN_OTP_FAILED", "message": str(e)})


# ═════════════════════════════════════════════════════
# ROUTE 2: VERIFY OTP (TENANT LOGIN)
# ═════════════════════════════════════════════════════

def handle_verify_otp(event):
    """
    POST /signin/verify-otp
    Body: { "email", "otp", "session", "tenantSlug" }

    Returns tokens for dashboard access.
    """
    try:
        body = json.loads(event.get("body", "{}"))
        email = body.get("email", "").strip().lower()
        otp = body.get("otp", "").strip()
        session = body.get("session", "")
        tenant_slug = body.get("tenantSlug", "").strip().lower()

        if not email or not otp or not session or not tenant_slug:
            return response(400, {"error": "MISSING_FIELDS"})
        if len(otp) != 8 or not otp.isdigit():
            return response(400, {"error": "INVALID_OTP", "message": "Code must be 8 digits"})

        print(f"[SIGNIN-VERIFY] Email: {email}, Tenant: {tenant_slug}")

        # ── Get tenant client ID ──
        tenant = db.get_tenant_by_slug(tenant_slug)
        if not tenant:
            return response(404, {"error": "TENANT_NOT_FOUND"})

        tenant_client_id = tenant.get("cognito_client_id")
        if not tenant_client_id:
            return response(500, {"error": "TENANT_NOT_CONFIGURED"})

        # ── Verify OTP using TENANT'S client ──
        auth_result = cognito.respond_to_auth_challenge(
            ClientId=tenant_client_id,
            ChallengeName="EMAIL_OTP",
            Session=session,
            ChallengeResponses={
                "USERNAME": email,
                "EMAIL_OTP_CODE": otp,
            },
        )

        tokens = auth_result.get("AuthenticationResult", {})
        access_token = tokens.get("AccessToken")

        if not access_token:
            return response(400, {"error": "VERIFICATION_FAILED"})

        # ── Get user role from PG ──
        tenant_id = str(tenant["id"])
        user = db.get_tenant_user(tenant_id, email)
        user_role = user.get("role", "user") if user else "user"

        app_domain = os.environ.get("APP_DOMAIN", "motadata.com")

        print(f"[SIGNIN-VERIFY] ✅ {email} | tenant: {tenant_slug} | role: {user_role}")

        return response(200, {
            "verified": True,
            "email": email,
            "accessToken": access_token,
            "idToken": tokens.get("IdToken", ""),
            "refreshToken": tokens.get("RefreshToken", ""),
            "tenantSlug": tenant_slug,
            "tenantName": tenant.get("name", ""),
            "tenantPlan": tenant.get("plan", ""),
            "role": user_role,
            "dashboardUrl": f"https://{tenant_slug}.{app_domain}/dashboard",
        })

    except cognito.exceptions.CodeMismatchException:
        return response(400, {"error": "WRONG_OTP", "message": "Incorrect code"})
    except cognito.exceptions.ExpiredCodeException:
        return response(400, {"error": "OTP_EXPIRED", "message": "Code expired"})
    except cognito.exceptions.NotAuthorizedException:
        return response(400, {"error": "SESSION_EXPIRED", "message": "Session expired"})
    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})
    except Exception as e:
        print(f"[SIGNIN-VERIFY] ERROR: {str(e)}")
        return response(500, {"error": "VERIFY_FAILED", "message": str(e)})


# ═════════════════════════════════════════════════════
# ROUTE 3: TENANT INFO (FOR BRANDED LOGIN PAGE)
# ═════════════════════════════════════════════════════

def handle_tenant_info(event):
    """
    GET /signin/tenant-info?slug=bigdata

    Returns tenant details + S3 branding config for the branded login page.
    Called by React on page load at bigdata.nextgendevacademy.com
    """
    params = event.get("queryStringParameters") or {}
    slug = params.get("slug", "").strip().lower()

    if not slug:
        return response(400, {"error": "MISSING_SLUG"})

    tenant = db.get_tenant_by_slug(slug)
    if not tenant:
        return response(404, {
            "error": "TENANT_NOT_FOUND",
            "message": "This workspace does not exist",
        })

    app_domain = os.environ.get("APP_DOMAIN", "nextgendevacademy.com")

    # ── Fetch branding from S3 ──
    branding = {}
    bucket = os.environ.get("TENANT_ASSETS_BUCKET", "")
    if bucket:
        try:
            obj = s3.get_object(Bucket=bucket, Key=f"branding/{slug}.json")
            branding = json.loads(obj["Body"].read().decode("utf-8"))
        except s3.exceptions.NoSuchKey:
            print(f"[TENANT-INFO] No branding file found for {slug}, using defaults")
        except Exception as e:
            print(f"[TENANT-INFO] WARNING: Could not fetch branding from S3: {str(e)}")

    # ── Fetch IDP config ──
    idp = None
    try:
        idp = db.get_idp_config(str(tenant["id"]))
    except Exception as e:
        print(f"[TENANT-INFO] WARNING: Could not fetch IDP config: {str(e)}")

    return response(200, {
        "tenantSlug": tenant["slug"],
        "tenantName": branding.get("displayName") or tenant["name"],
        "plan": tenant["plan"],
        "status": tenant["status"],
        "loginUrl": f"https://{slug}.{app_domain}",
        # Branding fields consumed by TenantContext.js
        "primaryColor": branding.get("primaryColor", "#4F46E5"),
        "logoUrl": branding.get("logoUrl", ""),
        "welcomeMessage": branding.get("welcomeMessage", ""),
        "backgroundValue": branding.get("backgroundValue", ""),
        "secondaryColor": branding.get("secondaryColor", "#FFFFFF"),
        # Cognito Hosted UI fields (for PKCE / SSO redirect)
        "cognitoClientId": tenant.get("cognito_client_id", ""),
        "cognitoDomain": os.environ.get("COGNITO_DOMAIN", ""),
        # IDP / SSO fields
        "idpType": idp["idp_type"] if idp else None,
        "idpDisplayName": idp["display_name"] if idp else None,
        "cognitoIdpName": idp["cognito_idp_name"] if idp else None,
        "cognitoLoginEnabled": idp["cognito_login_enabled"] if idp else True,
        "ssoLoginEnabled": idp["sso_login_enabled"] if idp else False,
    })


# ═════════════════════════════════════════════════════
# ROUTE 4: FEDERATED VERIFY (SSO CALLBACK)
# ═════════════════════════════════════════════════════

def handle_federated_verify(event):
    """
    POST /signin/federated-verify
    Body: { code, tenantSlug, codeVerifier, redirectUri }

    Called by OAuthCallbackPage after Cognito Hosted UI redirects back.
    Exchanges the auth code for tokens, validates tenant isolation,
    and JIT-provisions the user in tenant_users on first login.
    """
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})

    code = body.get("code", "").strip()
    tenant_slug = body.get("tenantSlug", "").strip().lower()
    code_verifier = body.get("codeVerifier", "").strip()
    redirect_uri = body.get("redirectUri", "").strip()

    if not code or not tenant_slug or not code_verifier or not redirect_uri:
        return response(400, {"error": "MISSING_FIELDS", "message": "code, tenantSlug, codeVerifier, redirectUri are required"})

    tenant = db.get_tenant_by_slug(tenant_slug)
    if not tenant:
        return response(404, {"error": "TENANT_NOT_FOUND"})

    idp = db.get_idp_config(str(tenant["id"]))
    if not idp or not idp.get("sso_login_enabled"):
        return response(400, {"error": "SSO_NOT_ENABLED", "message": "SSO is not configured for this workspace"})

    cognito_domain = os.environ.get("COGNITO_DOMAIN", "")
    user_pool_id = os.environ["COGNITO_USER_POOL_ID"]
    app_domain = os.environ.get("APP_DOMAIN", "motadata.com")

    # ── Exchange auth code for tokens ──
    token_data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "client_id": tenant["cognito_client_id"],
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
    }).encode()

    try:
        req = urllib.request.Request(
            f"{cognito_domain}/oauth2/token",
            data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            token_response = json.loads(resp.read().decode())
    except Exception as e:
        print(f"[FEDERATED-VERIFY] Code exchange failed: {str(e)}")
        return response(400, {"error": "CODE_EXCHANGE_FAILED", "message": str(e)})

    access_token = token_response.get("access_token")
    id_token = token_response.get("id_token")
    refresh_token = token_response.get("refresh_token", "")

    if not id_token or not access_token:
        return response(400, {"error": "NO_ID_TOKEN"})

    # ── Decode id_token payload (no sig verification — Cognito issued it to our client) ──
    try:
        parts = id_token.split(".")
        padding = "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + padding).decode())
    except Exception as e:
        return response(400, {"error": "TOKEN_DECODE_FAILED", "message": str(e)})

    email = payload.get("email", "").lower()
    sub = payload.get("sub", "")
    aud = payload.get("aud", "")
    cognito_username = payload.get("cognito:username", "") or email

    if not email:
        return response(400, {"error": "EMAIL_MISSING", "message": "IDP did not return an email address"})

    # ── Verify token is for THIS tenant's App Client ──
    if aud != tenant["cognito_client_id"]:
        return response(403, {"error": "TOKEN_MISMATCH", "message": "Token not issued for this workspace"})

    # ── Check tenant membership via the access_token ──
    try:
        user_info = cognito.get_user(AccessToken=access_token)
        existing_tenant_id = ""
        for attr in user_info.get("UserAttributes", []):
            if attr["Name"] == "custom:tenant_id":
                existing_tenant_id = attr["Value"]

        if existing_tenant_id and existing_tenant_id != tenant_slug:
            return response(403, {
                "error": "WRONG_WORKSPACE",
                "message": f"This account belongs to workspace '{existing_tenant_id}'",
            })
    except Exception as e:
        print(f"[FEDERATED-VERIFY] get_user warning: {str(e)}")
        existing_tenant_id = ""

    # ── JIT: set tenant attributes on first federated login ──
    if not existing_tenant_id:
        try:
            cognito.admin_update_user_attributes(
                UserPoolId=user_pool_id,
                Username=cognito_username,
                UserAttributes=[
                    {"Name": "custom:tenant_id", "Value": tenant_slug},
                    {"Name": "custom:role", "Value": "user"},
                ],
            )
        except Exception as e:
            print(f"[FEDERATED-VERIFY] WARNING: Could not set tenant attributes: {str(e)}")

    # ── Upsert user in tenant_users ──
    try:
        db.upsert_tenant_user_by_sub(str(tenant["id"]), sub, email, "user")
    except Exception as e:
        print(f"[FEDERATED-VERIFY] WARNING: upsert tenant_user failed: {str(e)}")

    # ── Get final role from DB ──
    user = db.get_tenant_user(str(tenant["id"]), email)
    user_role = user.get("role", "user") if user else "user"

    print(f"[FEDERATED-VERIFY] ✅ {email} | tenant: {tenant_slug} | role: {user_role}")

    return response(200, {
        "verified": True,
        "email": email,
        "accessToken": access_token,
        "idToken": id_token,
        "refreshToken": refresh_token,
        "tenantSlug": tenant_slug,
        "tenantName": tenant.get("name", ""),
        "tenantPlan": tenant.get("plan", ""),
        "role": user_role,
        "authMethod": "SSO",
        "dashboardUrl": f"https://{tenant_slug}.{app_domain}/dashboard",
    })


# ═════════════════════════════════════════════════════
# ROUTER
# ═════════════════════════════════════════════════════

def lambda_handler(event, context):
    method = event.get("httpMethod", "")
    path = event.get("path", "")
    print(f"[ROUTER] {method} {path}")

    if method == "OPTIONS":
        return response(200, {})

    if method == "POST" and path == "/signin/send-otp":
        return handle_send_otp(event)
    if method == "POST" and path == "/signin/verify-otp":
        return handle_verify_otp(event)
    if method == "GET" and path == "/signin/tenant-info":
        return handle_tenant_info(event)
    if method == "POST" and path == "/signin/federated-verify":
        return handle_federated_verify(event)

    return response(404, {"error": "NOT_FOUND"})