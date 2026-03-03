import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "../context/TenantContext";
import { federatedVerify } from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import { saveTokensToSession } from "../utils/authSession";

export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const tenant = useTenant();
  const [error, setError] = useState("");

  useEffect(() => {
    // Wait for tenant context to finish loading (we need tenantSlug)
    if (tenant.loading) return;

    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const errorParam = params.get("error");
      const errorDesc = params.get("error_description");

      if (errorParam) {
        setError(decodeURIComponent((errorDesc || errorParam).replace(/\+/g, " ")));
        return;
      }

      if (!code) {
        setError("No authorization code received. Please try again.");
        return;
      }

      const codeVerifier = sessionStorage.getItem("pkce_verifier");
      const tenantSlug = tenant.tenantSlug;

      if (!codeVerifier) {
        setError("Session expired. Please return to the login page and try again.");
        return;
      }

      if (!tenantSlug) {
        setError("Could not determine workspace. Please return to login.");
        return;
      }

      const redirectUri = `${window.location.origin}/auth/callback`;

      try {
        const result = await federatedVerify(code, tenantSlug, codeVerifier, redirectUri);
        sessionStorage.removeItem("pkce_verifier");
        saveTokensToSession(result);

        navigate("/dashboard", {
          replace: true,
          state: {
            email: result.email,
            accessToken: result.accessToken,
            idToken: result.idToken,
            refreshToken: result.refreshToken,
            role: result.role,
            tenantSlug: result.tenantSlug,
            tenantName: result.tenantName,
            authMethod: "SSO",
          },
        });
      } catch (err) {
        console.error("[OAuthCallback] Error:", err);
        sessionStorage.removeItem("pkce_verifier");
        if (err.error === "WRONG_WORKSPACE") {
          setError(err.message || "This account belongs to a different workspace.");
        } else if (err.error === "CODE_EXCHANGE_FAILED") {
          setError("Authorization code expired. Please sign in again.");
        } else {
          setError(err.message || "Sign-in failed. Please try again.");
        }
      }
    }

    handleCallback();
  }, [tenant.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const primaryColor = tenant.primaryColor || "#4F46E5";

  if (error) {
    return (
      <div className="tenant-login-wrapper">
        <main className="tenant-login-content">
          <div className="tenant-login-card">
            <div
              className="tenant-brand-header"
              style={{ background: primaryColor }}
            />
            <div style={{ padding: "40px", textAlign: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 16 }}>⚠️</div>
              <h3 style={{ color: "var(--error)", marginBottom: 8 }}>
                Sign-in Failed
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
                style={{ background: primaryColor }}
                onClick={() => navigate("/login")}
              >
                Back to Login
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="tenant-login-wrapper">
      <main className="tenant-login-content">
        <div className="tenant-login-card">
          <div
            className="tenant-brand-header"
            style={{ background: primaryColor }}
          />
          <div style={{ padding: "40px", textAlign: "center" }}>
            <LoadingSpinner size={40} />
            <p style={{ marginTop: 20, color: "var(--gray-500)", fontSize: 15 }}>
              Completing sign-in...
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
