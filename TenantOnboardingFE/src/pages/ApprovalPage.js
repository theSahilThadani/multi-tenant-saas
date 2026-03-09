import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getApproval, decideApproval } from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";

export default function ApprovalPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [approval, setApproval] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Get access token from sessionStorage
  const stored = sessionStorage.getItem("dashboard_user");
  const userData = stored ? JSON.parse(stored) : null;
  const accessToken = userData?.accessToken;

  useEffect(() => {
    if (!accessToken) {
      navigate("/login");
      return;
    }

    async function fetchApproval() {
      try {
        const data = await getApproval(id, accessToken);
        setApproval(data);
      } catch (err) {
        setError(err.message || "Failed to load approval");
      } finally {
        setLoading(false);
      }
    }

    fetchApproval();
  }, [id, accessToken, navigate]);

  async function handleDecide(decision) {
    setDeciding(true);
    setError("");
    try {
      const data = await decideApproval(id, decision, comment, accessToken);
      setResult(data);
      setApproval((prev) => ({ ...prev, status: decision }));
    } catch (err) {
      setError(err.message || "Failed to submit decision");
    } finally {
      setDeciding(false);
    }
  }

  if (loading) {
    return (
      <div className="page-wrapper">
        <main className="page-content">
          <div className="card">
            <div className="card-body" style={{ textAlign: "center", padding: 60 }}>
              <LoadingSpinner size={40} />
              <p style={{ marginTop: 16, color: "var(--gray-500)" }}>
                Loading approval...
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error && !approval) {
    return (
      <div className="page-wrapper">
        <main className="page-content">
          <div className="card">
            <div className="card-body" style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
              <h2>Error</h2>
              <p style={{ color: "var(--gray-600)" }}>{error}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const isPending = approval?.status === "pending";
  const statusColors = {
    pending: { bg: "#FEF3C7", color: "#92400E", label: "Pending" },
    approved: { bg: "#D1FAE5", color: "#065F46", label: "Approved" },
    rejected: { bg: "#FEE2E2", color: "#991B1B", label: "Rejected" },
  };
  const statusStyle = statusColors[approval?.status] || statusColors.pending;

  return (
    <div className="page-wrapper">
      <main className="page-content" style={{ maxWidth: 600, margin: "40px auto" }}>
        <div className="card">
          <div className="card-body" style={{ padding: 32 }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ margin: 0, color: "var(--gray-900)" }}>Approval Request</h2>
              <span
                style={{
                  padding: "4px 12px",
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  backgroundColor: statusStyle.bg,
                  color: statusStyle.color,
                }}
              >
                {statusStyle.label}
              </span>
            </div>

            {/* Details */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 8px", color: "var(--gray-900)" }}>{approval.title}</h3>
              {approval.description && (
                <p style={{ color: "var(--gray-600)", margin: "0 0 16px", lineHeight: 1.6 }}>
                  {approval.description}
                </p>
              )}
              <div style={{ fontSize: 14, color: "var(--gray-500)" }}>
                <p style={{ margin: "4px 0" }}>
                  <strong>Requested by:</strong> {approval.requested_by}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Approver:</strong> {approval.approver_email}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Created:</strong> {new Date(approval.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Decision area */}
            {isPending && (
              <div style={{ borderTop: "1px solid var(--gray-200)", paddingTop: 20 }}>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  Comment (optional)
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 6,
                    border: "1px solid var(--gray-300)",
                    fontSize: 14,
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
                {error && (
                  <p style={{ color: "#DC2626", fontSize: 14, margin: "8px 0" }}>{error}</p>
                )}
                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <button
                    onClick={() => handleDecide("approved")}
                    disabled={deciding}
                    style={{
                      flex: 1,
                      padding: "10px 20px",
                      backgroundColor: "#059669",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: deciding ? "not-allowed" : "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                      opacity: deciding ? 0.7 : 1,
                    }}
                  >
                    {deciding ? "..." : "✓ Approve"}
                  </button>
                  <button
                    onClick={() => handleDecide("rejected")}
                    disabled={deciding}
                    style={{
                      flex: 1,
                      padding: "10px 20px",
                      backgroundColor: "#DC2626",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: deciding ? "not-allowed" : "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                      opacity: deciding ? 0.7 : 1,
                    }}
                  >
                    {deciding ? "..." : "✕ Reject"}
                  </button>
                </div>
              </div>
            )}

            {/* Decision result */}
            {result && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: result.status === "approved" ? "#D1FAE5" : "#FEE2E2",
                  textAlign: "center",
                }}
              >
                <p style={{ margin: 0, fontWeight: 600, color: result.status === "approved" ? "#065F46" : "#991B1B" }}>
                  {result.status === "approved" ? "✓ Approved" : "✕ Rejected"} successfully
                </p>
              </div>
            )}

            {!isPending && !result && approval.decision_comment && (
              <div style={{ borderTop: "1px solid var(--gray-200)", paddingTop: 16, marginTop: 16 }}>
                <p style={{ fontSize: 14, color: "var(--gray-500)", margin: 0 }}>
                  <strong>Comment:</strong> {approval.decision_comment}
                </p>
              </div>
            )}

            {/* Back to dashboard */}
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <button
                onClick={() => navigate("/dashboard")}
                style={{
                  padding: "8px 20px",
                  backgroundColor: "transparent",
                  color: "var(--primary)",
                  border: "1px solid var(--primary)",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
