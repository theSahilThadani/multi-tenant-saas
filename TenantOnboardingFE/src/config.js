/**
 * Determines which mode the app is running in:
 *
 *   default mode  → nextgendevacademy.com        (main site: signup/onboarding)
 *   tenant mode   → bigdata.nextgendevacademy.com (branded login for that tenant)
 *
 * Detection strategy (two layers, so it works on first load AND after cookie is set):
 *   1. Primary: parse subdomain from window.location.hostname
 *   2. Override: if a tenant_slug cookie exists (set by CloudFront Function
 *      on viewer-response), use that value instead
 *
 * Why two layers?
 *   The CloudFront Function sets the cookie in the HTTP response, so on the very
 *   first page load the browser doesn't have the cookie yet. Parsing the hostname
 *   directly ensures correct detection immediately, with no extra round-trip.
 */

const APP_DOMAIN = process.env.REACT_APP_DOMAIN || 'nextgendevacademy.com';

// ── Layer 1: parse subdomain from hostname ──────────────────────────────────
function getSlugFromHostname() {
  const hostname = window.location.hostname; // e.g. "bigdata.nextgendevacademy.com"

  if (
    hostname === APP_DOMAIN ||
    hostname === 'www.' + APP_DOMAIN ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1'
  ) {
    return 'default';
  }

  if (hostname.endsWith('.' + APP_DOMAIN)) {
    // strip ".nextgendevacademy.com" → "bigdata"
    return hostname.slice(0, hostname.length - APP_DOMAIN.length - 1);
  }

  return 'default';
}

// ── Layer 2: cookie override (set by CloudFront Function on viewer-response) ─
function getCookieValue(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

const slugFromHostname = getSlugFromHostname();
const slugFromCookie = getCookieValue('tenant_slug');

// Cookie wins if it's already set (it's authoritative once the CF Function
// has run at least once). Fallback to hostname on very first load.
const tenantSlug = slugFromCookie || slugFromHostname;
const isTenantMode = tenantSlug !== 'default';

const config = {
  ONBOARDING_API_URL:
    process.env.REACT_APP_ONBOARDING_API_URL || 'http://localhost:3001',
  SIGNIN_API_URL:
    process.env.REACT_APP_SIGNIN_API_URL || 'http://localhost:3002',
  SYNC_API_URL:
    process.env.REACT_APP_SYNC_API_URL || 'http://localhost:3003',
  APP_DOMAIN,
  APP_NAME: process.env.REACT_APP_NAME || 'NextGenDevAcademy',

  // Resolved at runtime from hostname + cookie
  tenantSlug,
  isTenantMode,
};

export default config;
