import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import config from "../config";

export default function WelcomeBackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const data = location.state || {};

  const tenantSlug = data.tenantSlug || "";
  const tenantName = data.tenantName || tenantSlug;
  const email = data.email || "";
  const role = data.role || data.tenantRole || "";
  const loginUrl =
    data.loginUrl ||
    data.dashboardUrl ||
    `https://${tenantSlug}.${config.APP_DOMAIN}`;

  if (!tenantSlug) {
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
                Go to Login
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Build redirect URL with token
  const accessToken = data.accessToken || "";
  const redirectUrl = accessToken
    ? `${loginUrl}?token=${encodeURIComponent(accessToken)}`
    : loginUrl;

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
            <div className="success-icon">👋</div>
            <h1>Welcome back!</h1>
            <p>You're signed in to {tenantName}</p>
          </div>

          <div className="card-body">
            <div style={{ marginBottom: 28 }}>
              <div className="info-row">
                <span className="info-label">Workspace</span>
                <span className="info-value">{tenantName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Email</span>
                <span className="info-value">{email}</span>
              </div>
              {role && (
                <div className="info-row">
                  <span className="info-label">Role</span>
                  <span
                    className="info-value"
                    style={{ textTransform: "capitalize" }}
                  >
                    {role.replace("_", " ")}
                  </span>
                </div>
              )}
              <div className="info-row">
                <span className="info-label">URL</span>
                <span className="info-value">{loginUrl}</span>
              </div>
            </div>

            <a
              href={redirectUrl}
              className="btn btn-primary"
              style={{
                display: "block",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Go to Dashboard →
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