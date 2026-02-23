import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import StepIndicator from "../components/StepIndicator";
import SlugChecker from "../components/SlugChecker";
import LoadingSpinner from "../components/LoadingSpinner";
import { createTenant } from "../services/api";
import config from "../config";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Get verified data from OTP step
  const email = location.state?.email || "";
  const accessToken = location.state?.accessToken || "";
  const verified = location.state?.verified || false;

  // Redirect if not verified
  useEffect(() => {
    if (!verified || !accessToken) {
      navigate("/onboarding");
    }
  }, [verified, accessToken, navigate]);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("free");

  // Validation
  const [slugValid, setSlugValid] = useState(false);
  const [slugError, setSlugError] = useState("");
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const newErrors = {};
    if (!companyName.trim() || companyName.trim().length < 3) {
      newErrors.companyName = "Must be at least 3 characters";
    }
    if (!slug) {
      newErrors.slug = "Subdomain is required";
    } else if (!slugValid) {
      newErrors.slug = slugError || "Subdomain is not available";
    }
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
        slug: slug,
        plan: plan,
        accessToken: accessToken,
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
      } else if (err.error === "TOKEN_EXPIRED" || err.error === "INVALID_TOKEN") {
        setApiError("Session expired. Please verify your email again.");
        setTimeout(() => navigate("/onboarding"), 3000);
      } else if (err.error === "VALIDATION_ERROR") {
        setErrors(err.details || {});
      } else {
        setApiError(err.message || "Something went wrong. Please try again.");
      }
    }

    setSubmitting(false);
  }

  return (
    <div className="page-wrapper">
      <header className="page-header">
        <a href="/" className="logo">
          <div className="logo-icon">M</div>
          <span className="logo-text">{config.APP_NAME}</span>
        </a>
      </header>

      <main className="page-content">
        <div className="card">
          <div className="card-header">
            <h1>Set up your workspace</h1>
            <p>
              Signed in as <strong>{email}</strong>
            </p>
          </div>

          <div className="card-body">
            <StepIndicator currentStep={3} />

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
                    if (errors.companyName) setErrors((p) => ({ ...p, companyName: "" }));
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

              {/* Plan */}
              <div className="form-group">
                <label className="form-label">Plan</label>
                <select
                  className="form-select"
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  disabled={submitting}
                >
                  <option value="free">Free — Up to 10 users</option>
                  <option value="pro">Pro — Up to 100 users</option>
                  <option value="enterprise">Enterprise — Unlimited</option>
                </select>
              </div>

              {/* Submit */}
              <div className="form-group" style={{ marginTop: 32 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !slugValid}
                >
                  {submitting ? (
                    <>
                      <LoadingSpinner white size={18} />
                      Creating workspace...
                    </>
                  ) : (
                    <>🚀 Create Workspace</>
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