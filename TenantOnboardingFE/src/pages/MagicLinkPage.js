import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { verifyMagicLink } from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";

export default function MagicLinkPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("verifying"); // verifying, error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg("No token found in URL.");
      return;
    }

    async function verify() {
      try {
        const data = await verifyMagicLink(token);

        // Store auth in sessionStorage (same pattern as DashboardPage)
        const userData = {
          email: data.email,
          accessToken: data.accessToken,
          role: data.role || "member",
          tenantSlug: data.tenantSlug,
          tenantName: data.tenantName,
        };
        sessionStorage.setItem("dashboard_user", JSON.stringify(userData));

        // Redirect to target URL
        const targetUrl = data.targetUrl || "/dashboard";
        navigate(targetUrl, {
          replace: true,
          state: {
            email: data.email,
            accessToken: data.accessToken,
            role: data.role,
            tenantSlug: data.tenantSlug,
            tenantName: data.tenantName,
          },
        });
      } catch (err) {
        setStatus("error");
        const code = err.error || "UNKNOWN_ERROR";
        if (code === "LINK_EXPIRED") {
          setErrorMsg("This link has expired. Please request a new one.");
        } else if (code === "LINK_ALREADY_USED") {
          setErrorMsg("This link has already been used.");
        } else if (code === "INVALID_LINK") {
          setErrorMsg("This link is invalid.");
        } else {
          setErrorMsg(err.message || "Something went wrong. Please try again.");
        }
      }
    }

    verify();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "verifying") {
    return (
      <div className="page-wrapper">
        <main className="page-content">
          <div className="card">
            <div className="card-body" style={{ textAlign: "center", padding: 60 }}>
              <LoadingSpinner size={40} />
              <p style={{ marginTop: 16, color: "var(--gray-500)" }}>
                Verifying your link...
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <main className="page-content">
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ color: "var(--gray-900)", marginBottom: 8 }}>
              Link Not Valid
            </h2>
            <p style={{ color: "var(--gray-600)", marginBottom: 24 }}>
              {errorMsg}
            </p>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/login")}
              style={{
                padding: "10px 24px",
                backgroundColor: "var(--primary)",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Go to Login
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
