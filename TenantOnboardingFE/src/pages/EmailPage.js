import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import StepIndicator from "../components/StepIndicator";
import LoadingSpinner from "../components/LoadingSpinner";
import { sendOtp } from "../services/api";
import config from "../config";

export default function EmailPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function validateEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }
    if (!validateEmail(trimmedEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);

    try {
      const result = await sendOtp(trimmedEmail);

      // Navigate to OTP verification page
      navigate("/verify", {
        state: {
          email: trimmedEmail,
          session: result.session,
        },
      });
    } catch (err) {
      if (err.error === "ALREADY_ONBOARDED") {
        setError("This email already has a workspace. Please login instead.");
      } else {
        setError(err.message || "Could not send verification code. Try again.");
      }
    }

    setLoading(false);
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
            <h1>Create your workspace</h1>
            <p>Enter your email to get started</p>
          </div>

          <div className="card-body">
            <StepIndicator currentStep={1} />

            {error && (
              <div className="alert alert-error">
                <span className="alert-icon">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label className="form-label">
                  Work Email <span className="required">*</span>
                </label>
                <input
                  type="email"
                  className={`form-input ${error ? "error" : ""}`}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder="admin@yourcompany.com"
                  disabled={loading}
                  autoFocus
                  autoComplete="email"
                />
                <div className="form-hint">
                  We'll send a verification code to this email
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 28 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !email.trim()}
                >
                  {loading ? (
                    <>
                      <LoadingSpinner white size={18} />
                      Sending code...
                    </>
                  ) : (
                    <>📧 Send Verification Code</>
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