import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { googleVerify } from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import config from "../config";

export default function GoogleCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const errorParam = params.get("error");

      if (errorParam) {
        setError(decodeURIComponent(errorParam.replace(/\+/g, " ")));
        return;
      }

      if (!code) {
        setError("No authorization code received. Please try again.");
        return;
      }

      // CSRF check
      const savedState = sessionStorage.getItem("google_oauth_state");
      if (!savedState || savedState !== state) {
        setError("Invalid session state. Please return to login and try again.");
        return;
      }

      sessionStorage.removeItem("google_oauth_state");

      const redirectUri = `${window.location.origin}/auth/google/callback`;

      try {
        const result = await googleVerify(code, redirectUri);

        if (result.hasTenant) {
          navigate("/welcome-back", {
            replace: true,
            state: {
              email: result.email,
              accessToken: result.accessToken,
              tenantSlug: result.tenantSlug,
              tenantName: result.tenantName,
              tenantRole: result.tenantRole,
              loginUrl: result.loginUrl,
            },
          });
        } else {
          navigate("/signup", {
            replace: true,
            state: {
              email: result.email,
              accessToken: result.accessToken,
              verified: true,
            },
          });
        }
      } catch (err) {
        console.error("[GoogleCallback] Error:", err);
        if (err.error === "CODE_EXCHANGE_FAILED") {
          setError("Authorization code expired. Please try again.");
        } else if (err.error === "EMAIL_NOT_VERIFIED") {
          setError("Your Google email is not verified. Please use a verified Google account.");
        } else {
          setError(err.message || "Google sign-up failed. Please try again.");
        }
      }
    }

    handleCallback();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="split-layout">
        <div className="split-left">
          <div className="brand-hero">
            <div className="brand-logo-wrap">
              <div className="brand-logo-icon">{config.APP_NAME.charAt(0)}</div>
              <span className="brand-logo-name">{config.APP_NAME}</span>
            </div>
          </div>
        </div>
        <div className="split-right">
          <div className="auth-form-container">
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 16 }}>&#9888;&#65039;</div>
              <h3 style={{ color: "var(--error)", marginBottom: 8 }}>
                Sign-up Failed
              </h3>
              <p
                style={{
                  color: "var(--gray-600)",
                  marginBottom: 28,
                  lineHeight: 1.6,
                }}
              >
                {error}
              </p>
              <button
                className="btn btn-primary"
                onClick={() => navigate("/login")}
              >
                Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="split-layout">
      <div className="split-left">
        <div className="brand-hero">
          <div className="brand-logo-wrap">
            <div className="brand-logo-icon">{config.APP_NAME.charAt(0)}</div>
            <span className="brand-logo-name">{config.APP_NAME}</span>
          </div>
        </div>
      </div>
      <div className="split-right">
        <div className="auth-form-container" style={{ textAlign: "center" }}>
          <LoadingSpinner size={40} />
          <p style={{ marginTop: 20, color: "var(--gray-500)", fontSize: 15 }}>
            Completing Google sign-up...
          </p>
        </div>
      </div>
    </div>
  );
}
