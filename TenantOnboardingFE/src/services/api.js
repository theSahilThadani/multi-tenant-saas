import config from "../config";

// ─────────────────────────────────────────────
// ONBOARDING APIs (motadata.com)
// ─────────────────────────────────────────────

const ONBOARDING_URL = config.ONBOARDING_API_URL;

export async function sendOtp(email) {
  const res = await fetch(`${ONBOARDING_URL}/auth/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function verifyOtp(email, otp, session) {
  const res = await fetch(`${ONBOARDING_URL}/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp, session }),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function checkSlug(slug) {
  const res = await fetch(
    `${ONBOARDING_URL}/onboarding/check-slug?slug=${encodeURIComponent(slug)}`
  );
  return res.json();
}

export async function googleVerify(code, redirectUri) {
  const res = await fetch(`${ONBOARDING_URL}/auth/google-verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirectUri }),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function createTenant(data) {
  const res = await fetch(`${ONBOARDING_URL}/onboarding/tenant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw { status: res.status, ...result };
  return result;
}

// ─────────────────────────────────────────────
// SIGNIN APIs (acme-corp.motadata.com)
// ─────────────────────────────────────────────

const SIGNIN_URL = config.SIGNIN_API_URL;

export async function signinSendOtp(email, tenantSlug) {
  const res = await fetch(`${SIGNIN_URL}/signin/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, tenantSlug }),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function signinVerifyOtp(email, otp, session, tenantSlug) {
  const res = await fetch(`${SIGNIN_URL}/signin/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp, session, tenantSlug }),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function getTenantInfo(slug) {
  const res = await fetch(
    `${SIGNIN_URL}/signin/tenant-info?slug=${encodeURIComponent(slug)}`
  );
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function federatedVerify(code, tenantSlug, codeVerifier, redirectUri) {
  const res = await fetch(`${SIGNIN_URL}/signin/federated-verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, tenantSlug, codeVerifier, redirectUri }),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// ─────────────────────────────────────────────
// ADMIN IDP CONFIG APIs (onboarding endpoint, tenant_admin only)
// ─────────────────────────────────────────────

export async function getIdpConfig(accessToken) {
  const res = await fetch(`${ONBOARDING_URL}/admin/idp-config`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function saveIdpConfig(data, accessToken) {
  const res = await fetch(`${ONBOARDING_URL}/admin/idp-config`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw { status: res.status, ...result };
  return result;
}

export async function toggleIdpLoginModes(data, accessToken) {
  const res = await fetch(`${ONBOARDING_URL}/admin/idp-config/toggle`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw { status: res.status, ...result };
  return result;
}

export async function deleteIdpConfig(accessToken) {
  const res = await fetch(`${ONBOARDING_URL}/admin/idp-config`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// ─────────────────────────────────────────────
// PAT MANAGEMENT APIs (user-sync-lambda, tenant_admin only)
// ─────────────────────────────────────────────

const SYNC_URL = config.SYNC_API_URL;

export async function listTenantUsers(accessToken) {
  const res = await fetch(`${SYNC_URL}/api-keys/users`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function createPat(data, accessToken) {
  const res = await fetch(`${SYNC_URL}/api-keys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw { status: res.status, ...result };
  return result;
}

export async function listPats(accessToken) {
  const res = await fetch(`${SYNC_URL}/api-keys`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function revokePat(tokenPrefix, accessToken) {
  const res = await fetch(`${SYNC_URL}/api-keys/${encodeURIComponent(tokenPrefix)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// ─────────────────────────────────────────────
// MAGIC LINK APIs
// ─────────────────────────────────────────────

export async function verifyMagicLink(token) {
  const res = await fetch(`${ONBOARDING_URL}/magic-link/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function generateMagicLink(payload, accessToken) {
  const res = await fetch(`${ONBOARDING_URL}/magic-link/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// ─────────────────────────────────────────────
// DEMO APPROVAL APIs (Pattern A)
// ─────────────────────────────────────────────

export async function createApproval(data, accessToken) {
  const res = await fetch(`${ONBOARDING_URL}/demo/approvals`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw { status: res.status, ...result };
  return result;
}

export async function getApproval(approvalId, accessToken) {
  const res = await fetch(`${ONBOARDING_URL}/demo/approvals/${approvalId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function decideApproval(approvalId, decision, comment, accessToken) {
  const res = await fetch(`${ONBOARDING_URL}/demo/approvals/${approvalId}/decide`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ decision, comment }),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function notifyApproval(approvalId, accessToken) {
  const res = await fetch(`${ONBOARDING_URL}/demo/approvals/${approvalId}/notify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}