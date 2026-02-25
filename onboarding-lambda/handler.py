"""
Onboarding Lambda — Smart Flow

Used by: motadata.com (main site)
Handles: Scenarios 1, 2, 3, 4

Routes:
  POST /auth/send-otp         → Send OTP + check if user has tenant
  POST /auth/verify-otp       → Verify OTP + return tenant info
  GET  /onboarding/check-slug → Check slug availability
  POST /onboarding/tenant     → Create workspace + welcome email
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
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
# ROUTE 3: CHECK SLUG
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
        client_resp = cognito.create_user_pool_client(
            UserPoolId=user_pool_id,
            ClientName=f"{slug}-client",
            GenerateSecret=False,
            ExplicitAuthFlows=["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
            AccessTokenValidity=1,
            IdTokenValidity=1,
            RefreshTokenValidity=30,
            TokenValidityUnits={
                "AccessToken": "hours",
                "IdToken": "hours",
                "RefreshToken": "days",
            },
            PreventUserExistenceErrors="ENABLED",
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
    if method == "GET" and path == "/onboarding/check-slug":
        return handle_check_slug(event)
    if method == "POST" and path == "/onboarding/tenant":
        return handle_create_tenant(event)

    return response(404, {"error": "NOT_FOUND"})