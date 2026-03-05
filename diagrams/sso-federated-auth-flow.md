# SSO & Federated Authentication — End-to-End Flow

## Diagram 1: SSO Configuration (Admin sets up OIDC/SAML)

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Tenant Admin<br/>(Browser)
    participant FE as React Frontend<br/>AdminSettingsPage.js
    participant APIGW as API Gateway
    participant OB as onboarding-lambda<br/>handler.py
    participant COG as AWS Cognito<br/>User Pool
    participant PG as PostgreSQL<br/>tenant_idp_configs

    Note over Admin,PG: PHASE 1 — Admin configures SSO provider (e.g. Google OIDC)

    Admin->>FE: Navigate to /admin/settings
    FE->>FE: Check sessionStorage.dashboard_user<br/>Verify role === "tenant_admin"
    FE->>FE: setAccessToken(data.accessToken)

    FE->>APIGW: GET /admin/idp-config<br/>Authorization: Bearer <JWT>
    APIGW->>OB: Route to handle_get_idp_config()
    OB->>OB: _require_tenant_admin(event)<br/>→ cognito.get_user() → verify role
    OB->>PG: SELECT * FROM tenant_idp_configs<br/>WHERE tenant_id = %s
    PG-->>OB: null (not configured yet)
    OB-->>FE: 200 {configured: false}
    FE-->>Admin: Show empty SSO config form

    Note over Admin,PG: PHASE 2 — Admin fills in OIDC provider details

    Admin->>FE: Fill form:<br/>• Type: OIDC<br/>• Display Name: "Sign in with Google"<br/>• Issuer URL: https://accounts.google.com<br/>• Client ID: xxx.apps.googleusercontent.com<br/>• Client Secret: GOCSPX-xxx<br/>• Scopes: openid email profile
    Admin->>FE: Click "Save Configuration"

    FE->>APIGW: POST /admin/idp-config<br/>Authorization: Bearer <JWT><br/>Body: {idpType:"oidc", displayName, oidcIssuerUrl,<br/>oidcClientId, oidcClientSecret, oidcScopes}

    APIGW->>OB: Route to handle_save_idp_config()
    OB->>OB: _require_tenant_admin(event)

    Note over OB,COG: Step 1: Delete old IDP if exists
    OB->>PG: Check existing: get_idp_config(tenant_id)
    PG-->>OB: null (first time)

    Note over OB,COG: Step 2: Create Cognito Identity Provider
    OB->>COG: cognito.create_identity_provider(<br/>  UserPoolId, ProviderName: "acme-oidc",<br/>  ProviderType: "OIDC",<br/>  ProviderDetails: {<br/>    client_id, client_secret,<br/>    oidc_issuer: "https://accounts.google.com",<br/>    authorize_scopes: "openid email profile"<br/>  },<br/>  AttributeMapping: {<br/>    email → email, username → sub, name → name<br/>  })
    COG-->>OB: IDP "acme-oidc" created

    Note over OB,COG: Step 3: Update App Client to allow this IDP
    OB->>COG: cognito.describe_user_pool_client(ClientId)<br/>→ get existing settings
    COG-->>OB: Current App Client config
    OB->>COG: cognito.update_user_pool_client(<br/>  SupportedIdentityProviders: ["COGNITO", "acme-oidc"],<br/>  AllowedOAuthFlows: ["code"],<br/>  AllowedOAuthScopes: ["openid","email","profile"],<br/>  CallbackURLs: ["https://acme.domain.com/auth/callback"])
    COG-->>OB: App Client updated

    Note over OB,PG: Step 4: Save config to database
    OB->>PG: INSERT/UPDATE tenant_idp_configs<br/>(tenant_id, idp_type:"oidc",<br/>display_name, cognito_idp_name:"acme-oidc",<br/>oidc_client_id, oidc_client_secret,<br/>oidc_issuer_url, oidc_scopes,<br/>cognito_login_enabled:true,<br/>sso_login_enabled:true)
    PG-->>OB: Saved

    OB-->>FE: 200 {configured:true, idpType:"oidc",<br/>displayName:"Sign in with Google", ...}
    FE-->>Admin: Show "SSO configured successfully"<br/>Display toggle switches for OTP + SSO
```

## Diagram 2: SSO/Federated Login (User signs in via Google/Okta)

```mermaid
sequenceDiagram
    autonumber
    actor User as User<br/>(Browser)
    participant FE as React Frontend<br/>LoginPage.js → TenantLogin
    participant CF as CloudFront<br/>+ CF Function
    participant S3 as S3 Branding<br/>branding/{slug}.json
    participant SIGNIN as signin-lambda
    participant PG as PostgreSQL
    participant COG_UI as Cognito<br/>Hosted UI
    participant IDP as External IDP<br/>(Google / Okta / Azure)
    participant COG as AWS Cognito<br/>User Pool
    participant CB as React Frontend<br/>OAuthCallbackPage.js

    Note over User,IDP: PHASE 1 — User visits tenant subdomain

    User->>CF: GET https://acme-corp.nextgendevacademy.com
    CF->>CF: CloudFront Function (viewer-response):<br/>Extract subdomain "acme-corp"<br/>Set cookie: tenant_slug=acme-corp
    CF-->>User: Serve React app + tenant_slug cookie

    FE->>FE: config.js reads hostname:<br/>getSlugFromHostname() → "acme-corp"<br/>isTenantMode = true

    FE->>FE: TenantContext.js detects tenant mode<br/>Calls getTenantInfo("acme-corp")

    FE->>SIGNIN: GET /signin/tenant-info?slug=acme-corp
    SIGNIN->>PG: SELECT * FROM tenants<br/>WHERE slug = 'acme-corp' AND status = 'ACTIVE'
    PG-->>SIGNIN: Tenant row (id, name, cognito_client_id, plan)
    SIGNIN->>S3: GET branding/acme-corp.json
    S3-->>SIGNIN: {primaryColor, logoUrl, welcomeMessage, ...}
    SIGNIN->>PG: SELECT * FROM tenant_idp_configs<br/>WHERE tenant_id = %s
    PG-->>SIGNIN: IDP config: {idp_type:"oidc",<br/>display_name:"Sign in with Google",<br/>cognito_idp_name:"acme-oidc",<br/>sso_login_enabled:true,<br/>cognito_login_enabled:true}

    SIGNIN-->>FE: 200 {tenantName, primaryColor, logoUrl,<br/>cognitoClientId, cognitoDomain,<br/>idpType:"oidc",<br/>idpDisplayName:"Sign in with Google",<br/>cognitoIdpName:"acme-oidc",<br/>ssoLoginEnabled:true, cognitoLoginEnabled:true}

    FE-->>User: Branded login page with:<br/>• Tenant logo + colors<br/>• Email OTP form (if cognitoLoginEnabled)<br/>• "Sign in with Google" button (if ssoLoginEnabled)

    Note over User,IDP: PHASE 2 — User clicks "Sign in with Google"

    User->>FE: Click "Sign in with Google" button

    FE->>FE: handleSsoLogin():<br/>1. Generate PKCE code_verifier (64 random bytes)<br/>2. SHA-256 hash → code_challenge<br/>3. Store code_verifier in sessionStorage

    FE->>COG_UI: Redirect browser to:<br/>https://{cognitoDomain}/oauth2/authorize?<br/>client_id={tenant_cognito_client_id}<br/>&response_type=code<br/>&scope=openid email profile<br/>&redirect_uri=https://acme-corp.domain.com/auth/callback<br/>&identity_provider=acme-oidc<br/>&code_challenge={hash}<br/>&code_challenge_method=S256

    COG_UI->>IDP: Redirect to Google login<br/>(Cognito acts as OIDC Relying Party)
    IDP-->>User: Show Google sign-in page

    Note over User,IDP: PHASE 3 — User authenticates at Google

    User->>IDP: Enter Google credentials / select account
    IDP->>IDP: Authenticate user<br/>Generate auth code for Cognito
    IDP-->>COG_UI: Redirect back to Cognito with auth code

    COG_UI->>COG_UI: Cognito exchanges code with Google<br/>Gets Google's id_token<br/>Maps attributes (email, name, sub)<br/>Creates/links user in User Pool<br/>Generates Cognito auth code

    COG_UI-->>User: Redirect to:<br/>https://acme-corp.domain.com/auth/callback<br/>?code={cognito_auth_code}

    Note over User,COG: PHASE 4 — Frontend handles callback

    User->>CB: Browser loads /auth/callback?code=xxx
    CB->>CB: OAuthCallbackPage.js:<br/>1. Extract code from URL params<br/>2. Retrieve code_verifier from sessionStorage<br/>3. Get tenantSlug from TenantContext
    CB->>CB: Show "Completing sign-in..." spinner

    CB->>SIGNIN: POST /signin/federated-verify<br/>Body: {code, tenantSlug:"acme-corp",<br/>codeVerifier, redirectUri}

    Note over SIGNIN,COG: PHASE 5 — Backend verifies and provisions

    SIGNIN->>PG: get_tenant_by_slug("acme-corp")
    PG-->>SIGNIN: Tenant (cognito_client_id, etc.)
    SIGNIN->>PG: get_idp_config(tenant_id)
    PG-->>SIGNIN: IDP config (sso_login_enabled: true)

    SIGNIN->>COG: POST {cognitoDomain}/oauth2/token<br/>grant_type=authorization_code<br/>client_id={tenant_cognito_client_id}<br/>code={auth_code}<br/>redirect_uri={callback_url}<br/>code_verifier={pkce_verifier}
    COG-->>SIGNIN: {access_token, id_token, refresh_token}

    SIGNIN->>SIGNIN: Decode id_token (base64, no sig verify):<br/>Extract: email, sub, aud (audience)

    SIGNIN->>SIGNIN: SECURITY CHECK 1:<br/>Verify aud === tenant.cognito_client_id<br/>(token was issued for THIS tenant's App Client)

    SIGNIN->>COG: cognito.get_user(AccessToken)<br/>Check custom:tenant_id attribute
    COG-->>SIGNIN: User attributes

    SIGNIN->>SIGNIN: SECURITY CHECK 2:<br/>If custom:tenant_id exists AND<br/>!== "acme-corp" → 403 WRONG_WORKSPACE<br/>(prevents cross-tenant access)

    Note over SIGNIN,PG: JIT (Just-In-Time) User Provisioning

    alt First-time SSO login (no custom:tenant_id set)
        SIGNIN->>COG: cognito.admin_update_user_attributes(<br/>  Username: cognito_username,<br/>  custom:tenant_id = "acme-corp",<br/>  custom:role = "user")
        COG-->>SIGNIN: Attributes set

        SIGNIN->>PG: upsert_tenant_user_by_sub(<br/>  tenant_id, sub, email, role:"user")<br/>INSERT INTO tenant_users ON CONFLICT DO UPDATE
        PG-->>SIGNIN: User row created/updated
    else Returning SSO user
        SIGNIN->>SIGNIN: User already provisioned, skip JIT
    end

    SIGNIN->>PG: get_tenant_user(tenant_id, email)
    PG-->>SIGNIN: {role: "user"}

    SIGNIN-->>CB: 200 {<br/>  verified: true,<br/>  email: "alice@gmail.com",<br/>  accessToken, idToken, refreshToken,<br/>  tenantSlug: "acme-corp",<br/>  tenantName: "Acme Corp",<br/>  role: "user",<br/>  authMethod: "SSO"<br/>}

    CB->>CB: sessionStorage.removeItem("pkce_verifier")
    CB->>CB: navigate("/dashboard", state: {<br/>  email, accessToken, role,<br/>  tenantSlug, tenantName,<br/>  authMethod: "SSO"<br/>})

    CB-->>User: Redirect to Dashboard<br/>Signed in as alice@gmail.com<br/>Auth method: SSO / Federated
```

## Diagram 3: OTP Login (Passwordless email — for comparison)

```mermaid
sequenceDiagram
    autonumber
    actor User as User<br/>(Browser)
    participant FE as React Frontend<br/>LoginPage.js → TenantLogin
    participant SIGNIN as signin-lambda
    participant COG as AWS Cognito
    participant PG as PostgreSQL
    participant EMAIL as User's Inbox

    Note over User,EMAIL: Tenant subdomain OTP login (acme-corp.domain.com)

    User->>FE: Enter email: alice@company.com
    User->>FE: Click "Continue with Email"

    FE->>SIGNIN: POST /signin/send-otp<br/>Body: {email: "alice@company.com",<br/>tenantSlug: "acme-corp"}

    SIGNIN->>PG: get_tenant_by_slug("acme-corp")
    PG-->>SIGNIN: Tenant (cognito_client_id: "abc123")

    SIGNIN->>COG: admin_get_user(Username: email)
    COG-->>SIGNIN: UserAttributes:<br/>custom:tenant_id = "acme-corp" ✅

    SIGNIN->>SIGNIN: Verify custom:tenant_id === "acme-corp"<br/>(prevent cross-tenant login)

    SIGNIN->>COG: cognito.initiate_auth(<br/>  ClientId: tenant_cognito_client_id,<br/>  AuthFlow: "USER_AUTH",<br/>  AuthParameters: {<br/>    USERNAME: email,<br/>    PREFERRED_CHALLENGE: "EMAIL_OTP"<br/>  })
    COG->>EMAIL: Send 8-digit OTP to alice@company.com
    COG-->>SIGNIN: {Session: "session-token"}
    SIGNIN-->>FE: 200 {email, session, tenantSlug}

    FE-->>User: Navigate to /verify page<br/>Show OTP input form

    User->>EMAIL: Check inbox
    EMAIL-->>User: OTP: 12345678

    User->>FE: Enter OTP: 12345678

    FE->>SIGNIN: POST /signin/verify-otp<br/>Body: {email, otp:"12345678",<br/>session, tenantSlug:"acme-corp"}

    SIGNIN->>PG: get_tenant_by_slug("acme-corp")
    PG-->>SIGNIN: Tenant

    SIGNIN->>COG: cognito.respond_to_auth_challenge(<br/>  ClientId: tenant_cognito_client_id,<br/>  ChallengeName: "EMAIL_OTP",<br/>  Session: session,<br/>  ChallengeResponses: {<br/>    USERNAME: email,<br/>    EMAIL_OTP_CODE: "12345678"<br/>  })
    COG-->>SIGNIN: AuthenticationResult: {<br/>  AccessToken, IdToken, RefreshToken<br/>}

    Note over SIGNIN: Tokens are scoped to TENANT's<br/>Cognito App Client (isolation)

    SIGNIN->>PG: get_tenant_user(tenant_id, email)
    PG-->>SIGNIN: {role: "tenant_admin"}

    SIGNIN-->>FE: 200 {verified:true, email,<br/>accessToken, idToken, refreshToken,<br/>tenantSlug, role:"tenant_admin"}

    FE->>FE: sessionStorage.setItem("dashboard_user",<br/>{email, accessToken, role, tenantSlug,...})
    FE-->>User: Navigate to /dashboard
```

## Diagram 4: Complete Authentication Architecture Overview

```mermaid
flowchart TB
    subgraph USERS["Who authenticates?"]
        BROWSER["Browser User<br/>(Human)"]
        SCRIPT["Script / Postman<br/>(Machine)"]
    end

    subgraph METHODS["3 Authentication Methods"]
        OTP["Email OTP<br/>(Passwordless)"]
        SSO["SSO / Federated<br/>(Google, Okta, Azure)"]
        PAT["API Key / PAT<br/>(saas_pat_xxx)"]
    end

    BROWSER --> OTP
    BROWSER --> SSO
    SCRIPT --> PAT

    subgraph FLOW_OTP["OTP Flow"]
        OTP --> OTP1["User enters email"]
        OTP1 --> OTP2["Cognito sends 8-digit code"]
        OTP2 --> OTP3["User enters code"]
        OTP3 --> OTP4["Cognito verifies → tokens"]
        OTP4 --> OTP5["Tokens scoped to<br/>tenant's App Client"]
    end

    subgraph FLOW_SSO["SSO Flow"]
        SSO --> SSO1["PKCE challenge generated"]
        SSO1 --> SSO2["Redirect → Cognito Hosted UI<br/>→ External IDP (Google)"]
        SSO2 --> SSO3["User authenticates at IDP"]
        SSO3 --> SSO4["IDP → Cognito → auth code<br/>→ /auth/callback"]
        SSO4 --> SSO5["Backend exchanges code → tokens<br/>Validates audience + tenant isolation<br/>JIT provisions user"]
    end

    subgraph FLOW_PAT["PAT Flow"]
        PAT --> PAT1["Admin creates key<br/>in /admin/api-keys UI"]
        PAT1 --> PAT2["SHA-256 hash stored in DB<br/>Raw key shown once"]
        PAT2 --> PAT3["Script sends<br/>X-API-Key header"]
        PAT3 --> PAT4["Lambda Authorizer:<br/>hash → DB lookup"]
        PAT4 --> PAT5["Returns user identity<br/>+ scopes to Lambda"]
    end

    subgraph GATEWAY["API Gateway (all paths converge)"]
        AUTH["Lambda Authorizer<br/>(dual-mode)"]
        AUTH --> |"Bearer JWT"| COG_CHECK["Cognito validates"]
        AUTH --> |"X-API-Key"| DB_CHECK["PostgreSQL lookup"]
        COG_CHECK --> CONTEXT
        DB_CHECK --> CONTEXT
        CONTEXT["Authorizer context:<br/>{auth_type, tenant_id,<br/>user_id, email, role, scopes}"]
    end

    OTP5 --> AUTH
    SSO5 --> AUTH
    PAT5 -.-> |"Already through authorizer"| CONTEXT

    CONTEXT --> LAMBDAS

    subgraph LAMBDAS["Downstream Lambdas"]
        L1["onboarding-lambda"]
        L2["signin-lambda"]
        L3["user-sync-lambda"]
        L4["future-lambda"]
    end

    subgraph SECURITY["Security Guarantees"]
        S1["Tenant Isolation:<br/>Per-tenant Cognito App Client<br/>custom:tenant_id attribute<br/>DB-level tenant_id filtering"]
        S2["Token Security:<br/>SHA-256 hashed PATs<br/>PKCE for SSO<br/>Short-lived Cognito tokens"]
        S3["Scope Control:<br/>PAT scopes limit access<br/>Role-based (tenant_admin/user)<br/>Audience validation for SSO"]
    end

    style FLOW_OTP fill:#dbeafe,stroke:#3b82f6
    style FLOW_SSO fill:#fce7f3,stroke:#ec4899
    style FLOW_PAT fill:#fef3c7,stroke:#f59e0b
    style SECURITY fill:#f0fdf4,stroke:#22c55e
```
