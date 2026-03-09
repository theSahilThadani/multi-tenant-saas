"""
Onboarding Lambda — Smart Flow

Used by: motadata.com (main site)
Handles: Scenarios 1, 2, 3, 4

Routes:
  POST /auth/send-otp         → Send OTP + check if user has tenant
  POST /auth/verify-otp       → Verify OTP + return tenant info
  POST /auth/google-verify    → Google OAuth code → Cognito tokens
  GET  /onboarding/check-slug → Check slug availability
  POST /onboarding/tenant     → Create workspace + welcome email
  POST /magic-link/generate   → Generate & send magic link email
  POST /magic-link/verify     → Verify magic link → Cognito tokens
  POST /demo/approvals        → Create demo approval request
  GET  /demo/approvals/{id}   → Get approval details
  POST /demo/approvals/{id}/decide → Approve or reject
  POST /demo/approvals/{id}/notify → Send magic link to approver
"""

import os
import json
import re
import uuid
import base64
import secrets
import urllib.request
import urllib.parse
import boto3

import db

import magic_link


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


SLUG_REGEX = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

cognito = boto3.client("cognito-idp")
s3 = boto3.client("s3")
ses = boto3.client("ses")


# ═════════════════════════════════════════════════════
# ROUTE 1: SEND OTP
# ═════════════════════════════════════════════════════

def handle_send_otp(event):
    """
    POST /auth/send-otp
    Body: { "email": "user@example.com" }

    - Creates user in Cognito if not exists
    - Sends OTP
    - Returns hasTenant so React knows: signup or redirect
    """
    try:
        body = json.loads(event.get("body", "{}"))
        email = body.get("email", "").strip().lower()

        if not email or not EMAIL_REGEX.match(email):
            return response(400, {
                "error": "INVALID_EMAIL",
                "message": "Please enter a valid email address",
            })

        user_pool_id = os.environ["COGNITO_USER_POOL_ID"]
        signup_client_id = os.environ["SIGNUP_CLIENT_ID"]

        print(f"[SEND-OTP] Email: {email}")

        # ── Check if user exists ──
        user_exists = False
        has_tenant = False
        tenant_slug = ""

        try:
            existing_user = cognito.admin_get_user(
                UserPoolId=user_pool_id,
                Username=email,
            )
            user_exists = True

            for attr in existing_user.get("UserAttributes", []):
                if attr["Name"] == "custom:tenant_id" and attr["Value"]:
                    has_tenant = True
                    tenant_slug = attr["Value"]

            print(f"[SEND-OTP] Exists: {user_exists}, Tenant: {has_tenant}, Slug: {tenant_slug}")

        except cognito.exceptions.UserNotFoundException:
            user_exists = False
            print(f"[SEND-OTP] New user")

        # ── Create user if not exists ──
        if not user_exists:
            cognito.admin_create_user(
                UserPoolId=user_pool_id,
                Username=email,
                UserAttributes=[
                    {"Name": "email", "Value": email},
                    {"Name": "email_verified", "Value": "true"},
                ],
                MessageAction="SUPPRESS",
            )
            print(f"[SEND-OTP] Created: {email}")

        # ── Send OTP ──
        auth_response = cognito.initiate_auth(
            ClientId=signup_client_id,
            AuthFlow="USER_AUTH",
            AuthParameters={
                "USERNAME": email,
                "PREFERRED_CHALLENGE": "EMAIL_OTP",
            },
        )

        session = auth_response.get("Session", "")
        print(f"[SEND-OTP] OTP sent to {email}")

        return response(200, {
            "message": f"Verification code sent to {email}",
            "email": email,
            "session": session,
            "hasTenant": has_tenant,
            "tenantSlug": tenant_slug,
        })

    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})
    except Exception as e:
        print(f"[SEND-OTP] ERROR: {str(e)}")
        return response(500, {"error": "OTP_SEND_FAILED", "message": str(e)})


# ═════════════════════════════════════════════════════
# ROUTE 2: VERIFY OTP
# ═════════════════════════════════════════════════════

def handle_verify_otp(event):
    """
    POST /auth/verify-otp
    Body: { "email", "otp", "session" }

    Returns tenant info so React knows: show signup or welcome-back
    """
    try:
        body = json.loads(event.get("body", "{}"))
        email = body.get("email", "").strip().lower()
        otp = body.get("otp", "").strip()
        session = body.get("session", "")

        if not email or not otp or not session:
            return response(400, {"error": "MISSING_FIELDS"})
        if len(otp) != 8 or not otp.isdigit():
            return response(400, {"error": "INVALID_OTP", "message": "Code must be 8 digits"})

        signup_client_id = os.environ["SIGNUP_CLIENT_ID"]
        user_pool_id = os.environ["COGNITO_USER_POOL_ID"]
        app_domain = os.environ.get("APP_DOMAIN", "example.com")

        print(f"[VERIFY-OTP] Email: {email}")

        # ── Verify OTP ──
        auth_result = cognito.respond_to_auth_challenge(
            ClientId=signup_client_id,
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

        # ── Check tenant from Cognito ──
        has_tenant = False
        tenant_slug = ""
        tenant_name = ""
        tenant_plan = ""
        tenant_role = ""
        login_url = ""

        try:
            user_info = cognito.admin_get_user(
                UserPoolId=user_pool_id,
                Username=email,
            )

            for attr in user_info.get("UserAttributes", []):
                if attr["Name"] == "custom:tenant_id" and attr["Value"]:
                    has_tenant = True
                    tenant_slug = attr["Value"]
                if attr["Name"] == "custom:role" and attr["Value"]:
                    tenant_role = attr["Value"]

            # ── Get tenant details from PostgreSQL ──
            if has_tenant and tenant_slug:
                tenant = db.get_tenant_by_slug(tenant_slug)
                if tenant:
                    tenant_name = tenant.get("name", "")
                    tenant_plan = tenant.get("plan", "")
                    login_url = f"https://{tenant_slug}.{app_domain}"
                else:
                    # Tenant in Cognito but not in PG — shouldn't happen
                    print(f"[VERIFY-OTP] WARNING: Tenant {tenant_slug} not found in PG")
                    has_tenant = False
                    tenant_slug = ""

        except Exception as e:
            print(f"[VERIFY-OTP] Tenant check warning: {str(e)}")

        print(f"[VERIFY-OTP] ✅ {email} | hasTenant: {has_tenant} | slug: {tenant_slug}")

        return response(200, {
            "verified": True,
            "email": email,
            "accessToken": access_token,
            "idToken": tokens.get("IdToken", ""),
            "refreshToken": tokens.get("RefreshToken", ""),
            "hasTenant": has_tenant,
            "tenantSlug": tenant_slug,
            "tenantName": tenant_name,
            "tenantPlan": tenant_plan,
            "tenantRole": tenant_role,
            "loginUrl": login_url,
        })

    except cognito.exceptions.CodeMismatchException:
        return response(400, {"error": "WRONG_OTP", "message": "Incorrect code"})
    except cognito.exceptions.ExpiredCodeException:
        return response(400, {"error": "OTP_EXPIRED", "message": "Code expired. Request new one."})
    except cognito.exceptions.NotAuthorizedException:
        return response(400, {"error": "SESSION_EXPIRED", "message": "Session expired. Request new OTP."})
    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})
    except Exception as e:
        print(f"[VERIFY-OTP] ERROR: {str(e)}")
        return response(500, {"error": "VERIFY_FAILED", "message": str(e)})


# ═════════════════════════════════════════════════════
# ROUTE 3: GOOGLE VERIFY (Direct OAuth — no Cognito federation)
# ═════════════════════════════════════════════════════

def handle_google_verify(event):
    """
    POST /auth/google-verify
    Body: { code, redirectUri }

    Frontend redirects user to Google consent screen (accounts.google.com).
    Google redirects back with an auth code. Frontend sends that code here.

    Backend:
      1. Exchanges code for Google tokens (googleapis.com/token)
      2. Verifies Google ID token (iss, aud, email_verified)
      3. Creates user in Cognito with email as username (if not exists)
      4. Issues Cognito tokens via admin_initiate_auth
      5. Checks if user already has a workspace (custom:tenant_id)

    Returns same shape as handle_verify_otp so frontend routing is identical.
    """
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})

    code = body.get("code", "").strip()
    redirect_uri = body.get("redirectUri", "").strip()

    if not code or not redirect_uri:
        return response(400, {
            "error": "MISSING_FIELDS",
            "message": "code and redirectUri are required",
        })

    google_client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    google_client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    user_pool_id = os.environ["COGNITO_USER_POOL_ID"]
    signup_client_id = os.environ["SIGNUP_CLIENT_ID"]
    app_domain = os.environ.get("APP_DOMAIN", "example.com")

    if not google_client_id or not google_client_secret:
        return response(500, {"error": "CONFIG_ERROR", "message": "Google OAuth not configured"})

    # ── Step 1: Exchange Google auth code for tokens ──
    token_data = urllib.parse.urlencode({
        "code": code,
        "client_id": google_client_id,
        "client_secret": google_client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode()

    try:
        req = urllib.request.Request(
            "https://oauth2.googleapis.com/token",
            data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            google_tokens = json.loads(resp.read().decode())
    except Exception as e:
        print(f"[GOOGLE-VERIFY] Code exchange failed: {str(e)}")
        return response(400, {"error": "CODE_EXCHANGE_FAILED", "message": str(e)})

    google_id_token = google_tokens.get("id_token")
    if not google_id_token:
        return response(400, {"error": "NO_ID_TOKEN", "message": "Google did not return an id_token"})

    # ── Step 2: Decode and verify Google ID token ──
    try:
        parts = google_id_token.split(".")
        padding = "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + padding).decode())
    except Exception as e:
        return response(400, {"error": "TOKEN_DECODE_FAILED", "message": str(e)})

    # Verify token claims
    if payload.get("iss") not in ("https://accounts.google.com", "accounts.google.com"):
        return response(400, {"error": "INVALID_ISSUER", "message": "Token not issued by Google"})
    if payload.get("aud") != google_client_id:
        return response(400, {"error": "INVALID_AUDIENCE", "message": "Token audience mismatch"})
    if not payload.get("email_verified"):
        return response(400, {"error": "EMAIL_NOT_VERIFIED", "message": "Google email is not verified"})

    email = payload.get("email", "").strip().lower()
    if not email:
        return response(400, {"error": "EMAIL_MISSING", "message": "Google did not return an email"})

    print(f"[GOOGLE-VERIFY] Verified Google email: {email}")

    # ── Step 3: Create user in Cognito if not exists (email as username) ──
    user_exists = False
    has_tenant = False
    tenant_slug = ""

    try:
        existing_user = cognito.admin_get_user(
            UserPoolId=user_pool_id, Username=email)
        user_exists = True

        for attr in existing_user.get("UserAttributes", []):
            if attr["Name"] == "custom:tenant_id" and attr["Value"]:
                has_tenant = True
                tenant_slug = attr["Value"]

        print(f"[GOOGLE-VERIFY] User exists: {user_exists}, hasTenant: {has_tenant}")

    except cognito.exceptions.UserNotFoundException:
        user_exists = False
        print(f"[GOOGLE-VERIFY] New user, creating in Cognito")

    if not user_exists:
        cognito.admin_create_user(
            UserPoolId=user_pool_id,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
            ],
            MessageAction="SUPPRESS",
        )
        print(f"[GOOGLE-VERIFY] Created Cognito user: {email}")

    # ── Step 4: Issue Cognito tokens via admin auth ──
    temp_password = secrets.token_urlsafe(32) + "!Aa1"
    try:
        cognito.admin_set_user_password(
            UserPoolId=user_pool_id,
            Username=email,
            Password=temp_password,
            Permanent=True,
        )

        auth_result = cognito.admin_initiate_auth(
            UserPoolId=user_pool_id,
            ClientId=signup_client_id,
            AuthFlow="ADMIN_USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": email,
                "PASSWORD": temp_password,
            },
        )

        tokens = auth_result.get("AuthenticationResult", {})
        access_token = tokens.get("AccessToken")
        id_token_cognito = tokens.get("IdToken", "")
        refresh_token = tokens.get("RefreshToken", "")

        if not access_token:
            return response(500, {"error": "AUTH_FAILED", "message": "Could not issue Cognito tokens"})

    except Exception as e:
        print(f"[GOOGLE-VERIFY] Cognito auth failed: {str(e)}")
        return response(500, {"error": "AUTH_FAILED", "message": str(e)})

    # ── Step 5: Check tenant details (same as handle_verify_otp) ──
    tenant_name = ""
    tenant_plan = ""
    tenant_role = ""
    login_url = ""

    if has_tenant and tenant_slug:
        try:
            tenant = db.get_tenant_by_slug(tenant_slug)
            if tenant:
                tenant_name = tenant.get("name", "")
                tenant_plan = tenant.get("plan", "")
                login_url = f"https://{tenant_slug}.{app_domain}"
            else:
                print(f"[GOOGLE-VERIFY] WARNING: Tenant {tenant_slug} not in DB")
                has_tenant = False
                tenant_slug = ""
        except Exception as e:
            print(f"[GOOGLE-VERIFY] Tenant lookup warning: {str(e)}")

    try:
        user_info = cognito.admin_get_user(
            UserPoolId=user_pool_id, Username=email)
        for attr in user_info.get("UserAttributes", []):
            if attr["Name"] == "custom:role" and attr["Value"]:
                tenant_role = attr["Value"]
    except Exception:
        pass

    print(f"[GOOGLE-VERIFY] Done: {email} | hasTenant={has_tenant} | slug={tenant_slug}")

    return response(200, {
        "verified": True,
        "email": email,
        "accessToken": access_token,
        "idToken": id_token_cognito,
        "refreshToken": refresh_token,
        "hasTenant": has_tenant,
        "tenantSlug": tenant_slug,
        "tenantName": tenant_name,
        "tenantPlan": tenant_plan,
        "tenantRole": tenant_role,
        "loginUrl": login_url,
    })


# ═════════════════════════════════════════════════════
# ROUTE 4: CHECK SLUG
# ═════════════════════════════════════════════════════

def handle_check_slug(event):
    """GET /onboarding/check-slug?slug=xxx"""
    params = event.get("queryStringParameters") or {}
    slug = params.get("slug", "").strip().lower()

    if not slug or len(slug) < 3:
        return response(200, {"available": False, "reason": "TOO_SHORT"})
    if len(slug) > 30:
        return response(200, {"available": False, "reason": "TOO_LONG"})
    if not SLUG_REGEX.match(slug):
        return response(200, {"available": False, "reason": "INVALID_FORMAT"})

    available, reason = db.is_slug_available(slug)
    if available:
        return response(200, {"available": True, "slug": slug})
    else:
        return response(200, {
            "available": False,
            "reason": reason,
            "message": f'"{slug}" is {"reserved" if reason == "RESERVED" else "already taken"}',
        })


# ═════════════════════════════════════════════════════
# ROUTE 4: CREATE TENANT
# ═════════════════════════════════════════════════════

def handle_create_tenant(event):
    """
    POST /onboarding/tenant
    Body: { companyName, slug, plan, accessToken }

    10 Steps:
      1. Verify token → get email
      2. Check not already onboarded
      3. Validate input
      4. Check slug available
      5. Create tenant in PG (PENDING)
      6. Create Cognito App Client
      7. Update user attributes in Cognito
      8. Save user in PG
      9. Upload branding to S3
      10. Send welcome email via SES
      11. Activate tenant (ACTIVE)
    """
    app_domain = os.environ.get("APP_DOMAIN", "example.com")
    user_pool_id = os.environ["COGNITO_USER_POOL_ID"]
    bucket = os.environ["TENANT_ASSETS_BUCKET"]
    ses_from = os.environ.get("SES_FROM_EMAIL", "")

    created_cognito_client_id = None
    created_tenant_id = None

    try:
        body = json.loads(event.get("body", "{}"))
        company_name = body.get("companyName", "").strip()
        slug = body.get("slug", "").strip().lower()
        plan = body.get("plan", "free").strip().lower()
        access_token = body.get("accessToken", "")

        # ── STEP 1: VERIFY TOKEN ──
        if not access_token:
            return response(401, {"error": "NO_TOKEN"})

        print("[CREATE] Step 1: Verify token")
        try:
            user_info = cognito.get_user(AccessToken=access_token)
            admin_email = None
            cognito_sub = None
            for attr in user_info.get("UserAttributes", []):
                if attr["Name"] == "email":
                    admin_email = attr["Value"]
                if attr["Name"] == "sub":
                    cognito_sub = attr["Value"]
            if not cognito_sub:
                cognito_sub = user_info.get("Username", "")
            if not admin_email:
                return response(401, {"error": "NO_EMAIL"})
            print(f"[CREATE] Verified: {admin_email}")
        except Exception as e:
            return response(401, {"error": "INVALID_TOKEN", "message": str(e)})

        # ── STEP 2: CHECK NOT ALREADY ONBOARDED ──
        print("[CREATE] Step 2: Check existing")
        try:
            existing = cognito.admin_get_user(
                UserPoolId=user_pool_id, Username=admin_email)
            for attr in existing.get("UserAttributes", []):
                if attr["Name"] == "custom:tenant_id" and attr["Value"]:
                    return response(409, {
                        "error": "ALREADY_HAS_TENANT",
                        "message": "You already have a workspace",
                        "tenantSlug": attr["Value"],
                    })
        except Exception:
            pass

        # ── STEP 3: VALIDATE INPUT ──
        print("[CREATE] Step 3: Validate")
        errors = {}
        if not company_name or len(company_name) < 3:
            errors["companyName"] = "Must be at least 3 characters"
        if len(company_name) > 255:
            errors["companyName"] = "Too long"
        if not slug or not SLUG_REGEX.match(slug) or len(slug) < 3:
            errors["slug"] = "Invalid subdomain"
        if len(slug) > 30:
            errors["slug"] = "Too long"
        if plan not in ("free", "pro", "enterprise"):
            errors["plan"] = "Invalid plan"
        if errors:
            return response(400, {"error": "VALIDATION_ERROR", "details": errors})

        subdomain = f"{slug}.{app_domain}"
        print(f"[CREATE] {company_name} | {admin_email} | {slug}")

        # ── STEP 4: CHECK SLUG ──
        print("[CREATE] Step 4: Check slug")
        available, reason = db.is_slug_available(slug)
        if not available:
            return response(409, {"error": f"SLUG_{reason}"})

        # ── STEP 5: CREATE TENANT IN PG ──
        print("[CREATE] Step 5: Create tenant")
        api_key = uuid.uuid4().hex  # 32-char hex, unique per tenant
        tenant = db.create_tenant(company_name, slug, subdomain, plan, api_key)
        created_tenant_id = str(tenant["id"])

        # ── STEP 6: CREATE COGNITO CLIENT ──
        print("[CREATE] Step 6: Cognito client")
        cognito_domain = os.environ.get("COGNITO_DOMAIN", "")
        callback_url = f"https://{slug}.{app_domain}/auth/callback"
        logout_url = f"https://{slug}.{app_domain}/login"
        client_resp = cognito.create_user_pool_client(
            UserPoolId=user_pool_id,
            ClientName=f"{slug}-client",
            GenerateSecret=False,
            ExplicitAuthFlows=["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_CUSTOM_AUTH"],
            AccessTokenValidity=1,
            IdTokenValidity=1,
            RefreshTokenValidity=30,
            TokenValidityUnits={
                "AccessToken": "hours",
                "IdToken": "hours",
                "RefreshToken": "days",
            },
            PreventUserExistenceErrors="ENABLED",
            # Hosted UI / OAuth settings (required for SSO federation)
            AllowedOAuthFlows=["code"],
            AllowedOAuthScopes=["openid", "email", "profile"],
            AllowedOAuthFlowsUserPoolClient=True,
            CallbackURLs=[callback_url],
            LogoutURLs=[logout_url],
            SupportedIdentityProviders=["COGNITO"],
            WriteAttributes=["email", "email_verified", "name", "custom:tenant_id", "custom:role"],
            ReadAttributes=["email", "email_verified", "name", "sub", "custom:tenant_id", "custom:role"],
        )
        created_cognito_client_id = client_resp["UserPoolClient"]["ClientId"]
        db.update_tenant_client_id(created_tenant_id, created_cognito_client_id)
        print(f"[CREATE] Client: {created_cognito_client_id}")

        # ── STEP 7: UPDATE USER ATTRIBUTES ──
        print("[CREATE] Step 7: User attributes")
        cognito.admin_update_user_attributes(
            UserPoolId=user_pool_id,
            Username=admin_email,
            UserAttributes=[
                {"Name": "custom:tenant_id", "Value": slug},
                {"Name": "custom:role", "Value": "tenant_admin"},
            ],
        )

        # ── STEP 8: SAVE USER IN PG ──
        print("[CREATE] Step 8: Save user")
        try:
            db.create_tenant_user(created_tenant_id, cognito_sub, admin_email, "tenant_admin")
        except Exception as user_err:
            if "duplicate key" in str(user_err).lower():
                print(f"[CREATE] User exists, skipping")
            else:
                raise user_err

        # ── STEP 9: UPLOAD BRANDING TO S3 ──
        print("[CREATE] Step 9: S3 branding")
        branding = {
            "tenantSlug": slug,
            "displayName": company_name,
            "logoUrl": "",
            "primaryColor": "#1C3F97",
            "secondaryColor": "#FFFFFF",
            "backgroundType": "gradient",
            "backgroundValue": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            "welcomeMessage": f"Welcome to {company_name}",
            "loginButtonText": "Send OTP",
            "supportEmail": admin_email,
            "authMethod": "EMAIL_OTP",
            "cognitoClientId": created_cognito_client_id,
            "status": "ACTIVE",
        }
        s3.put_object(
            Bucket=bucket,
            Key=f"branding/{slug}.json",
            Body=json.dumps(branding),
            ContentType="application/json",
        )

        # ── STEP 10: SEND WELCOME EMAIL ──
        login_url = f"https://{subdomain}"
        print("[CREATE] Step 10: Welcome email")
        try:
            send_welcome_email(ses_from, admin_email, company_name, login_url, plan)
            print(f"[CREATE] Welcome email sent to {admin_email}")
        except Exception as email_err:
            # Don't fail onboarding if email fails
            print(f"[CREATE] WARNING: Welcome email failed: {str(email_err)}")

        # ── STEP 11: ACTIVATE ──
        print("[CREATE] Step 11: Activate")
        db.activate_tenant(created_tenant_id)

        print(f"[CREATE] ✅ Done: {slug}")

        return response(201, {
            "tenantId": created_tenant_id,
            "name": company_name,
            "slug": slug,
            "subdomain": subdomain,
            "loginUrl": login_url,
            "adminEmail": admin_email,
            "plan": plan,
            "status": "ACTIVE",
            "cognitoClientId": created_cognito_client_id,
            "apiKey": api_key,
            "message": "Workspace created successfully! Save your API key — it grants write access to your workspace.",
        })

    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})
    except Exception as e:
        print(f"[CREATE] ❌ ERROR: {str(e)}")
        if created_cognito_client_id:
            try:
                cognito.delete_user_pool_client(
                    UserPoolId=user_pool_id, ClientId=created_cognito_client_id)
            except Exception:
                pass
        if created_tenant_id:
            try:
                db.fail_tenant(created_tenant_id)
            except Exception:
                pass
        return response(500, {"error": "INTERNAL_ERROR", "message": str(e)})


# ═════════════════════════════════════════════════════
# ADMIN IDP CONFIG — SHARED AUTH HELPER
# ═════════════════════════════════════════════════════

def _require_tenant_admin(event):
    """
    Verify Bearer token, require custom:role = tenant_admin.
    Returns (tenant_slug, tenant_dict, None) on success.
    Returns (None, None, error_response) on failure.
    """
    headers = event.get("headers") or {}
    auth_header = headers.get("Authorization") or headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return None, None, response(401, {"error": "MISSING_TOKEN"})

    access_token = auth_header.split(" ", 1)[1].strip()
    user_pool_id = os.environ["COGNITO_USER_POOL_ID"]

    try:
        user_info = cognito.get_user(AccessToken=access_token)
    except cognito.exceptions.NotAuthorizedException:
        return None, None, response(401, {"error": "INVALID_TOKEN"})

    tenant_slug = ""
    caller_role = ""
    for attr in user_info.get("UserAttributes", []):
        if attr["Name"] == "custom:tenant_id":
            tenant_slug = attr["Value"]
        if attr["Name"] == "custom:role":
            caller_role = attr["Value"]

    if caller_role != "tenant_admin":
        return None, None, response(403, {
            "error": "FORBIDDEN",
            "message": "Only tenant admins can manage SSO settings",
        })

    tenant = db.get_tenant_by_slug(tenant_slug)
    if not tenant:
        return None, None, response(404, {"error": "TENANT_NOT_FOUND"})

    return tenant_slug, tenant, None


def _build_safe_idp_response(idp):
    """Build API-safe IDP config dict (no secrets)."""
    result = {
        "configured": True,
        "idpType": idp["idp_type"],
        "displayName": idp["display_name"],
        "cognitoIdpName": idp["cognito_idp_name"],
        "cognitoLoginEnabled": idp["cognito_login_enabled"],
        "ssoLoginEnabled": idp["sso_login_enabled"],
    }
    if idp["idp_type"] == "oidc":
        result["oidcIssuerUrl"] = idp["oidc_issuer_url"]
        result["oidcClientId"] = idp["oidc_client_id"]
        result["oidcScopes"] = idp["oidc_scopes"]
    elif idp["idp_type"] == "saml":
        result["samlMetadataUrl"] = idp["saml_metadata_url"]
    return result


def _update_app_client_idps(user_pool_id, client_id, tenant_slug, app_domain, supported_idps):
    """Update App Client SupportedIdentityProviders, preserving all other settings."""
    existing = cognito.describe_user_pool_client(
        UserPoolId=user_pool_id,
        ClientId=client_id,
    )
    c = existing["UserPoolClient"]

    cognito.update_user_pool_client(
        UserPoolId=user_pool_id,
        ClientId=client_id,
        ClientName=c["ClientName"],
        ExplicitAuthFlows=c.get("ExplicitAuthFlows", ["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]),
        AllowedOAuthFlows=c.get("AllowedOAuthFlows") or ["code"],
        AllowedOAuthScopes=c.get("AllowedOAuthScopes") or ["openid", "email", "profile"],
        AllowedOAuthFlowsUserPoolClient=True,
        CallbackURLs=c.get("CallbackURLs") or [f"https://{tenant_slug}.{app_domain}/auth/callback"],
        LogoutURLs=c.get("LogoutURLs") or [f"https://{tenant_slug}.{app_domain}/login"],
        WriteAttributes=c.get("WriteAttributes") or ["email", "email_verified", "name", "custom:tenant_id", "custom:role"],
        ReadAttributes=c.get("ReadAttributes") or ["email", "email_verified", "name", "sub", "custom:tenant_id", "custom:role"],
        SupportedIdentityProviders=supported_idps,
    )


# ═════════════════════════════════════════════════════
# ROUTE 5: GET IDP CONFIG
# ═════════════════════════════════════════════════════

def handle_get_idp_config(event):
    """GET /admin/idp-config"""
    tenant_slug, tenant, err = _require_tenant_admin(event)
    if err:
        return err

    idp = db.get_idp_config(str(tenant["id"]))
    if not idp:
        return response(200, {"configured": False, "idpType": None})

    return response(200, _build_safe_idp_response(idp))


# ═════════════════════════════════════════════════════
# ROUTE 6: SAVE (CREATE / UPDATE) IDP CONFIG
# ═════════════════════════════════════════════════════

def handle_save_idp_config(event):
    """POST /admin/idp-config"""
    tenant_slug, tenant, err = _require_tenant_admin(event)
    if err:
        return err

    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})

    idp_type = body.get("idpType", "").strip().lower()
    display_name = body.get("displayName", "").strip()

    if idp_type not in ("oidc", "saml"):
        return response(400, {"error": "INVALID_IDP_TYPE", "message": "idpType must be 'oidc' or 'saml'"})
    if not display_name:
        return response(400, {"error": "MISSING_DISPLAY_NAME", "message": "displayName is required"})

    user_pool_id = os.environ["COGNITO_USER_POOL_ID"]
    app_domain = os.environ.get("APP_DOMAIN", "example.com")
    tenant_id_str = str(tenant["id"])

    # ── Validate type-specific fields ──
    oidc_client_id = oidc_client_secret = oidc_issuer_url = oidc_scopes = None
    saml_metadata_url = saml_metadata_xml = None
    errors = {}

    if idp_type == "oidc":
        oidc_client_id = body.get("oidcClientId", "").strip()
        oidc_client_secret = body.get("oidcClientSecret", "").strip()
        oidc_issuer_url = body.get("oidcIssuerUrl", "").strip().rstrip("/")
        oidc_scopes = body.get("oidcScopes", "openid email profile").strip()

        if not oidc_client_id:
            errors["oidcClientId"] = "Required"
        if not oidc_issuer_url:
            errors["oidcIssuerUrl"] = "Required"
        # If no new secret provided, use the existing stored one
        if not oidc_client_secret:
            oidc_client_secret = db.get_idp_client_secret(tenant_id_str)
        if not oidc_client_secret:
            errors["oidcClientSecret"] = "Required"

    elif idp_type == "saml":
        saml_metadata_url = body.get("samlMetadataUrl", "").strip()
        saml_metadata_xml = body.get("samlMetadataXml", "").strip()
        if not saml_metadata_url and not saml_metadata_xml:
            errors["samlMetadataUrl"] = "Provide either metadata URL or XML"

    if errors:
        return response(400, {"error": "VALIDATION_ERROR", "details": errors})

    cognito_idp_name = f"{tenant_slug}-{idp_type}"  # e.g. "xyz-oidc" or "xyz-saml"

    # ── Delete existing Cognito IDP if present ──
    existing = db.get_idp_config(tenant_id_str)
    if existing and existing.get("cognito_idp_name"):
        try:
            cognito.delete_identity_provider(
                UserPoolId=user_pool_id,
                ProviderName=existing["cognito_idp_name"],
            )
            print(f"[IDP-CONFIG] Deleted old IDP: {existing['cognito_idp_name']}")
        except cognito.exceptions.ResourceNotFoundException:
            pass

    # ── Create new Cognito IDP ──
    try:
        if idp_type == "oidc":
            cognito.create_identity_provider(
                UserPoolId=user_pool_id,
                ProviderName=cognito_idp_name,
                ProviderType="OIDC",
                ProviderDetails={
                    "client_id": oidc_client_id,
                    "client_secret": oidc_client_secret,
                    "attributes_request_method": "GET",
                    "oidc_issuer": oidc_issuer_url,
                    "authorize_scopes": oidc_scopes,
                },
                AttributeMapping={
                    "email": "email",
                    "username": "sub",
                    "name": "name",
                },
            )
        elif idp_type == "saml":
            details = {}
            if saml_metadata_url:
                details["MetadataURL"] = saml_metadata_url
            else:
                details["MetadataFile"] = saml_metadata_xml
            cognito.create_identity_provider(
                UserPoolId=user_pool_id,
                ProviderName=cognito_idp_name,
                ProviderType="SAML",
                ProviderDetails=details,
                AttributeMapping={
                    "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
                    "username": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
                    "name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
                },
            )
    except Exception as e:
        print(f"[IDP-CONFIG] Cognito create IDP failed: {str(e)}")
        return response(400, {"error": "IDP_CREATION_FAILED", "message": str(e)})

    # ── Update App Client SupportedIdentityProviders ──
    try:
        _update_app_client_idps(
            user_pool_id,
            tenant["cognito_client_id"],
            tenant_slug,
            app_domain,
            ["COGNITO", cognito_idp_name],
        )
    except Exception as e:
        # Rollback the Cognito IDP we just created
        try:
            cognito.delete_identity_provider(UserPoolId=user_pool_id, ProviderName=cognito_idp_name)
        except Exception:
            pass
        return response(500, {"error": "APP_CLIENT_UPDATE_FAILED", "message": str(e)})

    # ── Save to DB ──
    saved = db.save_idp_config(
        tenant_id=tenant_id_str,
        idp_type=idp_type,
        display_name=display_name,
        cognito_idp_name=cognito_idp_name,
        oidc_client_id=oidc_client_id,
        oidc_client_secret=oidc_client_secret,
        oidc_issuer_url=oidc_issuer_url,
        oidc_scopes=oidc_scopes,
        saml_metadata_url=saml_metadata_url,
        saml_metadata_xml=saml_metadata_xml,
        cognito_login_enabled=True,
        sso_login_enabled=True,
    )

    print(f"[IDP-CONFIG] ✅ SSO configured for {tenant_slug}: {cognito_idp_name}")
    return response(200, _build_safe_idp_response(saved))


# ═════════════════════════════════════════════════════
# ROUTE 7: TOGGLE OTP / SSO LOGIN MODES
# ═════════════════════════════════════════════════════

def handle_toggle_idp(event):
    """POST /admin/idp-config/toggle"""
    tenant_slug, tenant, err = _require_tenant_admin(event)
    if err:
        return err

    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})

    cognito_login_enabled = body.get("cognitoLoginEnabled")
    sso_login_enabled = body.get("ssoLoginEnabled")

    if cognito_login_enabled is None or sso_login_enabled is None:
        return response(400, {
            "error": "MISSING_FIELDS",
            "message": "cognitoLoginEnabled and ssoLoginEnabled are required",
        })

    if not cognito_login_enabled and not sso_login_enabled:
        return response(400, {
            "error": "LOCKOUT_PREVENTION",
            "message": "Cannot disable both OTP and SSO — users would be locked out",
        })

    idp = db.get_idp_config(str(tenant["id"]))
    if not idp:
        return response(404, {"error": "IDP_NOT_CONFIGURED"})

    user_pool_id = os.environ["COGNITO_USER_POOL_ID"]
    app_domain = os.environ.get("APP_DOMAIN", "example.com")

    idps = []
    if cognito_login_enabled:
        idps.append("COGNITO")
    if sso_login_enabled:
        idps.append(idp["cognito_idp_name"])

    try:
        _update_app_client_idps(
            user_pool_id,
            tenant["cognito_client_id"],
            tenant_slug,
            app_domain,
            idps,
        )
    except Exception as e:
        return response(500, {"error": "APP_CLIENT_UPDATE_FAILED", "message": str(e)})

    db.update_idp_login_modes(str(tenant["id"]), cognito_login_enabled, sso_login_enabled)

    print(f"[IDP-TOGGLE] {tenant_slug}: OTP={cognito_login_enabled} SSO={sso_login_enabled}")
    return response(200, {
        "cognitoLoginEnabled": cognito_login_enabled,
        "ssoLoginEnabled": sso_login_enabled,
    })


# ═════════════════════════════════════════════════════
# ROUTE 8: DELETE IDP CONFIG
# ═════════════════════════════════════════════════════

def handle_delete_idp_config(event):
    """DELETE /admin/idp-config"""
    tenant_slug, tenant, err = _require_tenant_admin(event)
    if err:
        return err

    idp = db.get_idp_config(str(tenant["id"]))
    if not idp:
        return response(404, {"error": "IDP_NOT_CONFIGURED"})

    user_pool_id = os.environ["COGNITO_USER_POOL_ID"]
    app_domain = os.environ.get("APP_DOMAIN", "example.com")

    # Delete Cognito IDP
    try:
        cognito.delete_identity_provider(
            UserPoolId=user_pool_id,
            ProviderName=idp["cognito_idp_name"],
        )
    except cognito.exceptions.ResourceNotFoundException:
        pass
    except Exception as e:
        return response(500, {"error": "IDP_DELETE_FAILED", "message": str(e)})

    # Revert App Client to COGNITO only
    try:
        _update_app_client_idps(
            user_pool_id,
            tenant["cognito_client_id"],
            tenant_slug,
            app_domain,
            ["COGNITO"],
        )
    except Exception as e:
        return response(500, {"error": "APP_CLIENT_UPDATE_FAILED", "message": str(e)})

    db.delete_idp_config(str(tenant["id"]))

    print(f"[IDP-CONFIG] Deleted SSO for {tenant_slug}")
    return response(200, {"message": "SSO configuration removed. OTP login restored."})


# ═════════════════════════════════════════════════════
# MAGIC LINK — GENERATE & VERIFY
# ═════════════════════════════════════════════════════

def handle_magic_link_generate(event):
    """
    POST /magic-link/generate
    Body: { "email", "tenant_slug", "purpose", "context", "ttl_minutes" }
    Generates a magic link and sends it via email.
    """
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})

    email = (body.get("email") or "").strip().lower()
    tenant_slug = (body.get("tenant_slug") or "").strip()
    purpose = body.get("purpose", "auth")
    ctx = body.get("context", {})
    ttl_minutes = body.get("ttl_minutes", 15)

    if not email or not EMAIL_REGEX.match(email):
        return response(400, {"error": "INVALID_EMAIL"})
    if purpose not in ("auth", "invitation", "guest"):
        return response(400, {"error": "INVALID_PURPOSE"})

    # Resolve tenant
    tenant_id = None
    if tenant_slug:
        tenant = db.get_tenant_by_slug(tenant_slug)
        if not tenant:
            return response(404, {"error": "TENANT_NOT_FOUND"})
        tenant_id = str(tenant["id"])

        # For auth purpose, verify user belongs to tenant
        if purpose == "auth":
            tenant_user = db.get_tenant_user(tenant_id, email)
            if not tenant_user:
                return response(403, {"error": "USER_NOT_IN_TENANT"})

    # Generate the magic link
    url = magic_link.generate_magic_link(
        email=email,
        tenant_id=tenant_id,
        purpose=purpose,
        context=ctx,
        ttl_minutes=ttl_minutes,
    )

    # Send email
    subject = ctx.get("email_subject", "Your login link")
    heading = ctx.get("email_heading", "Click to sign in")
    body_text = ctx.get("email_body", "Click the button below to sign in. This link will expire shortly.")
    button_text = ctx.get("email_button", "Sign In")

    magic_link.send_magic_link_email(
        to_email=email,
        magic_link_url=url,
        subject=subject,
        heading=heading,
        body_text=body_text,
        button_text=button_text,
    )

    return response(200, {"sent": True, "email": email})


def handle_magic_link_verify(event):
    """
    POST /magic-link/verify
    Body: { "token": "<raw_token_from_url>" }
    Validates the magic link via Cognito Custom Auth challenge.
    Returns real Cognito tokens.
    """
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})

    raw_token = (body.get("token") or "").strip()
    if not raw_token:
        return response(400, {"error": "MISSING_TOKEN"})

    # Pre-check: look up token to get email + tenant before hitting Cognito
    import hashlib
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    token_record = db.get_magic_link_token(token_hash)

    if not token_record:
        return response(400, {"error": "INVALID_LINK", "message": "This link is invalid."})
    if token_record["used_at"] is not None:
        return response(400, {"error": "LINK_ALREADY_USED", "message": "This link has already been used."})

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    expires_at = token_record["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if now > expires_at:
        return response(400, {"error": "LINK_EXPIRED", "message": "This link has expired."})

    email = token_record["email"]
    tenant_id = token_record["tenant_id"]
    purpose = token_record["purpose"]
    ctx = token_record.get("context") or {}

    # Determine which Cognito client to use
    user_pool_id = os.environ["COGNITO_USER_POOL_ID"]
    if tenant_id:
        tenant = db.get_tenant_by_slug_or_id(str(tenant_id))
        if not tenant or not tenant.get("cognito_client_id"):
            return response(400, {"error": "TENANT_NOT_FOUND"})
        client_id = tenant["cognito_client_id"]
        tenant_slug = tenant["slug"]
        tenant_name = tenant.get("name", "")
    else:
        client_id = os.environ["SIGNUP_CLIENT_ID"]
        tenant_slug = ""
        tenant_name = ""

    try:
        # Step 1: Initiate custom auth
        print(f"[MAGIC-LINK-VERIFY] Initiating CUSTOM_AUTH for {email}")
        auth_resp = cognito.admin_initiate_auth(
            UserPoolId=user_pool_id,
            ClientId=client_id,
            AuthFlow="CUSTOM_AUTH",
            AuthParameters={"USERNAME": email},
        )

        # Step 2: Respond with the raw token as challenge answer
        challenge_name = auth_resp.get("ChallengeName")
        session = auth_resp.get("Session")

        if challenge_name != "CUSTOM_CHALLENGE":
            print(f"[MAGIC-LINK-VERIFY] Unexpected challenge: {challenge_name}")
            return response(500, {"error": "AUTH_FAILED", "message": "Unexpected auth challenge"})

        result = cognito.admin_respond_to_auth_challenge(
            UserPoolId=user_pool_id,
            ClientId=client_id,
            ChallengeName="CUSTOM_CHALLENGE",
            ChallengeResponses={
                "USERNAME": email,
                "ANSWER": raw_token,
            },
            Session=session,
        )

        tokens = result.get("AuthenticationResult", {})
        access_token = tokens.get("AccessToken")
        id_token = tokens.get("IdToken", "")
        refresh_token = tokens.get("RefreshToken", "")

        if not access_token:
            return response(500, {"error": "AUTH_FAILED", "message": "No tokens returned"})

        # Get user role from Cognito attributes
        user_info = cognito.get_user(AccessToken=access_token)
        user_role = ""
        for attr in user_info.get("UserAttributes", []):
            if attr["Name"] == "custom:role":
                user_role = attr["Value"]

        print(f"[MAGIC-LINK-VERIFY] ✅ Authenticated {email} via magic link")

        return response(200, {
            "accessToken": access_token,
            "idToken": id_token,
            "refreshToken": refresh_token,
            "email": email,
            "tenantSlug": tenant_slug,
            "tenantName": tenant_name,
            "role": user_role,
            "purpose": purpose,
            "targetUrl": ctx.get("target_url", "/dashboard"),
        })

    except cognito.exceptions.UserNotFoundException:
        return response(400, {"error": "USER_NOT_FOUND", "message": "No account found for this email."})
    except cognito.exceptions.NotAuthorizedException as e:
        print(f"[MAGIC-LINK-VERIFY] Auth failed: {str(e)}")
        return response(400, {"error": "LINK_INVALID", "message": "This link is invalid or has expired."})
    except Exception as e:
        print(f"[MAGIC-LINK-VERIFY] ❌ Error: {str(e)}")
        return response(500, {"error": "INTERNAL_ERROR", "message": str(e)})


# ═════════════════════════════════════════════════════
# DEMO APPROVALS — Pattern A
# ═════════════════════════════════════════════════════

def _require_auth(event):
    """
    Verify Bearer token. Returns (email, tenant_slug, tenant, None) on success.
    Returns (None, None, None, error_response) on failure.
    """
    headers = event.get("headers") or {}
    auth_header = headers.get("Authorization") or headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return None, None, None, response(401, {"error": "MISSING_TOKEN"})

    access_token = auth_header.split(" ", 1)[1].strip()
    user_pool_id = os.environ["COGNITO_USER_POOL_ID"]

    try:
        user_info = cognito.get_user(AccessToken=access_token)
    except cognito.exceptions.NotAuthorizedException:
        return None, None, None, response(401, {"error": "INVALID_TOKEN"})

    caller_email = ""
    tenant_slug = ""
    for attr in user_info.get("UserAttributes", []):
        if attr["Name"] == "email":
            caller_email = attr["Value"]
        if attr["Name"] == "custom:tenant_id":
            tenant_slug = attr["Value"]

    if not tenant_slug:
        return None, None, None, response(403, {"error": "NO_TENANT", "message": "User has no tenant"})

    tenant = db.get_tenant_by_slug(tenant_slug)
    if not tenant:
        return None, None, None, response(404, {"error": "TENANT_NOT_FOUND"})

    return caller_email, tenant_slug, tenant, None


def handle_create_approval(event):
    """
    POST /demo/approvals
    Body: { "title", "description", "approver_email" }
    Requires auth. Creates a demo approval request.
    """
    caller_email, tenant_slug, tenant, err = _require_auth(event)
    if err:
        return err

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})

    title = (body.get("title") or "").strip()
    description = (body.get("description") or "").strip()
    approver_email = (body.get("approver_email") or "").strip().lower()

    if not title:
        return response(400, {"error": "MISSING_TITLE"})
    if not approver_email or not EMAIL_REGEX.match(approver_email):
        return response(400, {"error": "INVALID_APPROVER_EMAIL"})

    approval = db.create_demo_approval(
        tenant_id=str(tenant["id"]),
        title=title,
        description=description,
        requested_by=caller_email,
        approver_email=approver_email,
    )

    print(f"[DEMO-APPROVAL] Created {approval['id']} by {caller_email}")
    return response(201, approval)


def handle_get_approval(event):
    """
    GET /demo/approvals/{id}
    Requires auth.
    """
    path = event.get("path", "")
    parts = path.strip("/").split("/")
    if len(parts) < 3:
        return response(400, {"error": "MISSING_ID"})
    approval_id = parts[2]

    approval = db.get_demo_approval(approval_id)
    if not approval:
        return response(404, {"error": "NOT_FOUND"})

    return response(200, approval)


def handle_decide_approval(event):
    """
    POST /demo/approvals/{id}/decide
    Body: { "decision": "approved"|"rejected", "comment": "..." }
    Requires auth.
    """
    caller_email, _, _, err = _require_auth(event)
    if err:
        return err

    path = event.get("path", "")
    parts = path.strip("/").split("/")
    if len(parts) < 4:
        return response(400, {"error": "MISSING_ID"})
    approval_id = parts[2]

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "INVALID_JSON"})

    decision = body.get("decision", "")
    comment = body.get("comment", "")

    if decision not in ("approved", "rejected"):
        return response(400, {"error": "INVALID_DECISION", "message": "Must be 'approved' or 'rejected'"})

    # Verify caller is the approver
    approval = db.get_demo_approval(approval_id)
    if not approval:
        return response(404, {"error": "NOT_FOUND"})
    if approval["approver_email"].lower() != caller_email.lower():
        return response(403, {"error": "FORBIDDEN", "message": "Only the designated approver can decide"})

    result = db.decide_demo_approval(approval_id, decision, comment)
    if not result:
        return response(400, {"error": "ALREADY_DECIDED", "message": "This approval has already been decided"})

    print(f"[DEMO-APPROVAL] {approval_id} → {decision} by {caller_email}")
    return response(200, result)


def handle_notify_approval(event):
    """
    POST /demo/approvals/{id}/notify
    Sends a magic link email to the approver.
    Requires auth.
    """
    caller_email, _, _, err = _require_auth(event)
    if err:
        return err

    path = event.get("path", "")
    parts = path.strip("/").split("/")
    if len(parts) < 4:
        return response(400, {"error": "MISSING_ID"})
    approval_id = parts[2]

    approval = db.get_demo_approval(approval_id)
    if not approval:
        return response(404, {"error": "NOT_FOUND"})
    if approval["status"] != "pending":
        return response(400, {"error": "ALREADY_DECIDED"})

    tenant = db.get_tenant_by_slug_or_id(str(approval["tenant_id"]))
    if not tenant:
        return response(404, {"error": "TENANT_NOT_FOUND"})

    # Generate magic link for the approver
    url = magic_link.generate_magic_link(
        email=approval["approver_email"],
        tenant_id=str(approval["tenant_id"]),
        purpose="auth",
        context={"target_url": f"/approvals/{approval_id}"},
        ttl_minutes=15,
    )

    # Send notification email
    magic_link.send_magic_link_email(
        to_email=approval["approver_email"],
        magic_link_url=url,
        subject=f"Approval needed — {approval['title']}",
        heading="Approval Request",
        body_text=(
            f"<strong>{approval['requested_by']}</strong> has requested your approval.<br><br>"
            f"<strong>{approval['title']}</strong><br>"
            f"{approval.get('description', '')}<br><br>"
            "Click below to review and approve or reject."
        ),
        button_text="View & Approve",
    )

    print(f"[DEMO-APPROVAL] Notification sent for {approval_id} to {approval['approver_email']}")
    return response(200, {"sent": True, "approval_id": str(approval_id)})


# ═════════════════════════════════════════════════════
# WELCOME EMAIL
# ═════════════════════════════════════════════════════

def send_welcome_email(from_email, to_email, company_name, login_url, plan):
    """Send welcome email via SES."""
    if not from_email:
        print("[EMAIL] No SES_FROM_EMAIL configured, skipping")
        return

    subject = f"Welcome to {company_name} — Your workspace is ready!"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }}
        .container {{ max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; color: white; }}
        .header h1 {{ margin: 0; font-size: 28px; }}
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
          <h1>🎉 {company_name} is ready!</h1>
          <p>Your workspace has been created successfully</p>
        </div>
        <div class="body">
          <p>Hi {to_email},</p>
          <p>Great news! Your workspace <strong>{company_name}</strong> is now live and ready to use.</p>

          <div class="info-box">
            <div class="info-row">
              <span class="info-label">Workspace URL</span>
              <span class="info-value">{login_url}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Admin Email</span>
              <span class="info-value">{to_email}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Plan</span>
              <span class="info-value">{plan.capitalize()}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Authentication</span>
              <span class="info-value">Passwordless (Email OTP)</span>
            </div>
          </div>

          <p><strong>How to login:</strong></p>
          <div class="steps">
            <div class="step" data-step="1">Visit <a href="{login_url}">{login_url}</a></div>
            <div class="step" data-step="2">Enter your email address</div>
            <div class="step" data-step="3">Enter the verification code sent to your email</div>
            <div class="step" data-step="4">You're in! 🚀</div>
          </div>

          <div style="text-align: center;">
            <a href="{login_url}" class="btn">Go to Workspace →</a>
          </div>

          <p>You can invite team members from your dashboard after logging in.</p>
          <p>If you have any questions, just reply to this email.</p>
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
Welcome to {company_name}!

Your workspace is ready.

Workspace URL: {login_url}
Admin Email: {to_email}
Plan: {plan.capitalize()}
Authentication: Passwordless (Email OTP)

How to login:
1. Visit {login_url}
2. Enter your email
3. Enter the verification code
4. You're in!

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


# ════════════════════════════════════════════════��════
# ROUTER
# ═════════════════════════════════════════════════════

def lambda_handler(event, context):
    method = event.get("httpMethod", "")
    path = event.get("path", "")
    print(f"[ROUTER] {method} {path}")

    if method == "OPTIONS":
        return response(200, {})

    if method == "POST" and path == "/auth/send-otp":
        return handle_send_otp(event)
    if method == "POST" and path == "/auth/verify-otp":
        return handle_verify_otp(event)
    if method == "POST" and path == "/auth/google-verify":
        return handle_google_verify(event)
    if method == "GET" and path == "/onboarding/check-slug":
        return handle_check_slug(event)
    if method == "POST" and path == "/onboarding/tenant":
        return handle_create_tenant(event)

    # Admin SSO routes (require tenant_admin token)
    if method == "GET" and path == "/admin/idp-config":
        return handle_get_idp_config(event)
    if method == "POST" and path == "/admin/idp-config/toggle":
        return handle_toggle_idp(event)
    if method == "POST" and path == "/admin/idp-config":
        return handle_save_idp_config(event)
    if method == "DELETE" and path == "/admin/idp-config":
        return handle_delete_idp_config(event)

    # Magic link routes
    if method == "POST" and path == "/magic-link/generate":
        return handle_magic_link_generate(event)
    if method == "POST" and path == "/magic-link/verify":
        return handle_magic_link_verify(event)

    # Demo approval routes (Pattern A)
    if method == "POST" and path == "/demo/approvals":
        return handle_create_approval(event)
    if method == "GET" and path.startswith("/demo/approvals/"):
        return handle_get_approval(event)
    if method == "POST" and path.startswith("/demo/approvals/") and path.endswith("/decide"):
        return handle_decide_approval(event)
    if method == "POST" and path.startswith("/demo/approvals/") and path.endswith("/notify"):
        return handle_notify_approval(event)

    return response(404, {"error": "NOT_FOUND"})