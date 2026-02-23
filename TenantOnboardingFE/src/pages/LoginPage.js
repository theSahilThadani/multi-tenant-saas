import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "../context/TenantContext";
import LoadingSpinner from "../components/LoadingSpinner";
import { sendOtp, signinSendOtp } from "../services/api";
import config from "../config";

export default function LoginPage() {
  const navigate = useNavigate();
  const tenant = useTenant();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isTenantMode = tenant.isTenantMode;
  const displayName = isTenantMode ? tenant.tenantName : config.APP_NAME;

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
      if (isTenantMode) {
        // ── TENANT MODE: acme-corp.motadata.com ──
        const result = await signinSendOtp(trimmed, tenant.tenantSlug);
        navigate("/verify", {
          state: {
            email: trimmed,
            session: result.session,
            mode: "TENANT",
            tenantSlug: tenant.tenantSlug,
            tenantName: result.tenantName,
          },
        });
      } else {
        // ── MAIN SITE: motadata.com ──
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
      }
    } catch (err) {
      if (err.error === "USER_NOT_FOUND") {
        setError("No account found for this workspace. Contact your admin.");
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
    <div className="page-wrapper">
      <header className="page-header">
        <a href="/" className="logo">
          <div className="logo-icon">{displayName.charAt(0)}</div>
          <span className="logo-text">{displayName}</span>
        </a>
      </header>

      <main className="page-content">
        <div className="card">
          <div className="card-header">
            <h1>
              {isTenantMode
                ? `Sign in to ${tenant.tenantName}`
                : `Welcome to ${config.APP_NAME}`}
            </h1>
            <p>Enter your email to continue</p>
          </div>

          <div className="card-body">
            {error && (
              <div className="alert alert-error">
                <span className="alert-icon">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label className="form-label">
                  Email <span className="required">*</span>
                </label>
                <input
                  type="email"
                  className={`form-input ${error ? "error" : ""}`}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder={
                    isTenantMode
                      ? "yourname@company.com"
                      : "admin@yourcompany.com"
                  }
                  disabled={loading}
                  autoFocus
                  autoComplete="email"
                />
                <div className="form-hint">
                  We'll send a verification code to this email
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 28 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !email.trim()}
                >
                  {loading ? (
                    <>
                      <LoadingSpinner white size={18} />
                      Sending code...
                    </>
                  ) : (
                    <>📧 Continue</>
                  )}
                </button>
              </div>
            </form>

            {/* Show signup link only on main site */}
            {!isTenantMode && (
              <div
                style={{
                  textAlign: "center",
                  marginTop: 20,
                  fontSize: 14,
                  color: "var(--gray-500)",
                }}
              >
                <p>
                  New here?{" "}
                  <a
                    href="/signup"
                    style={{
                      color: "var(--primary)",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Create a workspace
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="page-footer">
        © 2026 {config.APP_NAME}. All rights reserved.
      </footer>
    </div>
  );
}