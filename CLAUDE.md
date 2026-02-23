# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TenantLambda is a multi-tenant SaaS onboarding and authentication platform. It enables users to sign up for workspaces on a main domain (e.g., `motadata.com`) and log in to tenant-specific subdomains (e.g., `acme-corp.motadata.com`) using passwordless email OTP via AWS Cognito. this is poc for multi-tenant Saas onboarding project.

## Repository Structure

```
TenantLambda/
├── TenantOnboardingFE/     # React 19 frontend (Create React App)
├── onboarding-lambda/      # Python Lambda: signup, OTP, tenant creation
└── signin-lambda/          # Python Lambda: tenant-specific login
```

## Commands

### Frontend (TenantOnboardingFE/)

```bash
npm start          # Dev server at localhost:3000
npm run build      # Production build to ./build/
npm test           # Run tests (jest via react-scripts)
```

### Backend (Lambda functions)

No local test runner is configured. Lambda functions are Python and deployed to AWS. Test by deploying and invoking via API Gateway or `aws lambda invoke`.

## Architecture

### Frontend

The React app serves two modes, determined by a `tenant_slug` browser cookie (set by a CloudFront Function at the CDN edge):

- **Default mode** (`tenant_slug = 'default'`): Main site — users can sign up or log in to create a new workspace
- **Tenant mode** (any other slug): Branded tenant login — only shows the login/verify flow for that specific tenant

**Key abstraction** — `src/config.js` reads the cookie and exports `isTenantMode` and `tenantSlug`. All routing and API calls branch on this.

**API service layer** (`src/services/api.js`) contains two logical groups:
- Onboarding APIs: `sendOtp`, `verifyOtp`, `checkSlug`, `createTenant`
- Signin APIs: `signinSendOtp`, `signinVerifyOtp`, `getTenantInfo`

**State** is managed via `TenantContext` which fetches and exposes tenant branding config (logo, name, colors) from S3.

### Onboarding Lambda

Handles the main site flows. Four routes:
- `POST /auth/send-otp` — sends OTP; also detects if email already has a tenant (returns `has_tenant` flag)
- `POST /auth/verify-otp` — verifies OTP, returns Cognito tokens
- `GET /onboarding/check-slug` — validates subdomain availability against PostgreSQL + reserved slugs table
- `POST /onboarding/tenant` — 11-step tenant creation process:
  1. Verify access token, extract email
  2. Check user isn't already onboarded
  3. Validate inputs (company name, slug, plan)
  4. Check slug availability
  5. Create tenant record in PostgreSQL (`status=PENDING`)
  6. Create per-tenant Cognito App Client
  7. Update user's Cognito attributes (`custom:tenant_id`, `custom:role`)
  8. Insert user into `tenant_users` table
  9. Upload branding config JSON to S3 (`branding/{slug}.json`)
  10. Send welcome email via SES
  11. Set tenant `status=ACTIVE`

### Signin Lambda

Handles tenant subdomain login. Read-only against the database — never mutates tenant data. Three routes:
- `GET /signin/tenant-info` — returns tenant branding for the login page
- `POST /signin/send-otp` — validates the email belongs to that tenant before sending OTP
- `POST /signin/verify-otp` — verifies OTP and returns tokens scoped to the tenant's Cognito App Client

### AWS Services

| Service | Purpose |
|---------|---------|
| Cognito | Shared user pool; per-tenant App Clients for token isolation |
| SES | Welcome emails on workspace creation |
| S3 | Per-tenant branding config (`branding/{slug}.json`) |
| API Gateway | HTTP trigger for both Lambda functions |
| CloudFront | Serves frontend; injects `tenant_slug` cookie based on subdomain |

### Database (PostgreSQL)

Key tables:
- `tenants` — `id`, `name`, `slug`, `subdomain`, `cognito_client_id`, `plan`, `status`, timestamps
- `tenant_users` — `id`, `tenant_id`, `cognito_sub`, `email`, `role`
- `reserved_slugs` — slugs that cannot be registered

### Environment Variables

**onboarding-lambda:**
- `COGNITO_USER_POOL_ID`, `SIGNUP_CLIENT_ID`, `APP_DOMAIN`
- `TENANT_ASSETS_BUCKET`, `SES_FROM_EMAIL`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

**signin-lambda:**
- `COGNITO_USER_POOL_ID`, `APP_DOMAIN`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

**Frontend** (`.env`):
- `REACT_APP_ONBOARDING_API_URL`
- `REACT_APP_SIGNIN_API_URL`
- `REACT_APP_DOMAIN`
- `REACT_APP_NAME`
