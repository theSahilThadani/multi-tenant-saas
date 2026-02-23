import React, { createContext, useContext, useState, useEffect } from 'react';
import config from '../config';
import { getTenantInfo } from '../services/api';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState({
    loading: config.isTenantMode,    // only loading if tenant mode
    isTenantMode: config.isTenantMode,
    isNotFound: false,
    tenantSlug: config.tenantSlug,
    tenantName: config.APP_NAME,
    primaryColor: '#4F46E5',
    logoUrl: '',
    welcomeMessage: '',
    plan: '',
    status: 'UNKNOWN',
  });

  useEffect(() => {
    if (!config.isTenantMode) return;

    // Fetch branding from signin-lambda API
    async function fetchBranding() {
      try {
        const data = await getTenantInfo(config.tenantSlug);

        setTenant({
          loading: false,
          isTenantMode: true,
          isNotFound: false,
          tenantSlug: data.tenantSlug,
          tenantName: data.tenantName,
          primaryColor: data.primaryColor || '#4F46E5',
          logoUrl: data.logoUrl || '',
          welcomeMessage: data.welcomeMessage || '',
          plan: data.plan || '',
          status: data.status || 'ACTIVE',
        });

        // Update page title
        document.title = `${data.tenantName} - Login`;
      } catch (err) {
        console.error('[TenantContext] Failed to load tenant:', err);
        setTenant((prev) => ({
          ...prev,
          loading: false,
          isNotFound: true,
          tenantName: 'Not Found',
          status: 'NOT_FOUND',
        }));
      }
    }

    fetchBranding();
  }, []);

  return (
    <TenantContext.Provider value={tenant}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}