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

  return (
    <div className="page-wrapper">
      <header className="page-header">
        <a href="/" className="logo">
          <div className="logo-icon">{config.APP_NAME.charAt(0)}</div>
          <span className="logo-text">{config.APP_NAME}</span>
        </a>
      </header>

      <main className="page-content">
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="card-header" style={{ paddingBottom: 24 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "var(--primary-50)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
                margin: "0 auto 20px",
              }}
            >
              👋
            </div>
            <h1>We found your workspace!</h1>
            <p>
              {email ? (
                <>
                  Welcome back, <strong>{email}</strong>
                </>
              ) : (
                "Your workspace is ready"
              )}
            </p>
          </div>

          <div className="card-body">
            <div style={{ marginBottom: 24 }}>
              <div className="info-row">
                <span className="info-label">Workspace</span>
                <span className="info-value">{tenantName}</span>
              </div>
              {email && (
                <div className="info-row">
                  <span className="info-label">Email</span>
                  <span className="info-value" style={{ fontSize: 13 }}>
                    {email}
                  </span>
                </div>
              )}
              {role && (
                <div className="info-row">
                  <span className="info-label">Role</span>
                  <span className="info-value">
                    <span className="badge badge-primary">
                      {role.replace(/_/g, " ")}
                    </span>
                  </span>
                </div>
              )}
              <div className="info-row">
                <span className="info-label">Login URL</span>
                <span
                  className="info-value"
                  style={{ fontSize: 13, color: "var(--primary)" }}
                >
                  {loginUrl}
                </span>
              </div>
            </div>

            <div className="alert alert-success" style={{ marginBottom: 24 }}>
              <span className="alert-icon">ℹ️</span>
              <span>
                Visit your workspace URL and sign in with your email to access
                the dashboard.
              </span>
            </div>

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
              Go to My Workspace →
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
