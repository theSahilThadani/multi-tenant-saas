# End-to-End Testing Guide

Replace the placeholder values before running:

```
ONBOARDING_URL  = https://<onboarding-api-gw-url>
SYNC_URL        = https://<user-sync-api-gw-url>
SIGNIN_URL      = https://<signin-api-gw-url>
```

---

## Phase 1 — Onboarding Lambda (new tenant + get API key)

### Step 1.1 — Send OTP (creates user in Cognito)

```bash
curl -s -X POST $ONBOARDING_URL/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@yourcompany.com"}' | jq
```

Expected `200`:
```json
{
  "message": "Verification code sent to admin@yourcompany.com",
  "email": "admin@yourcompany.com",
  "session": "<SESSION_TOKEN>",
  "hasTenant": false,
  "tenantSlug": ""
}
```
**Save:** `session`

---

### Step 1.2 — Verify OTP

```bash
curl -s -X POST $ONBOARDING_URL/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourcompany.com",
    "otp": "<8-DIGIT-CODE-FROM-EMAIL>",
    "session": "<SESSION_TOKEN>"
  }' | jq
```

Expected `200`:
```json
{
  "verified": true,
  "accessToken": "<ACCESS_TOKEN>",
  "hasTenant": false
}
```
**Save:** `accessToken`

---

### Step 1.3 — Create workspace (get API key)

```bash
curl -s -X POST $ONBOARDING_URL/onboarding/tenant \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "ACME Corp",
    "slug": "acme-corp",
    "plan": "free",
    "accessToken": "<ACCESS_TOKEN>"
  }' | jq
```

Expected `201`:
```json
{
  "tenantId": "<UUID>",
  "slug": "acme-corp",
  "loginUrl": "https://acme-corp.<domain>",
  "apiKey": "<32-CHAR-HEX>",
  "message": "Workspace created successfully! Save your API key..."
}
```
**Save:** `apiKey` — this is used by the user-sync lambda.

---

## Phase 2 — User Sync Lambda

### Scenario A — Existing tenant (no api_key yet)

If you have an existing tenant that predates the api_key column, generate a key first:

```bash
curl -s -X POST $SYNC_URL/sync/api-key/generate \
  -H "Authorization: Bearer <ACCESS_TOKEN>" | jq
```

Expected `200`:
```json
{
  "apiKey": "<32-CHAR-HEX>",
  "tenantSlug": "acme-corp",
  "tenantName": "ACME Corp",
  "message": "API key generated. Store it securely..."
}
```

---

### Scenario B — Create a user (happy path)

```bash
curl -s -X POST $SYNC_URL/users/create \
  -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@acme-internal.com", "role": "user"}' | jq
```

Expected `201`:
```json
{
  "userId": "<UUID>",
  "email": "alice@acme-internal.com",
  "role": "user",
  "tenantSlug": "acme-corp",
  "tenantName": "ACME Corp",
  "cognitoSub": "<SUB>",
  "loginUrl": "https://acme-corp.<domain>/login",
  "inviteEmailSent": true,
  "status": "created"
}
```

Alice will receive an invite email from SES.

---

### Scenario C — Create a tenant_admin

```bash
curl -s -X POST $SYNC_URL/users/create \
  -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email": "bob@acme-internal.com", "role": "tenant_admin"}' | jq
```

Expected `201` with `"role": "tenant_admin"`.

---

### Scenario D — Duplicate user (same workspace)

Run the same request from Scenario B again:

```bash
curl -s -X POST $SYNC_URL/users/create \
  -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@acme-internal.com", "role": "user"}' | jq
```

Expected `409`:
```json
{
  "error": "ALREADY_MEMBER",
  "message": "alice@acme-internal.com is already a member of this workspace"
}
```

---

### Scenario E — Invalid role

```bash
curl -s -X POST $SYNC_URL/users/create \
  -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email": "charlie@acme-internal.com", "role": "superadmin"}' | jq
```

Expected `400`:
```json
{
  "error": "INVALID_ROLE",
  "message": "Role must be one of: tenant_admin, user"
}
```

---

### Scenario F — Wrong API key

```bash
curl -s -X POST $SYNC_URL/users/create \
  -H "X-API-Key: wrongkeyhere" \
  -H "Content-Type: application/json" \
  -d '{"email": "dave@acme-internal.com", "role": "user"}' | jq
```

Expected `401`:
```json
{
  "error": "INVALID_API_KEY",
  "message": "API key is invalid or tenant is inactive"
}
```

---

### Scenario G — Missing API key header

```bash
curl -s -X POST $SYNC_URL/users/create \
  -H "Content-Type: application/json" \
  -d '{"email": "dave@acme-internal.com", "role": "user"}' | jq
```

Expected `401`:
```json
{
  "error": "MISSING_API_KEY",
  "message": "X-API-Key header is required"
}
```

---

### Scenario H — Invalid email

```bash
curl -s -X POST $SYNC_URL/users/create \
  -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email": "not-an-email", "role": "user"}' | jq
```

Expected `400`:
```json
{
  "error": "INVALID_EMAIL",
  "message": "A valid email address is required"
}
```

---

### Scenario I — Key rotation (invalidates old key)

```bash
curl -s -X POST $SYNC_URL/sync/api-key/generate \
  -H "Authorization: Bearer <ACCESS_TOKEN>" | jq
# → new apiKey returned; old key now returns 401
```

---

## Phase 3 — Signin Lambda (synced user logs in)

After alice was created via user-sync, she can log in on the tenant subdomain.

### Step 3.1 — Get tenant branding

```bash
curl -s "$SIGNIN_URL/signin/tenant-info?slug=acme-corp" | jq
```

Expected `200` with tenant name, plan, login URL.

---

### Step 3.2 — Alice sends OTP on tenant subdomain

```bash
curl -s -X POST $SIGNIN_URL/signin/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@acme-internal.com", "tenantSlug": "acme-corp"}' | jq
```

Expected `200` with `session`. If alice is NOT in this tenant, you'll get `403 WRONG_WORKSPACE`.

---

### Step 3.3 — Alice verifies OTP

```bash
curl -s -X POST $SIGNIN_URL/signin/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@acme-internal.com",
    "otp": "<8-DIGIT-CODE>",
    "session": "<SESSION_TOKEN>",
    "tenantSlug": "acme-corp"
  }' | jq
```

Expected `200` with `accessToken`, `role: "user"`, `dashboardUrl`.

---

## DB Verification Queries

After running tests, verify directly in PostgreSQL:

```sql
-- Check tenant has api_key
SELECT id, name, slug, api_key, status FROM tenants WHERE slug = 'acme-corp';

-- Check synced users are in tenant_users
SELECT tu.email, tu.role, t.slug AS tenant
FROM tenant_users tu
JOIN tenants t ON t.id = tu.tenant_id
WHERE t.slug = 'acme-corp'
ORDER BY tu.email;

-- Confirm Cognito sub is present
SELECT email, cognito_sub FROM tenant_users WHERE email = 'alice@acme-internal.com';
```

---

## Cognito Verification (AWS Console)

1. Go to **Cognito → User Pools → \<your pool\> → Users**
2. Search for `alice@acme-internal.com`
3. Confirm:
   - `email_verified = true`
   - `custom:tenant_id = acme-corp`
   - `custom:role = user`
