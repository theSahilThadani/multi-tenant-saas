import React from "react";

export default function LoadingSpinner({ white = false, size = 20 }) {
  return (
    <span
      className={`spinner ${white ? "spinner-white" : ""}`}
      style={{ width: size, height: size }}
    />
  );
}
