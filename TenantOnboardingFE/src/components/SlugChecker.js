import React, { useState, useEffect, useRef } from "react";
import { checkSlug } from "../services/api";
import config from "../config";

export default function SlugChecker({ value, onChange, error, setError, setSlugValid }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const debounceTimer = useRef(null);

  // Validate format locally first
  function validateFormat(slug) {
    if (!slug) return null;
    if (slug.length < 3) return "Must be at least 3 characters";
    if (slug.length > 30) return "Must be at most 30 characters";
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug)) {
      return "Only lowercase letters, numbers, and hyphens. Must start with a letter.";
    }
    return null;
  }

  // Handle input change
  function handleChange(e) {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    onChange(raw);
    setResult(null);
    setSlugValid(false);

    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Validate format
    const formatError = validateFormat(raw);
    if (formatError) {
      setError(formatError);
      setChecking(false);
      return;
    }

    setError("");

    // Debounce API call (500ms)
    setChecking(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        const data = await checkSlug(raw);
        setResult(data);
        if (data.available) {
          setSlugValid(true);
          setError("");
        } else {
          setSlugValid(false);
          setError(data.message || "Not available");
        }
      } catch (err) {
        setError("Could not check availability");
        setSlugValid(false);
      }
      setChecking(false);
    }, 500);
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Determine input state
  const isValid = result?.available === true;
  const isInvalid = error || result?.available === false;

  return (
    <div className="form-group">
      <label className="form-label">
        Subdomain <span className="required">*</span>
      </label>
      <div
        className={`slug-input-group ${
          isValid ? "success" : isInvalid ? "error" : ""
        }`}
      >
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="your-company"
          maxLength={30}
          autoComplete="off"
          spellCheck="false"
        />
        <span className="slug-suffix">.{config.APP_DOMAIN}</span>
      </div>

      {/* Status messages */}
      {checking && (
        <div className="form-hint" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
          <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></span>
          Checking availability...
        </div>
      )}
      {!checking && isValid && (
        <div className="form-success">✓ Available</div>
      )}
      {!checking && error && (
        <div className="form-error">✕ {error}</div>
      )}
      {!error && !checking && !isValid && value.length > 0 && value.length < 3 && (
        <div className="form-hint">Type at least 3 characters</div>
      )}
    </div>
  );
}
