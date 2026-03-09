import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTenant } from "../context/TenantContext";
import { createApproval, notifyApproval } from "../services/api";
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

        {/* API Key Management (admin only) */}
        {isAdmin && (
          <div
            style={{
              marginTop: 12,
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
              <span style={{ fontSize: 22 }}>🔑</span>
              <div>
                <div style={{ fontWeight: 600, color: "var(--gray-800)" }}>
                  API Key Management
                </div>
                <div style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 2 }}>
                  Create and manage scoped API keys for scripts, integrations, and automation
                </div>
              </div>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => navigate("/admin/api-keys")}
              style={{ whiteSpace: "nowrap" }}
            >
              Manage Keys →
            </button>
          </div>
        )}

        {/* Magic Link Demo — Approval Request */}
        <div
          style={{
            marginTop: 24,
            padding: "20px",
            background: "white",
            border: "1px solid var(--gray-200)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 22 }}>✉️</span>
            <div>
              <div style={{ fontWeight: 600, color: "var(--gray-800)" }}>
                Magic Link Demo — Approval Request
              </div>
              <div style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 2 }}>
                Create a demo approval and receive a magic link email. Click the link to land directly on the approval page — no login required.
              </div>
            </div>
          </div>

          <DemoApprovalForm
            accessToken={userData.accessToken}
            userEmail={userData.email}
            tenantSlug={userData.tenantSlug}
          />
        </div>

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


function DemoApprovalForm({ accessToken, userEmail, tenantSlug }) {
  const [title, setTitle] = useState("Deploy v2.4.1 to Production");
  const [description, setDescription] = useState("Requesting approval to deploy the latest release to the production cluster.");
  const [approverEmail, setApproverEmail] = useState(userEmail || "");
  const [status, setStatus] = useState("idle"); // idle, creating, sending, done, error
  const [error, setError] = useState("");

  async function handleSend() {
    setStatus("creating");
    setError("");
    try {
      const approval = await createApproval(
        { title, description, approver_email: approverEmail },
        accessToken
      );

      setStatus("sending");
      await notifyApproval(approval.id, accessToken);

      setStatus("done");
    } catch (err) {
      setError(err.message || "Something went wrong");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div style={{ padding: 16, background: "#D1FAE5", borderRadius: 8, textAlign: "center" }}>
        <p style={{ margin: 0, fontWeight: 600, color: "#065F46" }}>
          ✓ Magic link sent to {approverEmail}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#065F46" }}>
          Check your email and click the link to land directly on the approval page.
        </p>
        <button
          onClick={() => setStatus("idle")}
          style={{
            marginTop: 12, padding: "6px 16px", background: "transparent",
            border: "1px solid #065F46", borderRadius: 6, color: "#065F46",
            cursor: "pointer", fontSize: 13,
          }}
        >
          Send Another
        </button>
      </div>
    );
  }

  const isLoading = status === "creating" || status === "sending";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--gray-300)",
            fontSize: 14, boxSizing: "border-box",
          }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{
            width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--gray-300)",
            fontSize: 14, resize: "vertical", boxSizing: "border-box",
          }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          Send magic link to (email)
        </label>
        <input
          type="email"
          value={approverEmail}
          onChange={(e) => setApproverEmail(e.target.value)}
          style={{
            width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--gray-300)",
            fontSize: 14, boxSizing: "border-box",
          }}
        />
      </div>
      {error && <p style={{ color: "#DC2626", fontSize: 13, margin: 0 }}>{error}</p>}
      <button
        onClick={handleSend}
        disabled={isLoading || !title || !approverEmail}
        style={{
          padding: "10px 20px", backgroundColor: "#4F46E5", color: "white",
          border: "none", borderRadius: 6, cursor: isLoading ? "not-allowed" : "pointer",
          fontSize: 14, fontWeight: 600, opacity: isLoading ? 0.7 : 1,
          alignSelf: "flex-start",
        }}
      >
        {isLoading ? (status === "creating" ? "Creating approval..." : "Sending email...") : "Create & Send Magic Link"}
      </button>
    </div>
  );
}
