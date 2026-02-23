import React from "react";
import config from "../config";

export default function NotFoundPage() {
  const tenant = window.__TENANT_CONFIG__ || {};

  return (
    <div className="page-wrapper">
      <main className="page-content">
        <div className="card">
          <div className="card-header">
            <div className="success-icon">🔍</div>
            <h1>Workspace Not Found</h1>
            <p>
              {tenant.tenantSlug && tenant.tenantSlug !== "default"
                ? `The workspace "${tenant.tenantSlug}" does not exist`
                : "This workspace does not exist"}
            </p>
          </div>

          <div className="card-body">
            <p
              style={{
                textAlign: "center",
                color: "var(--gray-500)",
                marginBottom: 24,
              }}
            >
              The workspace you're looking for might have been removed or the URL
              is incorrect.
            </p>

            <a
              href={`https://${config.APP_DOMAIN}/login`}
              className="btn btn-primary"
              style={{
                display: "block",
                textAlign: "center",
                textDecoration: "none",
                marginBottom: 12,
              }}
            >
              Go to {config.APP_NAME} →
            </a>

            <a
              href={`https://${config.APP_DOMAIN}/signup`}
              className="btn btn-secondary"
              style={{
                display: "block",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Create a Workspace
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}