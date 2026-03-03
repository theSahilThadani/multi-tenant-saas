import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import LoadingSpinner from "../components/LoadingSpinner";
import { verifyOtp, sendOtp, signinVerifyOtp, signinSendOtp } from "../services/api";
import { useTenant } from "../context/TenantContext";
import { saveTokensToSession } from "../utils/authSession";
import config from "../config";

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const tenant = useTenant();

  const email = location.state?.email || "";
  const mode = location.state?.mode || "MAIN";
  const tenantSlugFromState = location.state?.tenantSlug || "";

  const [session, setSession] = useState(location.state?.session || "");
  const [otp, setOtp] = useState(["", "", "", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);

  const inputRefs = useRef([]);

  useEffect(() => {
    if (!email) navigate("/login");
  }, [email, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  function handleDigitChange(index, value) {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 8).split("");
      const newOtp = [...otp];
      digits.forEach((d, i) => {
        if (index + i < 8) newOtp[index + i] = d;
      });
      setOtp(newOtp);
      setError("");
      const nextIndex = Math.min(index + digits.length, 7);
      inputRefs.current[nextIndex]?.focus();
      if (newOtp.every((d) => d !== "")) handleSubmit(null, newOtp.join(""));
      return;
    }
    if (value && !/^\d$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError("");
    if (value && index < 7) inputRefs.current[index + 1]?.focus();
    if (value && index === 7 && newOtp.every((d) => d !== ""))
      handleSubmit(null, newOtp.join(""));
  }

  function handleKeyDown(index, e) {
    if (e.key === "Backspace" && !otp[index] && index > 0)
      inputRefs.current[index - 1]?.focus();
  }

  async function handleSubmit(e, otpOverride) {
    if (e) e.preventDefault();
    setError("");
    const code = otpOverride || otp.join("");
    if (code.length !== 8) {
      setError("Please enter all 8 digits");
      return;
    }

    setLoading(true);

    try {
      if (mode === "TENANT") {
        // ── TENANT MODE (abc.nextgen.com): signin lambda ──
        const result = await signinVerifyOtp(email, code, session, tenantSlugFromState);
        saveTokensToSession(result);
        navigate("/dashboard", {
          state: {
            email: result.email,
            accessToken: result.accessToken,
            idToken: result.idToken,
            refreshToken: result.refreshToken,
            tenantSlug: result.tenantSlug || tenantSlugFromState,
            tenantName: result.tenantName,
            role: result.role,
            authMethod: "OTP",
          },
        });
      } else {
        // ── MAIN MODE: onboarding verify ──
        const result = await verifyOtp(email, code, session);
        saveTokensToSession(result);

        if (result.hasTenant) {
          // Existing user → welcome back
          navigate("/welcome-back", {
            state: {
              email: result.email,
              accessToken: result.accessToken,
              idToken: result.idToken,
              refreshToken: result.refreshToken,
              tenantSlug: result.tenantSlug,
              tenantName: result.tenantName,
              tenantRole: result.tenantRole,
              loginUrl: result.loginUrl,
              fromTenant: false,
            },
          });
        } else {
          // New user → signup form
          navigate("/signup", {
            state: {
              email: result.email,
              accessToken: result.accessToken,
              idToken: result.idToken,
              refreshToken: result.refreshToken,
              verified: true,
            },
          });
        }
      }
    } catch (err) {
      if (err.error === "WRONG_OTP") {
        setError("Incorrect code. Please check and try again.");
        setOtp(["", "", "", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      } else if (err.error === "OTP_EXPIRED") {
        setError("Code has expired. Please request a new one.");
      } else if (err.error === "SESSION_EXPIRED") {
        setError("Session expired. Please request a new code.");
      } else {
        setError(err.message || "Verification failed.");
      }
    }
    setLoading(false);
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setResending(true);
    setError("");
    setOtp(["", "", "", "", "", "", "", ""]);

    try {
      let result;
      if (mode === "TENANT") {
        result = await signinSendOtp(email, tenantSlugFromState);
      } else {
        result = await sendOtp(email);
      }
      setSession(result.session);
      setResendCooldown(30);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError("Could not resend code. Try again.");
    }
    setResending(false);
  }

  const displayName = config.isTenantMode
    ? (tenant.tenantName || location.state?.tenantName || config.APP_NAME)
    : config.APP_NAME;

  return (
    <div className="page-wrapper">
      <header className="page-header">
        <a href="/" className="logo">
          <div className="logo-icon">{displayName.charAt(0)}</div>
          <span className="logo-text">{displayName}</span>
        </a>
      </header>

      <main className="page-content">
        <div className="card">
          <div className="card-header">
            <h1>Check your email</h1>
            <p>
              We sent an 8-digit code to<br />
              <strong>{email}</strong>
            </p>
          </div>

          <div className="card-body">
            {error && (
              <div className="alert alert-error">
                <span className="alert-icon">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 8,
                  marginBottom: 24,
                }}
              >
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    value={digit}
                    onChange={(e) => handleDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onFocus={(e) => e.target.select()}
                    disabled={loading}
                    autoFocus={index === 0}
                    style={{
                      width: 42,
                      height: 52,
                      textAlign: "center",
                      fontSize: 20,
                      fontWeight: 700,
                      fontFamily: "inherit",
                      border: `2px solid ${
                        error
                          ? "var(--error)"
                          : digit
                          ? "var(--primary)"
                          : "var(--gray-300)"
                      }`,
                      borderRadius: "var(--radius)",
                      outline: "none",
                      transition: "all 0.2s ease",
                      color: "var(--gray-900)",
                    }}
                    onFocusCapture={(e) => {
                      e.target.style.borderColor = "var(--primary)";
                      e.target.style.boxShadow = "0 0 0 3px var(--primary-50)";
                    }}
                    onBlurCapture={(e) => {
                      e.target.style.borderColor = digit
                        ? "var(--primary)"
                        : "var(--gray-300)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                ))}
              </div>

              <div className="form-group">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || otp.join("").length !== 8}
                >
                  {loading ? (
                    <>
                      <LoadingSpinner white size={18} />
                      Verifying...
                    </>
                  ) : (
                    <>🔐 Verify Code</>
                  )}
                </button>
              </div>
            </form>

            <div
              style={{
                textAlign: "center",
                marginTop: 20,
                fontSize: 14,
                color: "var(--gray-500)",
              }}
            >
              <p>
                Didn't receive the code?{" "}
                {resendCooldown > 0 ? (
                  <span style={{ color: "var(--gray-400)" }}>
                    Resend in {resendCooldown}s
                  </span>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={resending}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--primary)",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 14,
                      padding: 0,
                    }}
                  >
                    {resending ? "Sending..." : "Resend Code"}
                  </button>
                )}
              </p>
              <p style={{ marginTop: 8 }}>
                <button
                  onClick={() => navigate("/login")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--gray-500)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 14,
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  ← Use a different email
                </button>
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="page-footer">
        © 2026 {config.APP_NAME}. All rights reserved.
      </footer>
    </div>
  );
}
