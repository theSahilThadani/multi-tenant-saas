# API Key (PAT) Authentication — End-to-End Flow

## Diagram 1: PAT Creation (Admin creates API key)

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Tenant Admin<br/>(Browser)
    participant FE as React Frontend<br/>ApiKeysPage.js
    participant APIGW as API Gateway
    participant AUTH as Lambda Authorizer<br/>pat-authorizer-lambda
    participant SYNC as user-sync-lambda<br/>handler.py
    participant COG as AWS Cognito
    participant PG as PostgreSQL<br/>pat_tokens

    Note over Admin,PG: PHASE 1 — Admin opens API Key Management page

    Admin->>FE: Navigate to /admin/api-keys
    FE->>FE: Check sessionStorage.dashboard_user<br/>Verify role === "tenant_admin"

    FE->>APIGW: GET /api-keys<br/>Authorization: Bearer <JWT>
    APIGW->>AUTH: Invoke authorizer
    AUTH->>COG: cognito.get_user(AccessToken)
    COG-->>AUTH: UserAttributes: email, custom:tenant_id,<br/>custom:role = "tenant_admin"
    AUTH-->>APIGW: Allow policy + context:<br/>{auth_type:"cognito", tenant_id, email, role}
    APIGW->>SYNC: Forward request + authorizer context
    SYNC->>SYNC: _require_tenant_admin(event)<br/>Verify Bearer token + role check
    SYNC->>PG: SELECT * FROM pat_tokens<br/>WHERE tenant_id = %s<br/>ORDER BY created_at DESC
    PG-->>SYNC: List of existing PATs (no hashes)
    SYNC-->>FE: 200 { keys: [{tokenPrefix, name,<br/>userEmail, scopes, status, ...}] }

    FE->>APIGW: GET /api-keys/users<br/>Authorization: Bearer <JWT>
    APIGW->>AUTH: Invoke authorizer
    AUTH-->>APIGW: Allow (cached from above)
    APIGW->>SYNC: Forward request
    SYNC->>PG: SELECT cognito_sub, email, role<br/>FROM tenant_users<br/>WHERE tenant_id = %s
    PG-->>SYNC: List of tenant users
    SYNC-->>FE: 200 { users: [{userId, email, role}] }
    FE-->>Admin: Display keys table + user dropdown

    Note over Admin,PG: PHASE 2 — Admin creates a new PAT

    Admin->>FE: Fill form:<br/>• User: alice@company.com<br/>• Name: "HRMS Integration"<br/>• Scopes: [users:write, incidents:read]<br/>• Expiry: 365 days
    Admin->>FE: Click "Create API Key"

    FE->>APIGW: POST /api-keys<br/>Authorization: Bearer <JWT><br/>Body: {name, userId, scopes, expiresInDays}
    APIGW->>AUTH: Invoke authorizer
    AUTH->>COG: cognito.get_user(AccessToken)
    COG-->>AUTH: Valid — tenant_admin
    AUTH-->>APIGW: Allow + context
    APIGW->>SYNC: Forward to handle_create_pat()

    SYNC->>SYNC: _require_tenant_admin(event)
    SYNC->>PG: Verify userId belongs to this tenant<br/>SELECT * FROM tenant_users<br/>WHERE tenant_id = %s
    PG-->>SYNC: User found: alice@company.com

    SYNC->>SYNC: Validate scopes against KNOWN_SCOPES set:<br/>{users:read, users:write, tenant:read,<br/>idp:manage, incidents:read, incidents:write, reports:read}

    SYNC->>SYNC: Generate token:<br/>raw_token = "saas_pat_" + uuid4().hex<br/>e.g. "saas_pat_a3f8bc12de456789..."

    SYNC->>SYNC: Hash token:<br/>token_hash = SHA-256(raw_token)<br/>token_prefix = raw_token[:20]

    SYNC->>PG: INSERT INTO pat_tokens<br/>(token_hash, token_prefix, name,<br/>tenant_id, user_id, user_email,<br/>user_role, scopes, created_by,<br/>expires_at)
    PG-->>SYNC: Row created

    Note over SYNC: Raw token is NEVER stored.<br/>Only SHA-256 hash is in the database.

    SYNC-->>FE: 201 {<br/>  apiKey: "saas_pat_a3f8bc12de456789...",<br/>  name: "HRMS Integration",<br/>  tokenPrefix: "saas_pat_a3f8bc12de4",<br/>  scopes: ["users:write", "incidents:read"],<br/>  message: "Copy now — will not be shown again"<br/>}

    FE-->>Admin: Show green success box with raw key<br/>+ Copy button<br/>"saas_pat_a3f8bc12de456789..."
    Admin->>Admin: Copies key, gives to<br/>script/HRMS/integration

    Note over Admin,PG: After dismissal, raw key can NEVER be retrieved again
```

## Diagram 2: PAT Usage (Script/Postman hits API)

```mermaid
sequenceDiagram
    autonumber
    actor Script as Script / Postman /<br/>HRMS Integration
    participant APIGW as API Gateway
    participant AUTH as Lambda Authorizer<br/>pat-authorizer-lambda
    participant PG as PostgreSQL<br/>pat_tokens
    participant LAMBDA as Target Lambda<br/>(any: user-sync, onboarding, etc.)

    Note over Script,LAMBDA: Script uses the API key to call any API

    Script->>APIGW: POST /users/create<br/>X-API-Key: saas_pat_a3f8bc12de456789...<br/>Body: {email: "bob@co.com", role: "user"}

    APIGW->>AUTH: Invoke Lambda Authorizer<br/>Pass headers, method, path

    AUTH->>AUTH: Check headers:<br/>1. Authorization: Bearer? → No<br/>2. X-API-Key? → Yes, found!

    AUTH->>AUTH: Hash incoming key:<br/>token_hash = SHA-256("saas_pat_a3f8bc12...")

    AUTH->>PG: SELECT token_hash, tenant_id, user_id,<br/>user_email, user_role, scopes<br/>FROM pat_tokens<br/>WHERE token_hash = %s<br/>AND status = 'active'<br/>AND (expires_at IS NULL OR expires_at > NOW())

    alt Token valid (found, active, not expired)
        PG-->>AUTH: Row: {tenant_id: "uuid-123",<br/>user_id: "cognito-sub-alice",<br/>user_email: "alice@co.com",<br/>user_role: "tenant_admin",<br/>scopes: ["users:write","incidents:read"]}

        AUTH->>PG: UPDATE pat_tokens<br/>SET last_used_at = NOW()<br/>WHERE token_hash = %s

        AUTH-->>APIGW: IAM Allow Policy + Context:<br/>{auth_type: "pat",<br/>tenant_id: "uuid-123",<br/>user_id: "cognito-sub-alice",<br/>email: "alice@co.com",<br/>role: "tenant_admin",<br/>scopes: "users:write,incidents:read"}

        APIGW->>LAMBDA: Forward request<br/>event.requestContext.authorizer =<br/>{auth_type, tenant_id, user_id,<br/>email, role, scopes}

        LAMBDA->>LAMBDA: Read authorizer context:<br/>tenant_id = event.requestContext<br/>.authorizer.tenant_id

        Note over LAMBDA: Lambda can check scopes:<br/>if "users:write" not in scopes → 403

        LAMBDA-->>APIGW: 201 {userId, email, status: "created"}
        APIGW-->>Script: 201 Created

    else Token invalid / revoked / expired
        PG-->>AUTH: No rows returned
        AUTH-->>AUTH: print("[AUTHORIZER] PAT not found or expired")
        AUTH-->>APIGW: raise Exception("Unauthorized")
        APIGW-->>Script: 401 Unauthorized
        Note over Script,LAMBDA: Lambda was NEVER invoked<br/>(saves compute cost)
    end
```

## Diagram 3: PAT Revocation (Instant kill)

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Tenant Admin
    participant FE as React Frontend
    participant SYNC as user-sync-lambda
    participant PG as PostgreSQL
    actor Script as Script (still using key)
    participant AUTH as Lambda Authorizer

    Admin->>FE: Click "Revoke" on key<br/>"saas_pat_a3f8bc12de4..."
    FE->>FE: window.confirm("Revoke? Cannot be undone.")
    Admin->>FE: Confirm

    FE->>SYNC: DELETE /api-keys/saas_pat_a3f8bc12de4<br/>Authorization: Bearer <JWT>
    SYNC->>SYNC: _require_tenant_admin(event)
    SYNC->>PG: UPDATE pat_tokens<br/>SET status = 'revoked'<br/>WHERE token_prefix = %s<br/>AND tenant_id = %s<br/>AND status = 'active'
    PG-->>SYNC: 1 row updated
    SYNC-->>FE: 200 {status: "revoked"}
    FE-->>Admin: Key shows "revoked" badge (grayed out)

    Note over Script,AUTH: Moments later — script tries to use the revoked key

    Script->>AUTH: X-API-Key: saas_pat_a3f8bc12de456789...
    AUTH->>AUTH: SHA-256 hash the token
    AUTH->>PG: SELECT ... FROM pat_tokens<br/>WHERE token_hash = %s<br/>AND status = 'active'  ← THIS FILTER
    PG-->>AUTH: No rows (status = 'revoked')
    AUTH-->>Script: 401 Unauthorized

    Note over Script,AUTH: Revocation is INSTANT.<br/>No cache, no delay, no token refresh needed.
```

## Diagram 4: Dual Auth — How both paths coexist

```mermaid
flowchart TB
    subgraph REQUEST["Incoming Request"]
        A[Client sends request to API Gateway]
    end

    subgraph AUTHORIZER["Lambda Authorizer (pat-authorizer-lambda)"]
        B{Check headers}

        B -->|"Authorization: Bearer <JWT>"| C[Cognito Path]
        B -->|"X-API-Key: saas_pat_xxx"| D[PAT Path]
        B -->|Neither header present| E[raise Unauthorized]

        subgraph COGNITO_PATH["Path 1: Cognito JWT"]
            C --> C1["cognito.get_user(AccessToken)"]
            C1 --> C2["Extract: sub, email,<br/>custom:tenant_id, custom:role"]
            C2 --> C3["Return Allow + context:<br/>{auth_type: 'cognito',<br/>tenant_id, user_id, email, role}"]
        end

        subgraph PAT_PATH["Path 2: PAT Token"]
            D --> D1["SHA-256 hash the token"]
            D1 --> D2["PostgreSQL: SELECT FROM pat_tokens<br/>WHERE token_hash = hash<br/>AND status = 'active'<br/>AND not expired"]
            D2 -->|Found| D3["Update last_used_at<br/>Return Allow + context:<br/>{auth_type: 'pat',<br/>tenant_id, user_id, email,<br/>role, scopes}"]
            D2 -->|Not found| E
        end
    end

    subgraph DOWNSTREAM["Downstream Lambda"]
        F["Reads context from<br/>event.requestContext.authorizer"]
        F --> G{auth_type?}
        G -->|cognito| H["Browser user flow<br/>(existing behavior, unchanged)"]
        G -->|pat| I["API key flow<br/>Check scopes for authorization"]
    end

    C3 --> F
    D3 --> F
    E --> REJECT["API Gateway returns 401"]

    style COGNITO_PATH fill:#dbeafe,stroke:#3b82f6
    style PAT_PATH fill:#fef3c7,stroke:#f59e0b
    style REJECT fill:#fee2e2,stroke:#ef4444
```
