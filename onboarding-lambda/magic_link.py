"""
Magic link generation and email delivery.

Usage:
    from magic_link import generate_magic_link, send_magic_link_email
"""

import os
import hashlib
import secrets
import base64
import json

import boto3
import db

ses = boto3.client("ses")


def generate_magic_link(email, tenant_id, purpose, context=None, ttl_minutes=15):
    """
    Generate a magic link token and store its hash in the database.

    Returns the full URL the user should click.
    """
    # Generate cryptographically random token (32 bytes → 43 chars URL-safe base64)
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    # Store hash in DB
    db.create_magic_link_token(
        token_hash=token_hash,
        email=email,
        tenant_id=tenant_id,
        purpose=purpose,
        context=context or {},
        ttl_minutes=ttl_minutes,
    )

    # Build the magic link URL
    app_domain = os.environ.get("APP_DOMAIN", "localhost:3000")
    protocol = "http" if "localhost" in app_domain else "https"

    # If tenant-scoped, use tenant subdomain
    if tenant_id:
        tenant = db.get_tenant_by_slug_or_id(tenant_id)
        if tenant and tenant.get("subdomain"):
            base_url = f"{protocol}://{tenant['subdomain']}"
        else:
            base_url = f"{protocol}://{app_domain}"
    else:
        base_url = f"{protocol}://{app_domain}"

    url = f"{base_url}/auth/magic-link?token={raw_token}"
    print(f"[MAGIC-LINK] Generated for {email}, purpose={purpose}, expires in {ttl_minutes}m")
    return url


def send_magic_link_email(to_email, magic_link_url, subject, heading, body_text, button_text="Open Link"):
    """Send a magic link email via SES."""
    ses_from = os.environ.get("SES_FROM_EMAIL", "")
    if not ses_from:
        print("[MAGIC-LINK] WARNING: SES_FROM_EMAIL not set, skipping email")
        return False

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1C3F97;">{heading}</h2>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">{body_text}</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{magic_link_url}"
               style="background-color: #1C3F97; color: white; padding: 14px 32px;
                      text-decoration: none; border-radius: 6px; font-size: 16px;
                      display: inline-block;">
                {button_text}
            </a>
        </div>
        <p style="color: #999; font-size: 12px;">
            This link will expire shortly. If you didn't request this, you can safely ignore this email.
        </p>
    </div>
    """

    try:
        ses.send_email(
            Source=ses_from,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Html": {"Data": html_body, "Charset": "UTF-8"},
                },
            },
        )
        print(f"[MAGIC-LINK] Email sent to {to_email}")
        return True
    except Exception as e:
        print(f"[MAGIC-LINK] Email failed: {str(e)}")
        return False
