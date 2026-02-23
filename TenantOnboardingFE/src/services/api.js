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