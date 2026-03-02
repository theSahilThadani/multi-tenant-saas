import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTenant } from "../context/TenantContext";
import config from "../config";

export default function DashboardPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const tenant = useTenant();

  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const stateData = location.state;
    if (stateData?.email) {
      const data = {
        email: stateData.email,
        accessToken: stateData.accessToken || "",
        role: stateData.role || "member",
        tenantSlug: stateData.tenantSlug || tenant.tenantSlug,
        tenantName: stateData.tenantName || tenant.tenantName,
      };
      sessionStorage.setItem("dashboard_user", JSON.stringify(data));
      setUserData(data);
    } else {
      const saved = sessionStorage.getItem("dashboard_user");
      if (saved) {
        try {
          setUserData(JSON.parse(saved));
        } catch {
          navigate("/login");
        }
      } else {
        navigate("/login");
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSignOut() {
    sessionStorage.removeItem("dashboard_user");
    navigate("/login");
  }

  if (!userData) {
    return (
      <div
        className="dashboard-wrapper"
        style={{
          alignItems: "center",
          justifyContent: "center",
          display: "flex",
          minHeight: "100vh",
        }}
      >
        <p style={{ color: "var(--gray-500)" }}>Loading dashboard...</p>
      </div>
    );
  }

  const displayTenantName = userData.tenantName || tenant.tenantName || "Workspace";
  const primaryColor = tenant.primaryColor || "#4F46E5";
  const userInitials = userData.email
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();
  const roleLabel = (userData.role || "member").replace(/_/g, " ");
  const isAdmin =
    userData.role === "admin" ||
    userData.role === "ADMIN" ||
    userData.role === "workspace_admin" ||
    userData.role === "tenant_admin";

  return (
    <div className="dashboard-wrapper">
      {/* ── Top Navigation Bar ── */}
      <nav className="dashboard-topbar">
        <div className="dashboard-topbar-logo">
          <div
            className="dashboard-topbar-logo-icon"
            style={{ background: primaryColor }}
          >
            {displayTenantName.charAt(0).toUpperCase()}
          </div>
          <span className="dashboard-topbar-name">{displayTenantName}</span>
        </div>

        <div className="dashboard-topbar-right">
          <div
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <div className="user-avatar" style={{ background: primaryColor }}>
              {userInitials}
            </div>
            <span className="user-email-label">{userData.email}</span>
          </div>
          <button className="btn-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="dashboard-main">
        {/* Welcome Banner */}
        <div className="dashboard-welcome">
          <h1>Welcome back 👋</h1>
          <p>
            You're signed in to the{" "}
            <strong>{displayTenantName}</strong> workspace
          </p>
        </div>

        {/* Stats Row */}
        <div className="dashboard-grid">
          <div className="stat-card">
            <div
              className="stat-card-icon"
              style={{ background: "var(--primary-50)" }}
            >
              👤
            </div>
            <div className="stat-card-label">Logged in as</div>
            <div className="stat-card-value" style={{ fontSize: 14 }}>
              {userData.email}
            </div>
          </div>

          <div className="stat-card">
            <div
              className="stat-card-icon"
              style={{ background: "var(--success-light)" }}
            >
              🏷️
            </div>
            <div className="stat-card-label">Your Role</div>
            <div className="stat-card-value" style={{ textTransform: "capitalize" }}>
              {roleLabel}
            </div>
          </div>

          <div className="stat-card">
            <div
              className="stat-card-icon"
              style={{ background: "var(--warning-light)" }}
            >
              🌐
            </div>
            <div className="stat-card-label">Workspace URL</div>
            <div className="stat-card-value" style={{ fontSize: 13 }}>
              {userData.tenantSlug}.{config.APP_DOMAIN}
            </div>
          </div>
        </div>

        {/* Info Cards */}
        <div className="dashboard-info-grid">
          {/* Account Details */}
          <div className="info-card">
            <div className="info-card-header">
              <h3>Account Details</h3>
            </div>
            <div className="info-card-body">
              <div className="info-row">
                <span className="info-label">Email</span>
                <span className="info-value" style={{ fontSize: 13 }}>
                  {userData.email}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Role</span>
                <span className="info-value">
                  <span
                    className={`badge ${
                      isAdmin ? "badge-primary" : "badge-success"
                    }`}
                  >
                    {roleLabel}
                  </span>
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Auth Method</span>
                <span className="info-value">
                  {userData.authMethod === "SSO" ? "SSO / Federated" : "Passwordless OTP"}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Status</span>
                <span
                  className="info-value"
                  style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <span style={{ fontSize: 8 }}>●</span> Active
                </span>
              </div>
            </div>
          </div>

          {/* Workspace Details */}
          <div className="info-card">
            <div className="info-card-header">
              <h3>Workspace</h3>
            </div>
            <div className="info-card-body">
              <div className="info-row">
                <span className="info-label">Name</span>
                <span className="info-value">{displayTenantName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Subdomain</span>
                <span
                  className="info-value"
                  style={{ fontSize: 13, color: "var(--primary)" }}
                >
                  {userData.tenantSlug}
                </span>
              </div>
              {tenant.plan && (
                <div className="info-row">
                  <span className="info-label">Plan</span>
                  <span className="info-value">
                    <span className="badge badge-warning">{tenant.plan}</span>
                  </span>
                </div>
              )}
              <div className="info-row">
                <span className="info-label">Status</span>
                <span className="info-value">
                  <span className="badge badge-success">Active</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Settings Link */}
        {isAdmin && (
          <div
            style={{
              marginTop: 24,
              padding: "16px 20px",
              background: "white",
              border: "1px solid var(--gray-200)",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>⚙️</span>
              <div>
                <div style={{ fontWeight: 600, color: "var(--gray-800)" }}>
                  SSO / Identity Provider Settings
                </div>
                <div style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 2 }}>
                  Configure Google, Okta, Azure AD or any OIDC/SAML provider for your workspace
                </div>
              </div>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => navigate("/admin/settings")}
              style={{ whiteSpace: "nowrap" }}
            >
              Manage SSO →
            </button>
          </div>
        )}

        {/* Footer note */}
        <div
          style={{
            marginTop: 32,
            padding: "16px 20px",
            background: "var(--primary-50)",
            border: "1px solid var(--primary-100)",
            borderRadius: "var(--radius-lg)",
            fontSize: 13,
            color: "var(--primary-700)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>🔐</span>
          <span>
            Your session is secured with passwordless authentication via{" "}
            <strong>{config.APP_NAME}</strong>. You're accessing{" "}
            <strong>{userData.tenantSlug}.{config.APP_DOMAIN}</strong>.
          </span>
        </div>
      </main>
    </div>
  );
}
