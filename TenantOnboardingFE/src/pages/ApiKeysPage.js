import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "../context/TenantContext";
import LoadingSpinner from "../components/LoadingSpinner";
import {
  listTenantUsers,
  createPat,
  listPats,
  revokePat,
} from "../services/api";

const AVAILABLE_SCOPES = [
  { value: "users:read", label: "Users: Read", desc: "List and view tenant users" },
  { value: "users:write", label: "Users: Write", desc: "Create and manage users" },
  { value: "tenant:read", label: "Tenant: Read", desc: "View tenant information" },
  { value: "idp:manage", label: "IDP: Manage", desc: "Manage identity providers" },
  { value: "incidents:read", label: "Incidents: Read", desc: "Read incident data" },
  { value: "incidents:write", label: "Incidents: Write", desc: "Create and update incidents" },
  { value: "reports:read", label: "Reports: Read", desc: "Access reports" },
];

const EXPIRY_OPTIONS = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: 365, label: "1 year" },
];

export default function ApiKeysPage() {
  const navigate = useNavigate();
  const tenant = useTenant();

  // Auth
  const [userData, setUserData] = useState(null);
  const [accessToken, setAccessToken] = useState("");

  // Page state
  const [pageLoading, setPageLoading] = useState(true);
  const [keys, setKeys] = useState([]);
  const [users, setUsers] = useState([]);

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedScopes, setSelectedScopes] = useState([]);
  const [expiresInDays, setExpiresInDays] = useState(365);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Created key modal
  const [createdKey, setCreatedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  // Revoke
  const [revoking, setRevoking] = useState("");

  const primaryColor = tenant.primaryColor || "#4F46E5";

  // ── Load session ──
  useEffect(() => {
    const saved = sessionStorage.getItem("dashboard_user");
    if (!saved) {
      navigate("/login");
      return;
    }
    try {
      const data = JSON.parse(saved);
      if (data.role !== "tenant_admin") {
        navigate("/access-denied");
        return;
      }
      setUserData(data);
      setAccessToken(data.accessToken);
    } catch {
      navigate("/login");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load keys and users ──
  useEffect(() => {
    if (!accessToken) return;
    async function load() {
      setPageLoading(true);
      try {
        const [keysRes, usersRes] = await Promise.all([
          listPats(accessToken),
          listTenantUsers(accessToken),
        ]);
        setKeys(keysRes.keys || []);
        setUsers(usersRes.users || []);
      } catch (err) {
        console.error("[ApiKeys] Load error:", err);
      } finally {
        setPageLoading(false);
      }
    }
    load();
  }, [accessToken]);

  // ── Create PAT ──
  async function handleCreate(e) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const result = await createPat(
        {
          name: name.trim(),
          userId: selectedUserId,
          scopes: selectedScopes,
          expiresInDays,
        },
        accessToken
      );
      setCreatedKey(result);
      setCopied(false);
      // Reset form
      setName("");
      setSelectedUserId("");
      setSelectedScopes([]);
      setExpiresInDays(365);
      setShowCreateForm(false);
      // Reload keys list
      const keysRes = await listPats(accessToken);
      setKeys(keysRes.keys || []);
    } catch (err) {
      setCreateError(err.message || "Failed to create API key");
    } finally {
      setCreating(false);
    }
  }

  // ── Revoke PAT ──
  async function handleRevoke(tokenPrefix) {
    if (!window.confirm(`Revoke API key "${tokenPrefix}"? This cannot be undone.`)) return;
    setRevoking(tokenPrefix);
    try {
      await revokePat(tokenPrefix, accessToken);
      const keysRes = await listPats(accessToken);
      setKeys(keysRes.keys || []);
    } catch (err) {
      alert(err.message || "Failed to revoke key");
    } finally {
      setRevoking("");
    }
  }

  // ── Copy to clipboard ──
  function handleCopy() {
    if (createdKey?.apiKey) {
      navigator.clipboard.writeText(createdKey.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // ── Scope toggle ──
  function toggleScope(scope) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  if (!userData) {
    return (
      <div className="dashboard-wrapper" style={{ alignItems: "center", justifyContent: "center", display: "flex", minHeight: "100vh" }}>
        <p style={{ color: "var(--gray-500)" }}>Loading...</p>
      </div>
    );
  }

  const displayTenantName = userData.tenantName || tenant.tenantName || "Workspace";

  return (
    <div className="dashboard-wrapper">
      {/* ── Top Navigation ── */}
      <nav className="dashboard-topbar">
        <div className="dashboard-topbar-logo">
          <div className="dashboard-topbar-logo-icon" style={{ background: primaryColor }}>
            {displayTenantName.charAt(0).toUpperCase()}
          </div>
          <span className="dashboard-topbar-name">{displayTenantName}</span>
        </div>
        <div className="dashboard-topbar-right">
          <button className="btn btn-secondary" onClick={() => navigate("/dashboard")} style={{ fontSize: 13 }}>
            Back to Dashboard
          </button>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="dashboard-main">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: "var(--gray-900)" }}>API Key Management</h1>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--gray-500)" }}>
              Create and manage Personal Access Tokens (PATs) for scripts, integrations, and automation
            </p>
          </div>
          {!showCreateForm && !createdKey && (
            <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
              Create API Key
            </button>
          )}
        </div>

        {/* ── Created Key Modal ── */}
        {createdKey && (
          <div style={{
            marginBottom: 24, padding: 20, background: "#f0fdf4", border: "1px solid #bbf7d0",
            borderRadius: "var(--radius-lg)",
          }}>
            <div style={{ fontWeight: 600, color: "#166534", marginBottom: 8 }}>
              API Key Created Successfully
            </div>
            <p style={{ fontSize: 13, color: "#166534", margin: "0 0 12px" }}>
              Copy this key now — it will not be shown again.
            </p>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, background: "white",
              border: "1px solid #d1d5db", borderRadius: 6, padding: "10px 12px",
            }}>
              <code style={{ flex: 1, fontSize: 13, fontFamily: "monospace", wordBreak: "break-all", color: "#111" }}>
                {createdKey.apiKey}
              </code>
              <button
                onClick={handleCopy}
                style={{
                  padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: copied ? "#22c55e" : primaryColor, color: "white",
                  border: "none", borderRadius: 4, whiteSpace: "nowrap",
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: "#374151" }}>
              <strong>Name:</strong> {createdKey.name} &nbsp;|&nbsp;
              <strong>User:</strong> {createdKey.userEmail} &nbsp;|&nbsp;
              <strong>Scopes:</strong> {createdKey.scopes?.join(", ")}
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              style={{
                marginTop: 12, padding: "6px 16px", fontSize: 13, cursor: "pointer",
                background: "transparent", border: "1px solid #166534", color: "#166534",
                borderRadius: 4,
              }}
            >
              Done
            </button>
          </div>
        )}

        {/* ── Create Form ── */}
        {showCreateForm && (
          <div className="info-card" style={{ marginBottom: 24 }}>
            <div className="info-card-header">
              <h3>Create New API Key</h3>
            </div>
            <div className="info-card-body">
              <form onSubmit={handleCreate}>
                {/* Name */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 4, color: "var(--gray-700)" }}>
                    Key Name
                  </label>
                  <input
                    type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. HRMS Integration, CI/CD Pipeline"
                    required minLength={2} maxLength={100}
                    style={{
                      width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid var(--gray-300)",
                      borderRadius: 6, boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* User */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 4, color: "var(--gray-700)" }}>
                    Assign to User
                  </label>
                  <select
                    value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}
                    required
                    style={{
                      width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid var(--gray-300)",
                      borderRadius: 6, boxSizing: "border-box", background: "white",
                    }}
                  >
                    <option value="">Select a user...</option>
                    {users.map((u) => (
                      <option key={u.userId} value={u.userId}>
                        {u.email} ({u.role})
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
                    The API key will act on behalf of this user with their role permissions
                  </div>
                </div>

                {/* Scopes */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--gray-700)" }}>
                    Scopes
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                    {AVAILABLE_SCOPES.map((scope) => (
                      <label
                        key={scope.value}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px",
                          background: selectedScopes.includes(scope.value) ? "var(--primary-50)" : "var(--gray-50)",
                          border: `1px solid ${selectedScopes.includes(scope.value) ? "var(--primary-200)" : "var(--gray-200)"}`,
                          borderRadius: 6, cursor: "pointer", fontSize: 13,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedScopes.includes(scope.value)}
                          onChange={() => toggleScope(scope.value)}
                          style={{ marginTop: 2 }}
                        />
                        <div>
                          <div style={{ fontWeight: 500 }}>{scope.label}</div>
                          <div style={{ fontSize: 11, color: "var(--gray-500)" }}>{scope.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Expiry */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 4, color: "var(--gray-700)" }}>
                    Expiration
                  </label>
                  <select
                    value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))}
                    style={{
                      width: 200, padding: "8px 12px", fontSize: 14, border: "1px solid var(--gray-300)",
                      borderRadius: 6, background: "white",
                    }}
                  >
                    {EXPIRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {createError && (
                  <div className="alert alert-error" style={{ marginBottom: 12 }}>{createError}</div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="submit" className="btn btn-primary"
                    disabled={creating || !name.trim() || !selectedUserId || selectedScopes.length === 0}
                  >
                    {creating ? <><LoadingSpinner size={14} /> Creating...</> : "Create API Key"}
                  </button>
                  <button
                    type="button" className="btn btn-secondary"
                    onClick={() => { setShowCreateForm(false); setCreateError(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Keys Table ── */}
        <div className="info-card">
          <div className="info-card-header">
            <h3>Active API Keys</h3>
          </div>
          <div className="info-card-body" style={{ padding: 0 }}>
            {pageLoading ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <LoadingSpinner size={30} />
                <p style={{ marginTop: 12, color: "var(--gray-500)", fontSize: 13 }}>Loading API keys...</p>
              </div>
            ) : keys.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--gray-500)", fontSize: 14 }}>
                No API keys yet. Create your first key to enable programmatic access.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--gray-200)", background: "var(--gray-50)" }}>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Token</th>
                      <th style={thStyle}>User</th>
                      <th style={thStyle}>Scopes</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Last Used</th>
                      <th style={thStyle}>Expires</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr
                        key={k.tokenPrefix}
                        style={{
                          borderBottom: "1px solid var(--gray-100)",
                          opacity: k.status === "revoked" ? 0.5 : 1,
                        }}
                      >
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 500 }}>{k.name}</div>
                          <div style={{ fontSize: 11, color: "var(--gray-400)" }}>
                            by {k.createdBy}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <code style={{ fontSize: 12, background: "var(--gray-100)", padding: "2px 6px", borderRadius: 3 }}>
                            {k.tokenPrefix}...
                          </code>
                        </td>
                        <td style={tdStyle}>
                          <div>{k.userEmail}</div>
                          <div style={{ fontSize: 11, color: "var(--gray-400)" }}>{k.userRole}</div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {(k.scopes || []).map((s) => (
                              <span
                                key={s}
                                style={{
                                  display: "inline-block", padding: "1px 6px", fontSize: 11,
                                  background: "var(--primary-50)", color: "var(--primary-700)",
                                  borderRadius: 3, border: "1px solid var(--primary-100)",
                                }}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span
                            className={`badge ${k.status === "active" ? "badge-success" : "badge-error"}`}
                            style={{ fontSize: 11 }}
                          >
                            {k.status}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: "var(--gray-500)" }}>
                          {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: "var(--gray-500)" }}>
                          {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "Never"}
                        </td>
                        <td style={tdStyle}>
                          {k.status === "active" && (
                            <button
                              onClick={() => handleRevoke(k.tokenPrefix)}
                              disabled={revoking === k.tokenPrefix}
                              style={{
                                padding: "4px 10px", fontSize: 12, cursor: "pointer",
                                background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
                                borderRadius: 4,
                              }}
                            >
                              {revoking === k.tokenPrefix ? "Revoking..." : "Revoke"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Usage hint */}
        <div style={{
          marginTop: 24, padding: "16px 20px", background: "var(--primary-50)",
          border: "1px solid var(--primary-100)", borderRadius: "var(--radius-lg)",
          fontSize: 13, color: "var(--primary-700)",
        }}>
          <strong>Usage:</strong> Include the API key in your requests as a header:
          <code style={{
            display: "block", marginTop: 8, padding: "8px 12px", background: "white",
            borderRadius: 4, fontFamily: "monospace", fontSize: 12, color: "#111",
          }}>
            curl -H "X-API-Key: saas_pat_xxxx..." https://api.example.com/endpoint
          </code>
        </div>
      </main>
    </div>
  );
}

const thStyle = {
  textAlign: "left", padding: "10px 12px", fontWeight: 600,
  color: "var(--gray-600)", fontSize: 12, textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle = {
  padding: "10px 12px", verticalAlign: "top",
};
