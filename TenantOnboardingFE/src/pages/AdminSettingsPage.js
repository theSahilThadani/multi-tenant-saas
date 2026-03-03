import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "../context/TenantContext";
import LoadingSpinner from "../components/LoadingSpinner";
import {
  getIdpConfig,
  saveIdpConfig,
  toggleIdpLoginModes,
  deleteIdpConfig,
} from "../services/api";
import { getTokensFromSession } from "../utils/authSession";

export default function AdminSettingsPage() {
  const navigate = useNavigate();
  const tenant = useTenant();

  // Auth state from session
  const [userData, setUserData] = useState(null);
  const [accessToken, setAccessToken] = useState("");

  // Page state
  const [pageLoading, setPageLoading] = useState(true);
  const [idpConfig, setIdpConfig] = useState(null); // null = not configured

  // Form state
  const [idpType, setIdpType] = useState("oidc");
  const [displayName, setDisplayName] = useState("");
  const [oidcIssuerUrl, setOidcIssuerUrl] = useState("");
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcScopes, setOidcScopes] = useState("openid email profile");
  const [samlMetadataUrl, setSamlMetadataUrl] = useState("");
  const [samlMetadataXml, setSamlMetadataXml] = useState("");

  // Toggle state
  const [cognitoLoginEnabled, setCognitoLoginEnabled] = useState(true);
  const [ssoLoginEnabled, setSsoLoginEnabled] = useState(true);

  // Feedback
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

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
      const sessionTokens = getTokensFromSession();
      const token = data.accessToken || sessionTokens.accessToken || "";
      if (!token) {
        navigate("/login");
        return;
      }
      setUserData(data);
      setAccessToken(token);
    } catch {
      navigate("/login");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load IDP config ──
  useEffect(() => {
    if (!accessToken) return;
    async function load() {
      setPageLoading(true);
      try {
        const config = await getIdpConfig(accessToken);
        if (config.configured) {
          setIdpConfig(config);
          setIdpType(config.idpType || "oidc");
          setDisplayName(config.displayName || "");
          setOidcIssuerUrl(config.oidcIssuerUrl || "");
          setOidcClientId(config.oidcClientId || "");
          setSamlMetadataUrl(config.samlMetadataUrl || "");
          setCognitoLoginEnabled(config.cognitoLoginEnabled !== false);
          setSsoLoginEnabled(config.ssoLoginEnabled !== false);
        } else {
          setIdpConfig(null);
        }
      } catch (err) {
        console.error("[AdminSettings] Load error:", err);
      } finally {
        setPageLoading(false);
      }
    }
    load();
  }, [accessToken]);

  async function handleSave(e) {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess("");
    setSaving(true);

    const payload = { idpType, displayName };
    if (idpType === "oidc") {
      payload.oidcIssuerUrl = oidcIssuerUrl;
      payload.oidcClientId = oidcClientId;
      if (oidcClientSecret) payload.oidcClientSecret = oidcClientSecret;
      payload.oidcScopes = oidcScopes;
    } else {
      if (samlMetadataUrl) payload.samlMetadataUrl = samlMetadataUrl;
      if (samlMetadataXml) payload.samlMetadataXml = samlMetadataXml;
    }

    try {
      const result = await saveIdpConfig(payload, accessToken);
      setIdpConfig(result);
      setOidcClientSecret(""); // clear after save
      setSaveSuccess("SSO configuration saved successfully.");
    } catch (err) {
      setSaveError(err.message || (err.details ? JSON.stringify(err.details) : "Failed to save SSO config."));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(field, value) {
    setSaveError("");
    setSaveSuccess("");
    setToggling(true);

    const newCognito = field === "cognito" ? value : cognitoLoginEnabled;
    const newSso = field === "sso" ? value : ssoLoginEnabled;

    if (!newCognito && !newSso) {
      setSaveError("Cannot disable both OTP and SSO — users would be locked out.");
      setToggling(false);
      return;
    }

    try {
      await toggleIdpLoginModes(
        { cognitoLoginEnabled: newCognito, ssoLoginEnabled: newSso },
        accessToken
      );
      setCognitoLoginEnabled(newCognito);
      setSsoLoginEnabled(newSso);
      setSaveSuccess("Login modes updated.");
    } catch (err) {
      setSaveError(err.message || "Failed to update login modes.");
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Remove SSO configuration? OTP login will be restored as the only login method.")) return;
    setSaveError("");
    setSaveSuccess("");
    setDeleting(true);
    try {
      await deleteIdpConfig(accessToken);
      setIdpConfig(null);
      setDisplayName("");
      setOidcIssuerUrl("");
      setOidcClientId("");
      setOidcClientSecret("");
      setSamlMetadataUrl("");
      setSamlMetadataXml("");
      setCognitoLoginEnabled(true);
      setSsoLoginEnabled(false);
      setSaveSuccess("SSO configuration removed. OTP login restored.");
    } catch (err) {
      setSaveError(err.message || "Failed to delete SSO config.");
    } finally {
      setDeleting(false);
    }
  }

  if (pageLoading || !userData) {
    return (
      <div className="dashboard-wrapper" style={{ justifyContent: "center", alignItems: "center", display: "flex", minHeight: "100vh" }}>
        <LoadingSpinner size={40} />
      </div>
    );
  }

  return (
    <div className="dashboard-wrapper">
      {/* ── Top Nav ── */}
      <nav className="dashboard-topbar">
        <div className="dashboard-topbar-logo">
          <div className="dashboard-topbar-logo-icon" style={{ background: primaryColor }}>
            {(tenant.tenantName || "W").charAt(0).toUpperCase()}
          </div>
          <span className="dashboard-topbar-name">{tenant.tenantName}</span>
        </div>
        <div className="dashboard-topbar-right">
          <button className="btn-signout" onClick={() => navigate("/dashboard")}>
            ← Back to Dashboard
          </button>
        </div>
      </nav>

      <main className="dashboard-main">
        <div className="dashboard-welcome">
          <h1>SSO Settings</h1>
          <p>Configure federated identity provider (OIDC or SAML) for your workspace.</p>
        </div>

        {/* ── Feedback ── */}
        {saveError && (
          <div className="alert alert-error" style={{ marginBottom: 20 }}>
            <span className="alert-icon">⚠</span>
            <span>{saveError}</span>
          </div>
        )}
        {saveSuccess && (
          <div className="alert" style={{ background: "var(--success-light)", border: "1px solid var(--success)", color: "var(--success)", marginBottom: 20, borderRadius: "var(--radius)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <span>✓</span>
            <span>{saveSuccess}</span>
          </div>
        )}

        <div className="dashboard-info-grid">
          {/* ── IDP Config Form ── */}
          <div className="info-card" style={{ gridColumn: "1 / -1" }}>
            <div className="info-card-header">
              <h3>
                {idpConfig ? "Update SSO Configuration" : "Configure SSO"}
                {idpConfig && (
                  <span className="badge badge-success" style={{ marginLeft: 12 }}>
                    Active
                  </span>
                )}
              </h3>
            </div>
            <div className="info-card-body">
              <form onSubmit={handleSave} noValidate>
                {/* IDP Type */}
                <div className="form-group">
                  <label className="form-label">Protocol</label>
                  <div style={{ display: "flex", gap: 12 }}>
                    {["oidc", "saml"].map((t) => (
                      <label key={t} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: idpType === t ? 600 : 400 }}>
                        <input
                          type="radio"
                          name="idpType"
                          value={t}
                          checked={idpType === t}
                          onChange={() => setIdpType(t)}
                        />
                        {t.toUpperCase()}
                      </label>
                    ))}
                  </div>
                  <div className="form-hint">
                    OIDC — Google, Okta, Azure AD (OpenID Connect). SAML — Okta SAML, Azure SAML, ADFS.
                  </div>
                </div>

                {/* Display Name */}
                <div className="form-group">
                  <label className="form-label">Button Label <span className="required">*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder='e.g. "Sign in with Google"'
                    required
                  />
                  <div className="form-hint">Shown on the SSO button on the login page.</div>
                </div>

                {/* ── OIDC Fields ── */}
                {idpType === "oidc" && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Issuer URL <span className="required">*</span></label>
                      <input
                        type="url"
                        className="form-input"
                        value={oidcIssuerUrl}
                        onChange={(e) => setOidcIssuerUrl(e.target.value)}
                        placeholder="https://accounts.google.com"
                        required
                      />
                      <div className="form-hint">
                        Google: https://accounts.google.com · Azure: https://login.microsoftonline.com/&#123;tenant&#125;/v2.0 · Okta: https://&#123;org&#125;.okta.com
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Client ID <span className="required">*</span></label>
                      <input
                        type="text"
                        className="form-input"
                        value={oidcClientId}
                        onChange={(e) => setOidcClientId(e.target.value)}
                        placeholder="Your OAuth app's Client ID"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Client Secret <span className="required">*</span>
                      </label>
                      <input
                        type="password"
                        className="form-input"
                        value={oidcClientSecret}
                        onChange={(e) => setOidcClientSecret(e.target.value)}
                        placeholder={idpConfig ? "Leave blank to keep existing secret" : "Your OAuth app's Client Secret"}
                        required={!idpConfig}
                        autoComplete="new-password"
                      />
                      {idpConfig && (
                        <div className="form-hint">Leave blank to keep the existing secret.</div>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label">Scopes</label>
                      <input
                        type="text"
                        className="form-input"
                        value={oidcScopes}
                        onChange={(e) => setOidcScopes(e.target.value)}
                        placeholder="openid email profile"
                      />
                      <div className="form-hint">Space-separated. Must include: openid email profile</div>
                    </div>
                  </>
                )}

                {/* ── SAML Fields ── */}
                {idpType === "saml" && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Metadata URL</label>
                      <input
                        type="url"
                        className="form-input"
                        value={samlMetadataUrl}
                        onChange={(e) => setSamlMetadataUrl(e.target.value)}
                        placeholder="https://your-idp.com/saml/metadata"
                      />
                      <div className="form-hint">Preferred. Your IDP provides this URL.</div>
                    </div>

                    {!samlMetadataUrl && (
                      <div className="form-group">
                        <label className="form-label">Or paste Metadata XML</label>
                        <textarea
                          className="form-input"
                          value={samlMetadataXml}
                          onChange={(e) => setSamlMetadataXml(e.target.value)}
                          placeholder="<EntityDescriptor ...>...</EntityDescriptor>"
                          rows={6}
                          style={{ fontFamily: "monospace", fontSize: 12 }}
                        />
                      </div>
                    )}
                  </>
                )}

                {/* ── Cognito callback URL info ── */}
                <div style={{
                  background: "var(--primary-50)",
                  border: "1px solid var(--primary-100)",
                  borderRadius: "var(--radius)",
                  padding: "14px 16px",
                  fontSize: 13,
                  color: "var(--primary-700)",
                  marginBottom: 20,
                }}>
                  <strong>IDP Redirect / Callback URI to register in your IDP app:</strong>
                  <br />
                  <code style={{ fontSize: 12, background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: 4 }}>
                    {`https://${window.location.hostname}/auth/callback`}
                  </code>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                    style={{ background: primaryColor }}
                  >
                    {saving ? (
                      <><LoadingSpinner white size={16} /> Saving...</>
                    ) : (
                      idpConfig ? "Update SSO" : "Enable SSO"
                    )}
                  </button>

                  {idpConfig && (
                    <button
                      type="button"
                      className="btn"
                      disabled={deleting}
                      onClick={handleDelete}
                      style={{ background: "var(--error)", color: "white", border: "none" }}
                    >
                      {deleting ? <><LoadingSpinner white size={16} /> Removing...</> : "Remove SSO"}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* ── Login Mode Toggles ── */}
          {idpConfig && (
            <div className="info-card" style={{ gridColumn: "1 / -1" }}>
              <div className="info-card-header">
                <h3>Login Mode</h3>
              </div>
              <div className="info-card-body">
                <p style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 20 }}>
                  Control which login methods are available to your users. At least one must remain enabled.
                </p>

                {/* OTP toggle */}
                <div className="info-row" style={{ alignItems: "center" }}>
                  <div>
                    <span className="info-label" style={{ display: "block", fontWeight: 600 }}>Email OTP</span>
                    <span style={{ fontSize: 12, color: "var(--gray-500)" }}>Passwordless login via one-time code</span>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={cognitoLoginEnabled}
                      disabled={toggling}
                      onChange={(e) => handleToggle("cognito", e.target.checked)}
                    />
                    <span style={{ fontSize: 13, color: cognitoLoginEnabled ? "var(--success)" : "var(--gray-400)" }}>
                      {cognitoLoginEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </label>
                </div>

                {/* SSO toggle */}
                <div className="info-row" style={{ alignItems: "center" }}>
                  <div>
                    <span className="info-label" style={{ display: "block", fontWeight: 600 }}>SSO ({idpConfig.displayName})</span>
                    <span style={{ fontSize: 12, color: "var(--gray-500)" }}>Federated login via your IDP</span>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={ssoLoginEnabled}
                      disabled={toggling}
                      onChange={(e) => handleToggle("sso", e.target.checked)}
                    />
                    <span style={{ fontSize: 13, color: ssoLoginEnabled ? "var(--success)" : "var(--gray-400)" }}>
                      {ssoLoginEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </label>
                </div>

                {(!cognitoLoginEnabled || !ssoLoginEnabled) && (
                  <div style={{ marginTop: 16, padding: "10px 14px", background: "var(--warning-light)", border: "1px solid var(--warning)", borderRadius: "var(--radius)", fontSize: 13 }}>
                    ⚠ Warning: If your only active login method fails, users (including you) may be locked out.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
