import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "../context/TenantContext";
import LoadingSpinner from "../components/LoadingSpinner";
import { sendOtp, signinSendOtp } from "../services/api";
import config from "../config";

// ── PKCE helpers ──
function generateCodeVerifier() {
  const array = new Uint8Array(64);
  window.crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function sha256Base64url(plain) {
  const data = new TextEncoder().encode(plain);
  const hash = await window.crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ─────────────────────────────────────────────────────────
// MAIN SITE: Branded split-screen trial signup / sign-in
// ─────────────────────────────────────────────────────────
function MainSiteLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      const result = await sendOtp(trimmed);
      navigate("/verify", {
        state: {
          email: trimmed,
          session: result.session,
          mode: "MAIN",
          hasTenant: result.hasTenant,
          tenantSlug: result.tenantSlug,
        },
      });
    } catch (err) {
      setError(err.message || "Could not send verification code. Try again.");
    }
    setLoading(false);
  }

  const features = [
    "Passwordless login — no passwords to manage",
    `Custom subdomain: yourteam.${config.APP_DOMAIN}`,
    "Role-based access control built in",
    "Up and running in under 2 minutes",
  ];

  return (
    <div className="split-layout">
      {/* ── Left: Branding Panel ── */}
      <div className="split-left">
        <div className="brand-hero">
          <div className="brand-logo-wrap">
            <div className="brand-logo-icon">{config.APP_NAME.charAt(0)}</div>
            <span className="brand-logo-name">{config.APP_NAME}</span>
          </div>

          <h1 className="brand-tagline">
            Launch your team workspace in minutes
          </h1>
          <p className="brand-sub">
            The all-in-one multi-tenant platform for modern teams. Get a branded
            subdomain, passwordless login, and your workspace live instantly.
          </p>

          <ul className="feature-list">
            {features.map((f, i) => (
              <li key={i} className="feature-item">
                <span className="feature-check">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className="trial-badge">
            ✦ Free 14-day trial · No credit card required
          </div>
        </div>
      </div>

      {/* ── Right: Form Panel ── */}
      <div className="split-right">
        <div className="auth-form-container">
          <h2>Start your free trial</h2>
          <p className="auth-sub">
            Enter your work email to get started. New users create a workspace;
            existing users are redirected to theirs.
          </p>

          {error && (
            <div className="alert alert-error">
              <span className="alert-icon">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label">
                Work Email <span className="required">*</span>
              </label>
              <input
                type="email"
                className={`form-input ${error ? "error" : ""}`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                placeholder="you@company.com"
                disabled={loading}
                autoFocus
                autoComplete="email"
              />
              <div className="form-hint">
                We'll send an 8-digit one-time code to this email
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 24 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || !email.trim()}
                style={{ fontSize: 16, padding: "14px 24px" }}
              >
                {loading ? (
                  <>
                    <LoadingSpinner white size={18} />
                    Sending code...
                  </>
                ) : (
                  "Get Started →"
                )}
              </button>
            </div>
          </form>

          <div
            style={{
              marginTop: 28,
              padding: "16px",
              background: "var(--gray-50)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--gray-200)",
              fontSize: 13,
              color: "var(--gray-600)",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "var(--gray-800)" }}>
              Already have a workspace?
            </strong>{" "}
            Enter your email above and you'll be redirected to your existing
            workspace after verification.
          </div>
        </div>

        <div className="split-right-footer">
          © 2026 {config.APP_NAME}. All rights reserved.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// TENANT SUBDOMAIN: Minimal branded login card
// ─────────────────────────────────────────────────────────
function TenantLogin() {
  const navigate = useNavigate();
  const tenant = useTenant();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  const primaryColor = tenant.primaryColor || "#4F46E5";

  async function handleSsoLogin() {
    setSsoLoading(true);
    setError("");
    try {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await sha256Base64url(codeVerifier);
      sessionStorage.setItem("pkce_verifier", codeVerifier);

      const params = new URLSearchParams({
        client_id: tenant.cognitoClientId,
        response_type: "code",
        scope: "openid email profile",
        redirect_uri: `${window.location.origin}/auth/callback`,
        identity_provider: tenant.cognitoIdpName,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });
      window.location.href = `${tenant.cognitoDomain}/oauth2/authorize?${params}`;
    } catch (err) {
      setError("Could not initiate SSO. Please try again.");
      setSsoLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      const result = await signinSendOtp(trimmed, tenant.tenantSlug);
      navigate("/verify", {
        state: {
          email: trimmed,
          session: result.session,
          mode: "TENANT",
          tenantSlug: tenant.tenantSlug,
          tenantName: tenant.tenantName,
        },
      });
    } catch (err) {
      if (err.error === "USER_NOT_FOUND") {
        setError("No account found here. Contact your admin.");
      } else if (err.error === "WRONG_WORKSPACE") {
        setError(err.message || "You belong to a different workspace.");
      } else if (err.error === "NO_WORKSPACE") {
        setError("This email is not associated with any workspace.");
      } else {
        setError(err.message || "Could not send verification code.");
      }
    }
    setLoading(false);
  }

  return (
    <div className="tenant-login-wrapper">
      <main className="tenant-login-content">
        <div className="tenant-login-card">
          {/* Tenant Branding Header */}
          <div className="tenant-brand-header">
            {tenant.logoUrl ? (
              <img
                src={tenant.logoUrl}
                alt={tenant.tenantName}
                style={{
                  height: 56,
                  maxWidth: 200,
                  objectFit: "contain",
                  margin: "0 auto 16px",
                  display: "block",
                }}
              />
            ) : (
              <div
                className="tenant-logo-circle"
                style={{ background: primaryColor }}
              >
                {tenant.tenantName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="tenant-brand-name">{tenant.tenantName}</div>
            <div className="tenant-brand-sub">
              {tenant.welcomeMessage || "Sign in to your workspace"}
            </div>
          </div>

          {/* Login Form */}
          <div style={{ padding: "32px 40px 40px" }}>
            {error && (
              <div className="alert alert-error">
                <span className="alert-icon">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* OTP form — shown when cognitoLoginEnabled */}
            {tenant.cognitoLoginEnabled !== false && (
              <form onSubmit={handleSubmit} noValidate>
                <div className="form-group">
                  <label className="form-label">
                    Email Address <span className="required">*</span>
                  </label>
                  <input
                    type="email"
                    className={`form-input ${error ? "error" : ""}`}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="yourname@company.com"
                    disabled={loading}
                    autoFocus={!tenant.ssoLoginEnabled}
                    autoComplete="email"
                  />
                  <div className="form-hint">
                    We'll send a one-time code to this email
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 8 }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || !email.trim()}
                    style={{ background: primaryColor }}
                  >
                    {loading ? (
                      <>
                        <LoadingSpinner white size={18} />
                        Sending code...
                      </>
                    ) : (
                      "Continue with Email →"
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Divider — shown when both OTP and SSO are active */}
            {tenant.cognitoLoginEnabled !== false && tenant.ssoLoginEnabled && (
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                margin: "20px 0", color: "var(--gray-400)", fontSize: 13,
              }}>
                <div style={{ flex: 1, height: 1, background: "var(--gray-200)" }} />
                <span>or</span>
                <div style={{ flex: 1, height: 1, background: "var(--gray-200)" }} />
              </div>
            )}

            {/* SSO button — shown when ssoLoginEnabled */}
            {tenant.ssoLoginEnabled && (
              <button
                type="button"
                onClick={handleSsoLogin}
                disabled={ssoLoading}
                style={{
                  width: "100%",
                  padding: "12px 24px",
                  border: `2px solid ${primaryColor}`,
                  borderRadius: "var(--radius)",
                  background: "white",
                  color: primaryColor,
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: ssoLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  transition: "all 0.15s",
                }}
              >
                {ssoLoading ? (
                  <>
                    <LoadingSpinner size={18} />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 18 }}>🔐</span>
                    {tenant.idpDisplayName || "Sign in with SSO"}
                  </>
                )}
              </button>
            )}
            <div
              style={{
                textAlign: "center",
                marginTop: 24,
                fontSize: 13,
                color: "var(--gray-400)",
              }}
            >
              Powered by{" "}
              <a
                href={`https://${config.APP_DOMAIN}`}
                style={{
                  color: "var(--primary)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
                target="_blank"
                rel="noopener noreferrer"
              >
                {config.APP_NAME}
              </a>
            </div>
          </div>
        </div>
      </main>

      <footer
        style={{
          padding: "20px",
          textAlign: "center",
          color: "rgba(255,255,255,0.5)",
          fontSize: 12,
        }}
      >
        © 2026 {config.APP_NAME}. All rights reserved.
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main export: switches on isTenantMode
// ─────────────────────────────────────────────────────────
export default function LoginPage() {
  const tenant = useTenant();
  return tenant.isTenantMode ? <TenantLogin /> : <MainSiteLogin />;
}
