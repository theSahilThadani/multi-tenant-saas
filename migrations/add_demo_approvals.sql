-- Migration: add_demo_approvals
-- Mock approval requests for magic link Pattern A demo

CREATE TABLE demo_approvals (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title            VARCHAR(255) NOT NULL,
    description      TEXT,
    requested_by     VARCHAR(255) NOT NULL,      -- email of requester
    approver_email   VARCHAR(255) NOT NULL,      -- email of approver
    status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
    decided_at       TIMESTAMPTZ,
    decision_comment TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_demo_approvals_tenant ON demo_approvals (tenant_id, created_at DESC);
CREATE INDEX idx_demo_approvals_approver ON demo_approvals (approver_email, status);
