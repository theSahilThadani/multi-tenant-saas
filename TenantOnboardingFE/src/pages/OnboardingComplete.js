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
            <div className="card-body" style={{ textAlign: "center", padding: 60 }}>
              <p style={{ color: "var(--gray-500)", marginBottom: 20 }}>
                No workspace data found.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => navigate("/login")}
                style={{ width: "auto" }}
              >
                Create a Workspace
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <header className="page-header">
        <a href="/" className="logo">
          <div className="logo-icon">{config.APP_NAME.charAt(0)}</div>
          <span className="logo-text">{config.APP_NAME}</span>
        </a>
      </header>

      <main className="page-content">
        <div className="card">
          <div className="card-header">
            <div className="success-icon">🎉</div>
            <h1>{data.tenantName || data.name} is ready!</h1>
            <p>Your workspace has been created successfully</p>
          </div>

          <div className="card-body">
            <div style={{ marginBottom: 24 }}>
              <label className="form-label">Your Workspace URL</label>
              <div className="url-box">
                <span className="url-text">{loginUrl}</span>
                <button className="copy-btn" onClick={handleCopy} title="Copy URL">
                  {copied ? "✓" : "📋"}
                </button>
              </div>
              {copied && (
                <div className="form-success">Copied to clipboard!</div>
              )}
            </div>

            <div style={{ marginBottom: 28 }}>
              <div className="info-row">
                <span className="info-label">Admin Email</span>
                <span className="info-value">{data.adminEmail}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Authentication</span>
                <span className="info-value">Passwordless (Email OTP)</span>
              </div>
              <div className="info-row">
                <span className="info-label">Plan</span>
                <span
                  className="info-value"
                  style={{ textTransform: "capitalize" }}
                >
                  {data.plan}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Status</span>
                <span className="info-value" style={{ color: "var(--success)" }}>
                  ● Active
                </span>
              </div>
            </div>

            <div className="alert alert-success" style={{ marginBottom: 28 }}>
              <span className="alert-icon">📧</span>
              <span>
                Welcome email sent! You can now login at your workspace URL.
              </span>
            </div>

            <a
              href={loginUrl}
              className="btn btn-primary"
              style={{
                display: "block",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Go to Workspace →
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