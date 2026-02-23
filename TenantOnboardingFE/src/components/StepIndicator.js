import React from "react";

const steps = [
  { number: 1, label: "Email" },
  { number: 2, label: "Verify" },
  { number: 3, label: "Workspace" },
];

export default function StepIndicator({ currentStep }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 0,
      marginBottom: 32,
    }}>
      {steps.map((step, index) => (
        <React.Fragment key={step.number}>
          {/* Step circle */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              background: currentStep > step.number
                ? "#059669"
                : currentStep === step.number
                  ? "#4F46E5"
                  : "#E5E7EB",
              color: currentStep >= step.number ? "white" : "#9CA3AF",
              transition: "all 0.3s ease",
            }}>
              {currentStep > step.number ? "✓" : step.number}
            </div>
            <span style={{
              fontSize: 12,
              fontWeight: currentStep === step.number ? 600 : 500,
              color: currentStep === step.number
                ? "#4F46E5"
                : currentStep > step.number
                  ? "#059669"
                  : "#9CA3AF",
            }}>
              {step.label}
            </span>
          </div>

          {/* Connector line */}
          {index < steps.length - 1 && (
            <div style={{
              width: 60,
              height: 2,
              background: currentStep > step.number ? "#059669" : "#E5E7EB",
              marginBottom: 22,
              transition: "all 0.3s ease",
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}