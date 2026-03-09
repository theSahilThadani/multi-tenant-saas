import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function InvitationCompletePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const stateData = location.state;
    if (stateData?.email) {
      setUserData(stateData);
    } else {
      // Try sessionStorage fallback
      const saved = sessionStorage.getItem("dashboard_user");
      if (saved) {
        try {
          setUserData(JSON.parse(saved));
        } catch {
          navigate("/login");
        }
      } else {
        navigate("/login");
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleContinue() {
    navigate("/dashboard", {
      state: {
        email: userData.email,
        accessToken: userData.accessToken,
        role: userData.role,
        tenantSlug: userData.tenantSlug,
        tenantName: userData.tenantName,
      },
    });
  }

  if (!userData) {
    return (
      <div className="page-wrapper">
        <main className="page-content">
          <div className="card">
            <div className="card-body" style={{ textAlign: "center", padding: 60 }}>
              <p style={{ color: "var(--gray-500)" }}>Loading...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const roleLabel = (userData.role || "member").replace(/_/g, " ");
  const tenantName = userData.tenantName || userData.tenantSlug || "Workspace";

  return (
    <div className="page-wrapper">
      <main className="page-content" style={{ maxWidth: 500, margin: "60px auto" }}>
        <div className="card">
          <div className="card-body" style={{ padding: 40, textAlign: "center" }}>
            {/* Success icon */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #059669 0%, #10B981 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
                fontSize: 36,
              }}
            >
              ✓
            </div>

            <h2 style={{ color: "var(--gray-900)", margin: "0 0 8px" }}>
              Welcome to {tenantName}!
            </h2>
            <p style={{ color: "var(--gray-600)", margin: "0 0 24px", lineHeight: 1.6 }}>
              You've been added as <strong style={{ textTransform: "capitalize" }}>{roleLabel}</strong>.
              Your account is ready to use.
            </p>

            {/* Account details */}
            <div
              style={{
                background: "var(--gray-50)",
                borderRadius: 8,
                padding: 16,
                marginBottom: 24,
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--gray-200)" }}>
                <span style={{ color: "var(--gray-500)", fontSize: 14 }}>Email</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{userData.email}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--gray-200)" }}>
                <span style={{ color: "var(--gray-500)", fontSize: 14 }}>Workspace</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{tenantName}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                <span style={{ color: "var(--gray-500)", fontSize: 14 }}>Role</span>
                <span style={{ fontWeight: 600, fontSize: 14, textTransform: "capitalize" }}>{roleLabel}</span>
              </div>
            </div>

            <button
              onClick={handleContinue}
              style={{
                width: "100%",
                padding: "12px 24px",
                backgroundColor: "#4F46E5",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Go to Dashboard →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
