import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import config from "../config";

export default function OnboardingComplete() {
  const location = useLocation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const data = location.state || {};
  const loginUrl =
    data.loginUrl || `https://${data.slug}.${config.APP_DOMAIN}`;

  function handleCopy() {
    navigator.clipboard.writeText(loginUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!data.slug) {
    return (
      <div className="page-wrapper">
        <main className="page-content">
          <div className="card">
            <div
              className="card-body"
              style={{ textAlign: "center", padding: 60 }}
            >
              <p style={{ color: "var(--gray-500)", marginBottom: 20 }}>
                No workspace data found.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => navigate("/login")}
                style={{ width: "auto" }}
              >
                Go to Login
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const planLabel =
    data.plan === "free"
      ? "Free Trial"
      : data.plan === "pro"
      ? "Pro"
      : data.plan === "enterprise"
      ? "Enterprise"
      : data.plan;

  return (
    <div className="page-wrapper">
      <header className="page-header">
        <a href="/" className="logo">
          <div className="logo-icon">{config.APP_NAME.charAt(0)}</div>
          <span className="logo-text">{config.APP_NAME}</span>
        </a>
      </header>

      <main className="page-content">
        <div className="card" style={{ maxWidth: 540 }}>
          <div className="card-header" style={{ paddingBottom: 24 }}>
            {/* Celebration */}
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "var(--success-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 40,
                margin: "0 auto 20px",
              }}
            >
              🎉
            </div>
            <h1>{data.tenantName || data.name} is live!</h1>
            <p>Your workspace has been created successfully.</p>
          </div>

          <div className="card-body">
            {/* Step progress — all done */}
            <div className="onboarding-steps" style={{ marginBottom: 28 }}>
              {["Verify Email", "Configure", "Launch"].map((step, i) => (
                <div key={i} className="onboarding-step done">
                  <div className="onboarding-step-dot">✓</div>
                  <span>{step}</span>
                </div>
              ))}
            </div>

            {/* Login URL — primary CTA */}
            <div
              style={{
                background: "var(--primary-50)",
                border: "1.5px solid var(--primary-100)",
                borderRadius: "var(--radius-md)",
                padding: "20px",
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--primary-700)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 10,
                }}
              >
                🔗 Your Workspace Login URL
              </div>
              <div className="url-box" style={{ margin: 0 }}>
                <span className="url-text">{loginUrl}</span>
                <button
                  className="copy-btn"
                  onClick={handleCopy}
                  title="Copy URL"
                >
                  {copied ? "✓" : "📋"}
                </button>
              </div>
              {copied && (
                <div
                  className="form-success"
                  style={{ marginTop: 8, justifyContent: "center" }}
                >
                  ✓ Copied to clipboard!
                </div>
              )}
              <div
                style={{
                  fontSize: 12,
                  color: "var(--primary-700)",
                  marginTop: 10,
                }}
              >
                Bookmark this URL — it's the only way to log in to your workspace.
              </div>
            </div>

            {/* Details */}
            <div style={{ marginBottom: 24 }}>
              <div className="info-row">
                <span className="info-label">Admin Email</span>
                <span className="info-value" style={{ fontSize: 13 }}>
                  {data.adminEmail}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Authentication</span>
                <span className="info-value">Passwordless (Email OTP)</span>
              </div>
              <div className="info-row">
                <span className="info-label">Plan</span>
                <span className="info-value">
                  <span className="badge badge-warning">{planLabel}</span>
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Status</span>
                <span className="info-value">
                  <span className="badge badge-success">Active</span>
                </span>
              </div>
            </div>

            {/* Welcome email alert */}
            <div className="alert alert-success" style={{ marginBottom: 24 }}>
              <span className="alert-icon">📧</span>
              <span>
                Welcome email sent to <strong>{data.adminEmail}</strong>!
              </span>
            </div>

            {/* CTA */}
            <a
              href={loginUrl}
              className="btn btn-primary"
              style={{
                display: "flex",
                textAlign: "center",
                textDecoration: "none",
                fontSize: 16,
                padding: "14px 24px",
              }}
            >
              Go to Your Workspace →
            </a>
          </div>
        </div>
      </main>

      <footer className="page-footer">
        © 2026 {config.APP_NAME}. All rights reserved.
      </footer>
    </div>
  );
}
