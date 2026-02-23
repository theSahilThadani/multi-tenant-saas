

# React Signup App — Professional Tenant Onboarding

---

## Project Setup

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                                                                  │
 │  1. Create React app:                                          │
 │                                                                  │
 │     npx create-react-app tenant-onboarding                    │
 │     cd tenant-onboarding                                       │
 │                                                                  │
 │  2. Install dependencies:                                      │
 │                                                                  │
 │     npm install react-router-dom axios                         │
 │                                                                  │
 │  3. Delete default files:                                      │
 │                                                                  │
 │     rm src/App.test.js src/logo.svg src/reportWebVitals.js    │
 │     rm src/setupTests.js                                       │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
 tenant-onboarding/
 ├── public/
 │   ├── index.html
 │   └── favicon.ico
 ├── src/
 │   ├── index.js
 │   ├── index.css
 │   ├── App.js
 │   ├── config.js
 │   ├── services/
 │   │   └── api.js
 │   ├── pages/
 │   │   ├── OnboardingPage.js
 │   │   ├── OnboardingStatus.js
 │   │   └── OnboardingComplete.js
 │   ├── components/
 │   │   ├── SlugChecker.js
 │   │   └── LoadingSpinner.js
 │   └── context/
 │       └── TenantContext.js
 └── package.json
```

---

## File 1: public/index.html

```html name=public/index.html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#4F46E5" />
    <meta name="description" content="Create your workspace" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
    <title>Create Workspace</title>
    <script>
      window.__TENANT_CONFIG__ = {{TENANT_CONFIG}};
    </script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

---

## File 2: src/config.js

```javascript name=src/config.js
const config = {
  API_URL: process.env.REACT_APP_API_URL || "https://your-api-gateway-url.amazonaws.com/prod",
  APP_DOMAIN: process.env.REACT_APP_DOMAIN || "yourapp.com",
  APP_NAME: process.env.REACT_APP_NAME || "YourApp",
};

export default config;
```

---

## File 3: src/index.css

```css name=src/index.css
/* ============================================================
   GLOBAL STYLES — Professional SaaS Design
   ============================================================ */

:root {
  /* Brand Colors */
  --primary: #4F46E5;
  --primary-hover: #4338CA;
  --primary-light: #EEF2FF;
  --primary-50: #EEF2FF;
  --primary-100: #E0E7FF;
  --primary-600: #4F46E5;
  --primary-700: #4338CA;

  /* Neutral Colors */
  --gray-50: #F9FAFB;
  --gray-100: #F3F4F6;
  --gray-200: #E5E7EB;
  --gray-300: #D1D5DB;
  --gray-400: #9CA3AF;
  --gray-500: #6B7280;
  --gray-600: #4B5563;
  --gray-700: #374151;
  --gray-800: #1F2937;
  --gray-900: #111827;

  /* Status Colors */
  --success: #059669;
  --success-light: #ECFDF5;
  --error: #DC2626;
  --error-light: #FEF2F2;
  --warning: #D97706;
  --warning-light: #FFFBEB;
  --info: #2563EB;
  --info-light: #EFF6FF;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);

  /* Border Radius */
  --radius-sm: 6px;
  --radius: 8px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-xl: 16px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: var(--gray-50);
  color: var(--gray-900);
  line-height: 1.6;
}

/* ============================================================
   LAYOUT
   ============================================================ */

.page-wrapper {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.page-header {
  padding: 24px 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: white;
}

.logo-icon {
  width: 36px;
  height: 36px;
  background: white;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  color: var(--primary);
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  color: white;
  letter-spacing: -0.5px;
}

.page-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.page-footer {
  padding: 20px 40px;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

/* ============================================================
   CARD
   ============================================================ */

.card {
  background: white;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  width: 100%;
  max-width: 520px;
  overflow: hidden;
}

.card-header {
  padding: 40px 40px 0;
  text-align: center;
}

.card-header h1 {
  font-size: 26px;
  font-weight: 700;
  color: var(--gray-900);
  letter-spacing: -0.5px;
  margin-bottom: 8px;
}

.card-header p {
  font-size: 15px;
  color: var(--gray-500);
  margin-bottom: 0;
}

.card-body {
  padding: 32px 40px 40px;
}

/* ============================================================
   FORM ELEMENTS
   ============================================================ */

.form-group {
  margin-bottom: 24px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-700);
  margin-bottom: 6px;
}

.form-label .required {
  color: var(--error);
  margin-left: 2px;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  font-size: 15px;
  font-family: inherit;
  border: 1.5px solid var(--gray-300);
  border-radius: var(--radius);
  background: white;
  color: var(--gray-900);
  transition: all 0.2s ease;
  outline: none;
}

.form-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-50);
}

.form-input:disabled {
  background: var(--gray-100);
  cursor: not-allowed;
  opacity: 0.7;
}

.form-input.error {
  border-color: var(--error);
  box-shadow: 0 0 0 3px var(--error-light);
}

.form-input.success {
  border-color: var(--success);
}

.form-hint {
  font-size: 13px;
  color: var(--gray-500);
  margin-top: 4px;
}

.form-error {
  font-size: 13px;
  color: var(--error);
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.form-success {
  font-size: 13px;
  color: var(--success);
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Slug input group */
.slug-input-group {
  display: flex;
  align-items: center;
  border: 1.5px solid var(--gray-300);
  border-radius: var(--radius);
  overflow: hidden;
  transition: all 0.2s ease;
  background: white;
}

.slug-input-group:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-50);
}

.slug-input-group.error {
  border-color: var(--error);
  box-shadow: 0 0 0 3px var(--error-light);
}

.slug-input-group.success {
  border-color: var(--success);
}

.slug-input-group input {
  flex: 1;
  padding: 10px 14px;
  font-size: 15px;
  font-family: inherit;
  border: none;
  outline: none;
  color: var(--gray-900);
  min-width: 0;
}

.slug-input-group .slug-suffix {
  padding: 10px 14px;
  background: var(--gray-50);
  color: var(--gray-500);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  border-left: 1.5px solid var(--gray-200);
}

/* Select */
.form-select {
  width: 100%;
  padding: 10px 14px;
  font-size: 15px;
  font-family: inherit;
  border: 1.5px solid var(--gray-300);
  border-radius: var(--radius);
  background: white;
  color: var(--gray-900);
  outline: none;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
  background-position: right 10px center;
  background-repeat: no-repeat;
  background-size: 20px;
}

.form-select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-50);
}

/* ============================================================
   BUTTONS
   ============================================================ */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  border-radius: var(--radius);
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  line-height: 1;
}

.btn-primary {
  background: var(--primary);
  color: white;
  width: 100%;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-secondary {
  background: white;
  color: var(--primary);
  border: 1.5px solid var(--primary);
}

.btn-secondary:hover {
  background: var(--primary-50);
}

/* ============================================================
   PROGRESS / STATUS
   ============================================================ */

.progress-container {
  width: 100%;
  max-width: 520px;
}

.progress-bar-wrapper {
  width: 100%;
  height: 6px;
  background: var(--gray-200);
  border-radius: 100px;
  overflow: hidden;
  margin: 24px 0;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary) 0%, #818CF8 100%);
  border-radius: 100px;
  transition: width 0.5s ease;
}

.steps-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid var(--gray-100);
}

.step-item:last-child {
  border-bottom: none;
}

.step-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.step-icon.completed {
  background: var(--success-light);
  color: var(--success);
}

.step-icon.in_progress {
  background: var(--primary-light);
  color: var(--primary);
  animation: pulse 1.5s ease infinite;
}

.step-icon.pending {
  background: var(--gray-100);
  color: var(--gray-400);
}

.step-icon.failed {
  background: var(--error-light);
  color: var(--error);
}

.step-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-700);
}

.step-label.completed {
  color: var(--success);
}

.step-label.in_progress {
  color: var(--primary);
  font-weight: 600;
}

.step-label.failed {
  color: var(--error);
}

.step-label.pending {
  color: var(--gray-400);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ============================================================
   SUCCESS / COMPLETE PAGE
   ============================================================ */

.success-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--success-light);
  color: var(--success);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  margin: 0 auto 20px;
}

.url-box {
  background: var(--gray-50);
  border: 1.5px solid var(--gray-200);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 20px 0;
}

.url-box .url-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--primary);
  word-break: break-all;
}

.url-box .copy-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--gray-500);
  font-size: 18px;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.url-box .copy-btn:hover {
  background: var(--gray-200);
  color: var(--gray-700);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--gray-100);
  font-size: 14px;
}

.info-row:last-child {
  border-bottom: none;
}

.info-row .info-label {
  color: var(--gray-500);
  font-weight: 500;
}

.info-row .info-value {
  color: var(--gray-900);
  font-weight: 600;
}

/* ============================================================
   ALERT
   ============================================================ */

.alert {
  padding: 12px 16px;
  border-radius: var(--radius);
  font-size: 14px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 20px;
}

.alert-error {
  background: var(--error-light);
  color: var(--error);
  border: 1px solid #FECACA;
}

.alert-success {
  background: var(--success-light);
  color: var(--success);
  border: 1px solid #A7F3D0;
}

.alert-icon {
  font-size: 18px;
  flex-shrink: 0;
  line-height: 1;
}

/* ============================================================
   LOADING SPINNER
   ============================================================ */

.spinner {
  width: 20px;
  height: 20px;
  border: 2.5px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.spinner-white {
  border-top-color: white;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ============================================================
   RESPONSIVE
   ============================================================ */

@media (max-width: 640px) {
  .page-header {
    padding: 16px 20px;
  }

  .card-header {
    padding: 28px 24px 0;
  }

  .card-header h1 {
    font-size: 22px;
  }

  .card-body {
    padding: 24px;
  }

  .page-content {
    padding: 16px;
    align-items: flex-start;
    padding-top: 24px;
  }
}
```

---

## File 4: src/services/api.js

```javascript name=src/services/api.js
import config from "../config";

const API_URL = config.API_URL;

/**
 * Check if a subdomain slug is available.
 * @param {string} slug
 * @returns {Promise<{available: boolean, reason?: string, message?: string}>}
 */
export async function checkSlug(slug) {
  const response = await fetch(
    `${API_URL}/onboarding/check-slug?slug=${encodeURIComponent(slug)}`
  );
  return response.json();
}

/**
 * Create a new tenant.
 * @param {Object} data - { companyName, adminEmail, slug, plan }
 * @returns {Promise<Object>} - tenant data or error
 */
export async function createTenant(data) {
  const response = await fetch(`${API_URL}/onboarding/tenant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw {
      status: response.status,
      ...result,
    };
  }

  return result;
}

/**
 * Get tenant onboarding status.
 * @param {string} tenantId
 * @returns {Promise<Object>} - status data
 */
export async function getOnboardingStatus(tenantId) {
  const response = await fetch(
    `${API_URL}/onboarding/status/${encodeURIComponent(tenantId)}`
  );
  return response.json();
}
```

---

## File 5: src/components/LoadingSpinner.js

```javascript name=src/components/LoadingSpinner.js
import React from "react";

export default function LoadingSpinner({ white = false, size = 20 }) {
  return (
    <span
      className={`spinner ${white ? "spinner-white" : ""}`}
      style={{ width: size, height: size }}
    />
  );
}
```

---

## File 6: src/components/SlugChecker.js

```javascript name=src/components/SlugChecker.js
import React, { useState, useEffect, useRef } from "react";
import { checkSlug } from "../services/api";
import config from "../config";

export default function SlugChecker({ value, onChange, error, setError, setSlugValid }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const debounceTimer = useRef(null);

  // Validate format locally first
  function validateFormat(slug) {
    if (!slug) return null;
    if (slug.length < 3) return "Must be at least 3 characters";
    if (slug.length > 30) return "Must be at most 30 characters";
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug)) {
      return "Only lowercase letters, numbers, and hyphens. Must start with a letter.";
    }
    return null;
  }

  // Handle input change
  function handleChange(e) {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    onChange(raw);
    setResult(null);
    setSlugValid(false);

    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Validate format
    const formatError = validateFormat(raw);
    if (formatError) {
      setError(formatError);
      setChecking(false);
      return;
    }

    setError("");

    // Debounce API call (500ms)
    setChecking(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        const data = await checkSlug(raw);
        setResult(data);
        if (data.available) {
          setSlugValid(true);
          setError("");
        } else {
          setSlugValid(false);
          setError(data.message || "Not available");
        }
      } catch (err) {
        setError("Could not check availability");
        setSlugValid(false);
      }
      setChecking(false);
    }, 500);
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Determine input state
  const isValid = result?.available === true;
  const isInvalid = error || result?.available === false;

  return (
    <div className="form-group">
      <label className="form-label">
        Subdomain <span className="required">*</span>
      </label>
      <div
        className={`slug-input-group ${
          isValid ? "success" : isInvalid ? "error" : ""
        }`}
      >
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="your-company"
          maxLength={30}
          autoComplete="off"
          spellCheck="false"
        />
        <span className="slug-suffix">.{config.APP_DOMAIN}</span>
      </div>

      {/* Status messages */}
      {checking && (
        <div className="form-hint" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
          <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></span>
          Checking availability...
        </div>
      )}
      {!checking && isValid && (
        <div className="form-success">✓ Available</div>
      )}
      {!checking && error && (
        <div className="form-error">✕ {error}</div>
      )}
      {!error && !checking && !isValid && value.length > 0 && value.length < 3 && (
        <div className="form-hint">Type at least 3 characters</div>
      )}
    </div>
  );
}
```

---

## File 7: src/pages/OnboardingPage.js

```javascript name=src/pages/OnboardingPage.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import SlugChecker from "../components/SlugChecker";
import LoadingSpinner from "../components/LoadingSpinner";
import { createTenant } from "../services/api";
import config from "../config";

export default function OnboardingPage() {
  const navigate = useNavigate();

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("free");

  // Validation state
  const [slugValid, setSlugValid] = useState(false);
  const [slugError, setSlugError] = useState("");
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");

  // Submission state
  const [submitting, setSubmitting] = useState(false);

  // Validate all fields
  function validate() {
    const newErrors = {};

    if (!companyName.trim() || companyName.trim().length < 3) {
      newErrors.companyName = "Company name must be at least 3 characters";
    }

    if (!adminEmail.trim()) {
      newErrors.adminEmail = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      newErrors.adminEmail = "Enter a valid email address";
    }

    if (!slug) {
      newErrors.slug = "Subdomain is required";
    } else if (!slugValid) {
      newErrors.slug = slugError || "Subdomain is not available";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();
    setApiError("");

    if (!validate()) return;

    setSubmitting(true);

    try {
      const result = await createTenant({
        companyName: companyName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        slug: slug,
        plan: plan,
      });

      // Navigate to status page with tenant data
      navigate(`/onboarding/status/${result.tenantId}`, {
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
      if (err.error === "SLUG_TAKEN") {
        setSlugError("This subdomain is already taken");
        setSlugValid(false);
      } else if (err.error === "SLUG_RESERVED") {
        setSlugError("This subdomain is reserved");
        setSlugValid(false);
      } else if (err.error === "VALIDATION_ERROR") {
        setErrors(err.details || {});
      } else {
        setApiError(
          err.message || "Something went wrong. Please try again."
        );
      }
    }

    setSubmitting(false);
  }

  return (
    <div className="page-wrapper">
      {/* Header */}
      <header className="page-header">
        <a href="/" className="logo">
          <div className="logo-icon">Y</div>
          <span className="logo-text">{config.APP_NAME}</span>
        </a>
      </header>

      {/* Content */}
      <main className="page-content">
        <div className="card">
          <div className="card-header">
            <h1>Create your workspace</h1>
            <p>Set up your team's workspace in seconds</p>
          </div>

          <div className="card-body">
            {/* API Error */}
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
                      setErrors((prev) => ({ ...prev, companyName: "" }));
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

              {/* Admin Email */}
              <div className="form-group">
                <label className="form-label">
                  Admin Email <span className="required">*</span>
                </label>
                <input
                  type="email"
                  className={`form-input ${errors.adminEmail ? "error" : ""}`}
                  value={adminEmail}
                  onChange={(e) => {
                    setAdminEmail(e.target.value);
                    if (errors.adminEmail)
                      setErrors((prev) => ({ ...prev, adminEmail: "" }));
                  }}
                  placeholder="admin@acmecorp.com"
                  disabled={submitting}
                />
                {errors.adminEmail && (
                  <div className="form-error">✕ {errors.adminEmail}</div>
                )}
                <div className="form-hint">
                  This will be your admin account. OTP will be sent here.
                </div>
              </div>

              {/* Subdomain (Slug) */}
              <SlugChecker
                value={slug}
                onChange={(val) => {
                  setSlug(val);
                  if (errors.slug) setErrors((prev) => ({ ...prev, slug: "" }));
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

      {/* Footer */}
      <footer className="page-footer">
        © 2026 {config.APP_NAME}. All rights reserved.
      </footer>
    </div>
  );
}
```

---

## File 8: src/pages/OnboardingStatus.js

```javascript name=src/pages/OnboardingStatus.js
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getOnboardingStatus } from "../services/api";
import config from "../config";

const STEP_ICONS = {
  completed: "✓",
  in_progress: "●",
  pending: "○",
  failed: "✕",
};

export default function OnboardingStatus() {
  const { tenantId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const tenantName = location.state?.tenantName || "Your workspace";
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // If we got here directly with ACTIVE status from createTenant,
    // skip polling and go straight to complete
    if (location.state?.status === "ACTIVE") {
      navigate(`/onboarding/complete`, { state: location.state });
      return;
    }

    let interval;
    let mounted = true;

    async function poll() {
      try {
        const data = await getOnboardingStatus(tenantId);
        if (!mounted) return;

        setStatus(data);

        if (data.isCompleted) {
          clearInterval(interval);
          // Wait a moment then go to complete page
          setTimeout(() => {
            if (mounted) {
              navigate(`/onboarding/complete`, {
                state: {
                  ...location.state,
                  ...data,
                },
              });
            }
          }, 1000);
        }

        if (data.isFailed) {
          clearInterval(interval);
          setError("Something went wrong during setup. Please try again.");
        }
      } catch (err) {
        if (mounted) {
          setError("Could not check status. Please refresh.");
        }
      }
    }

    // Initial poll
    poll();
    // Then every 2 seconds
    interval = setInterval(poll, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [tenantId, navigate, location.state]);

  return (
    <div className="page-wrapper">
      <header className="page-header">
        <a href="/" className="logo">
          <div className="logo-icon">Y</div>
          <span className="logo-text">{config.APP_NAME}</span>
        </a>
      </header>

      <main className="page-content">
        <div className="card">
          <div className="card-header">
            <h1>Setting up {tenantName}</h1>
            <p>This usually takes a few seconds</p>
          </div>

          <div className="card-body">
            {error && (
              <div className="alert alert-error">
                <span className="alert-icon">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Progress Bar */}
            <div className="progress-bar-wrapper">
              <div
                className="progress-bar-fill"
                style={{ width: `${status?.progress || 10}%` }}
              />
            </div>

            {/* Steps */}
            {status?.steps && (
              <ul className="steps-list">
                {status.steps.map((step) => (
                  <li className="step-item" key={step.key}>
                    <span className={`step-icon ${step.status}`}>
                      {STEP_ICONS[step.status]}
                    </span>
                    <span className={`step-label ${step.status}`}>
                      {step.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Retry button on failure */}
            {error && (
              <button
                className="btn btn-primary"
                onClick={() => navigate("/onboarding")}
                style={{ marginTop: 24 }}
              >
                ← Try Again
              </button>
            )}
          </div>
        </div>
      </main>

      <footer className="page-footer">
        © 2026 {config.APP_NAME}. All rights reserved.
      </footer>
    </div>
  );
}
```

---

## File 9: src/pages/OnboardingComplete.js

```javascript name=src/pages/OnboardingComplete.js
import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import config from "../config";

export default function OnboardingComplete() {
  const location = useLocation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const data = location.state || {};
  const loginUrl = data.loginUrl || `https://${data.slug}.${config.APP_DOMAIN}`;

  function handleCopy() {
    navigator.clipboard.writeText(loginUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // If no state, redirect to onboarding
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
                onClick={() => navigate("/onboarding")}
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
          <div className="logo-icon">Y</div>
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
            {/* Workspace URL */}
            <div style={{ marginBottom: 24 }}>
              <label className="form-label">Your Workspace URL</label>
              <div className="url-box">
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
                <div className="form-success">Copied to clipboard!</div>
              )}
            </div>

            {/* Workspace Details */}
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
                <span className="info-value" style={{ textTransform: "capitalize" }}>
                  {data.plan}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Status</span>
                <span
                  className="info-value"
                  style={{ color: "var(--success)" }}
                >
                  ● Active
                </span>
              </div>
            </div>

            {/* Email Notice */}
            <div className="alert alert-success" style={{ marginBottom: 28 }}>
              <span className="alert-icon">📧</span>
              <span>
                A welcome email has been sent to <strong>{data.adminEmail}</strong> with
                login instructions.
              </span>
            </div>

            {/* Action Buttons */}
            <a
              href={loginUrl}
              className="btn btn-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Go to Login →
            </a>

            <button
              className="btn btn-secondary"
              onClick={() => navigate("/onboarding")}
              style={{ width: "100%", marginTop: 12 }}
            >
              Create Another Workspace
            </button>
          </div>
        </div>
      </main>

      <footer className="page-footer">
        © 2026 {config.APP_NAME}. All rights reserved.
      </footer>
    </div>
  );
}
```

---

## File 10: src/context/TenantContext.js

```javascript name=src/context/TenantContext.js
import React, { createContext, useContext } from "react";

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  // Read branding config injected by Lambda@Edge
  const config = window.__TENANT_CONFIG__ || null;

  return (
    <TenantContext.Provider value={config}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
```

---

## File 11: src/App.js

```javascript name=src/App.js
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { TenantProvider } from "./context/TenantContext";
import OnboardingPage from "./pages/OnboardingPage";
import OnboardingStatus from "./pages/OnboardingStatus";
import OnboardingComplete from "./pages/OnboardingComplete";

export default function App() {
  return (
    <TenantProvider>
      <Router>
        <Routes>
          {/* Onboarding Pages */}
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/onboarding/status/:tenantId" element={<OnboardingStatus />} />
          <Route path="/onboarding/complete" element={<OnboardingComplete />} />

          {/* Default: redirect to onboarding */}
          <Route path="/" element={<Navigate to="/onboarding" replace />} />
          <Route path="*" element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </Router>
    </TenantProvider>
  );
}
```

---

## File 12: src/index.js

```javascript name=src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

## File 13: .env

```bash name=.env
REACT_APP_API_URL=https://your-api-gateway-url.execute-api.us-east-2.amazonaws.com/prod
REACT_APP_DOMAIN=yourapp.com
REACT_APP_NAME=YourApp
```

---

## Run & Test Locally

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                                                                  │
 │  1. Update .env with your actual API Gateway URL              │
 │                                                                  │
 │  2. Start:                                                      │
 │     cd tenant-onboarding                                       │
 │     npm start                                                  │
 │                                                                  │
 │  3. Open: http://localhost:3000                                │
 │                                                                  │
 │  4. You should see the signup form with:                      │
 │     • Purple gradient background                              │
 │     • Clean white card                                        │
 │     • Company name input                                      │
 │     • Admin email input                                       │
 │     • Subdomain input with .yourapp.com suffix               │
 │     • Plan selector                                           │
 │     • "Create Workspace" button                               │
 │                                                                  │
 │  5. Test slug checker:                                         │
 │     Type "test" → should show ✓ Available                    │
 │     Type "admin" → should show ✕ Reserved                    │
 │     Type "a" → should show "at least 3 characters"           │
 │     (API calls work only if API Gateway is deployed)          │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘
```

---

13 files total. Professional, clean SaaS design. Ready for DevOps to deploy once infra is set up.

Want me to code the **Login page + OTP page** next? (Branded per tenant, Keka-style) 🚀
