/**
 * CloudFront Function — Tenant Slug Cookie Injector
 *
 * Event type: VIEWER RESPONSE  ← IMPORTANT: attach this on viewer-response, not viewer-request
 *
 * What it does:
 *   - Reads the Host header from the incoming request
 *   - Extracts the subdomain (e.g., "bigdata" from "bigdata.nextgendevacademy.com")
 *   - Sets a Set-Cookie header in the response: tenant_slug=bigdata
 *   - The React app reads this cookie on every subsequent load to detect tenant mode
 *
 * MUST return event.response — this was missing before (caused 503 "invalid value" error)
 *
 * Deploy: AWS Console → CloudFront → Functions → Create/update function
 *   Runtime: cloudfront-js-2.0
 *   Associate with: your distribution, Cache Behavior: *, Event type: Viewer Response
 */

var ROOT_DOMAIN = 'nextgendevacademy.com';

function handler(event) {
  var request = event.request;
  var response = event.response;

  // Read the Host header safely
  var host = '';
  if (request.headers && request.headers.host && request.headers.host.value) {
    host = request.headers.host.value.toLowerCase();
  }

  // Determine tenant slug from subdomain
  var tenantSlug = 'default';
  if (
    host &&
    host !== ROOT_DOMAIN &&
    host !== 'www.' + ROOT_DOMAIN &&
    host.endsWith('.' + ROOT_DOMAIN)
  ) {
    // e.g., host = "bigdata.nextgendevacademy.com"
    //   → tenantSlug = "bigdata"
    tenantSlug = host.slice(0, host.length - ROOT_DOMAIN.length - 1);
  }

  // Inject tenant_slug into the response cookies so the browser stores it
  if (!response.cookies) {
    response.cookies = {};
  }
  response.cookies['tenant_slug'] = {
    value: tenantSlug,
    attributes: 'Domain=.' + ROOT_DOMAIN + '; Path=/; SameSite=Lax',
  };

  // MUST return response — missing return was the cause of the 503 error
  return response;
}
