"""
Cognito Custom Auth Challenge Triggers — Magic Link Verification

Attached to the Cognito User Pool as Lambda triggers:
  - DefineAuthChallenge:  Decides what challenge to present
  - CreateAuthChallenge:  Returns challenge metadata to client
  - VerifyAuthChallenge:  Validates the magic link token against DB

Environment variables:
  DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
"""

import hashlib
from datetime import datetime, timezone

import db


def lambda_handler(event, context):
    trigger = event["triggerSource"]
    print(f"[COGNITO-TRIGGER] {trigger} | user: {event['userName']}")

    if trigger == "DefineAuthChallenge_Authentication":
        return handle_define(event)
    elif trigger == "CreateAuthChallenge_Authentication":
        return handle_create(event)
    elif trigger == "VerifyAuthChallenge_Authentication":
        return handle_verify(event)
    else:
        print(f"[COGNITO-TRIGGER] Unknown trigger: {trigger}")
        return event


def handle_define(event):
    """
    Decide what challenge to present.
    - No session yet → issue CUSTOM_CHALLENGE
    - Last challenge answered correctly → issue tokens
    - Last challenge failed → fail authentication
    """
    session = event["request"].get("session", [])

    if not session:
        # First call — present the magic link challenge
        event["response"]["challengeName"] = "CUSTOM_CHALLENGE"
        event["response"]["issueTokens"] = False
        event["response"]["failAuthentication"] = False
    elif session[-1].get("challengeResult") is True:
        # Challenge answered correctly — Cognito should issue tokens
        event["response"]["issueTokens"] = True
        event["response"]["failAuthentication"] = False
    else:
        # Challenge failed
        event["response"]["issueTokens"] = False
        event["response"]["failAuthentication"] = True

    return event


def handle_create(event):
    """Return challenge metadata. The actual answer is the raw magic link token."""
    event["response"]["publicChallengeParameters"] = {"type": "MAGIC_LINK"}
    event["response"]["privateChallengeParameters"] = {"answer": "magic_link"}
    return event


def handle_verify(event):
    """
    Validate the magic link token:
    1. SHA-256 hash the provided answer
    2. Look up in magic_link_tokens table
    3. Check not used, not expired
    4. Atomically consume (mark used_at)
    """
    raw_token = event["request"].get("challengeAnswer", "")
    if not raw_token:
        print("[VERIFY-CHALLENGE] No token provided")
        event["response"]["answerCorrect"] = False
        return event

    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    record = db.get_magic_link_token(token_hash)

    if not record:
        print(f"[VERIFY-CHALLENGE] Token not found")
        event["response"]["answerCorrect"] = False
        return event

    # Check already used
    if record["used_at"] is not None:
        print(f"[VERIFY-CHALLENGE] Token already used at {record['used_at']}")
        event["response"]["answerCorrect"] = False
        return event

    # Check expiry
    now = datetime.now(timezone.utc)
    expires_at = record["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if now > expires_at:
        print(f"[VERIFY-CHALLENGE] Token expired at {expires_at}")
        event["response"]["answerCorrect"] = False
        return event

    # Check email matches the Cognito user
    cognito_email = event["userName"]
    if record["email"].lower() != cognito_email.lower():
        print(f"[VERIFY-CHALLENGE] Email mismatch: token={record['email']}, cognito={cognito_email}")
        event["response"]["answerCorrect"] = False
        return event

    # Atomically consume the token
    consumed = db.consume_magic_link_token(token_hash)
    if not consumed:
        print(f"[VERIFY-CHALLENGE] Race condition — token already consumed")
        event["response"]["answerCorrect"] = False
        return event

    print(f"[VERIFY-CHALLENGE] ✅ Token valid for {record['email']}, purpose={record['purpose']}")
    event["response"]["answerCorrect"] = True
    return event
