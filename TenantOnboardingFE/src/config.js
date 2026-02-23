// Read tenant slug from cookie (set by CloudFront Function)
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

const tenantSlug = getCookie('tenant_slug') || 'default';
const isTenantMode = tenantSlug !== 'default';

const config = {
  ONBOARDING_API_URL:
    process.env.REACT_APP_ONBOARDING_API_URL || 'http://localhost:3001',
  SIGNIN_API_URL:
    process.env.REACT_APP_SIGNIN_API_URL || 'http://localhost:3002',
  APP_DOMAIN: process.env.REACT_APP_DOMAIN || 'motadata.com',
  APP_NAME: process.env.REACT_APP_NAME || 'Motadata',

  // From cookie
  tenantSlug,
  isTenantMode,
};

export default config;