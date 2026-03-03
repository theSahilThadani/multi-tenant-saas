import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import SlugChecker from "../components/SlugChecker";
import LoadingSpinner from "../components/LoadingSpinner";
import { createTenant } from "../services/api";
import { getTokensFromSession } from "../utils/authSession";
import config from "../config";

const PLANS = [
  {
    id: "free",
    name: "Free Trial",
    users: "Up to 5 users",
    badge: "Start here",
  },
  {
    id: "pro",
    name: "Pro",
    users: "Up to 100 users",
    badge: "Popular",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    users: "Unlimited users",
  },
];

export default function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionTokens = getTokensFromSession();

  const email = location.state?.email || "";
  const accessToken = location.state?.accessToken || sessionTokens.accessToken || "";
  const verified = location.state?.verified || false;

  useEffect(() => {
    if (!verified || !accessToken) navigate("/login");
  }, [verified, accessToken, navigate]);

  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("free");
  const [slugValid, setSlugValid] = useState(false);
  const [slugError, setSlugError] = useState("");
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const newErrors = {};
    if (!companyName.trim() || companyName.trim().length < 3)
      newErrors.companyName = "Must be at least 3 characters";
    if (!slug) newErrors.slug = "Subdomain is required";
    else if (!slugValid) newErrors.slug = slugError || "Not available";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setApiError("");
    if (!validate()) return;
    setSubmitting(true);

    try {
      const result = await createTenant({
        companyName: companyName.trim(),
        slug,
        plan,
        accessToken,
      });
      navigate("/onboarding/complete", {
        state: {
          tenantId: result.tenantId,
          tenantName: result.name,
          slug: result.slug,
          subdomain: result.subdomain,
          loginUrl: result.loginUrl,
          adminEmail: result.adminEmail,
          plan: result.plan,
          status: result.status,
        },
      });
    } catch (err) {
      if (err.error === "SLUG_TAKEN" || err.error === "SLUG_RESERVED") {
        setSlugError(err.message || "Not available");
        setSlugValid(false);
      } else if (
        err.error === "TOKEN_EXPIRED" ||
        err.error === "INVALID_TOKEN"
      ) {
        setApiError("Session expired. Please login again.");
        setTimeout(() => navigate("/login"), 3000);
      } else if (err.error === "ALREADY_HAS_TENANT") {
        setApiError("You already have a workspace.");
        setTimeout(
          () =>
            navigate("/welcome-back", {
              state: { tenantSlug: err.tenantSlug },
            }),
          2000
        );
      } else if (err.error === "VALIDATION_ERROR") {
        setErrors(err.details || {});
      } else {
        setApiError(err.message || "Something went wrong.");
      }
    }
    setSubmitting(false);
  }

  return (
    <div className="page-wrapper">
      <header className="page-header">
        <a href="/" className="logo">
          <div className="logo-icon">{config.APP_NAME.charAt(0)}</div>
          <span className="logo-text">{config.APP_NAME}</span>
        </a>
        <div className="trial-badge" style={{ fontSize: 12 }}>
          ✦ Free 14-day trial
        </div>
      </header>

      <main className="page-content">
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-header">
            {/* Verified badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "var(--success-light)",
                color: "var(--success)",
                padding: "4px 12px",
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              ✓ Email verified
            </div>
            <h1>Set up your workspace</h1>
            <p>
              Setting up for <strong>{email}</strong>
            </p>
          </div>

          <div className="card-body">
            {/* Step progress */}
            <div className="onboarding-steps">
              {["Verify Email", "Configure", "Launch"].map((step, i) => (
                <div
                  key={i}
                  className={`onboarding-step ${
                    i < 1 ? "done" : i === 1 ? "active" : ""
                  }`}
                >
                  <div className="onboarding-step-dot">
                    {i < 1 ? "✓" : i + 1}
                  </div>
                  <span>{step}</span>
                </div>
              ))}
            </div>

            {apiError && (
              <div className="alert alert-error">
                <span className="alert-icon">⚠</span>
                <span>{apiError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* Company Name */}
              <div className="form-group">
                <label className="form-label">
                  Company Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className={`form-input ${errors.companyName ? "error" : ""}`}
                  value={companyName}
                  onChange={(e) => {
                    setCompanyName(e.target.value);
                    if (errors.companyName)
                      setErrors((p) => ({ ...p, companyName: "" }));
                  }}
                  placeholder="Acme Corporation"
                  maxLength={255}
                  disabled={submitting}
                  autoFocus
                />
                {errors.companyName && (
                  <div className="form-error">✕ {errors.companyName}</div>
                )}
              </div>

              {/* Subdomain */}
              <SlugChecker
                value={slug}
                onChange={(val) => {
                  setSlug(val);
                  if (errors.slug) setErrors((p) => ({ ...p, slug: "" }));
                }}
                error={slugError}
                setError={setSlugError}
                setSlugValid={setSlugValid}
              />

              {/* Plan Cards */}
              <div className="form-group">
                <label className="form-label">Choose your plan</label>
                <div className="plan-cards">
                  {PLANS.map((p) => (
                    <div
                      key={p.id}
                      className={`plan-card ${plan === p.id ? "selected" : ""}`}
                      onClick={() => !submitting && setPlan(p.id)}
                    >
                      {p.badge && (
                        <div className="plan-popular-badge">{p.badge}</div>
                      )}
                      <div className="plan-name">{p.name}</div>
                      <div className="plan-users">{p.users}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <div className="form-group" style={{ marginTop: 32 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !slugValid}
                  style={{ fontSize: 16, padding: "14px 24px" }}
                >
                  {submitting ? (
                    <>
                      <LoadingSpinner white size={18} />
                      Creating workspace...
                    </>
                  ) : (
                    "🚀 Launch Workspace"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>

      <footer className="page-footer">
        © 2026 {config.APP_NAME}. All rights reserved.
      </footer>
    </div>
  );
}
