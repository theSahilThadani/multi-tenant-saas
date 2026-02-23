import React from "react";
import config from "../config";

export default function AccessDeniedPage() {
  return (
    <div className="page-wrapper">
      <main className="page-content">
        <div className="card">
          <div className="card-header">
            <div className="success-icon">🚫</div>
            <h1>Access Denied</h1>
            <p>You don't belong to this workspace</p>
          </div>

          <div className="card-body">
            <div className="alert alert-error" style={{ marginBottom: 24 }}>
              <span className="alert-icon">⚠</span>
              <span>
                Your email is not associated with this workspace. Please contact
                the workspace admin to get access.
              </span>
            </div>

            <a
              href={`https://${config.APP_DOMAIN}/login`}
              className="btn btn-primary"
              style={{
                display: "block",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Go to {config.APP_NAME} →
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}