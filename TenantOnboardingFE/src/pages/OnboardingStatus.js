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
          <div className="logo-icon">M</div>
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
