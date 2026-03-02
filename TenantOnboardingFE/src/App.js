import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { TenantProvider, useTenant } from './context/TenantContext';
import LoginPage from './pages/LoginPage';
import VerifyOtpPage from './pages/VerifyOtpPage';
import SignupPage from './pages/SignupPage';
import WelcomeBackPage from './pages/WelcomeBackPage';
import OnboardingComplete from './pages/OnboardingComplete';
import DashboardPage from './pages/DashboardPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import AccessDeniedPage from './pages/AccessDeniedPage';
import NotFoundPage from './pages/NotFoundPage';
import WebSocketConsolePage from './pages/WebSocketConsolePage';
import LoadingSpinner from './components/LoadingSpinner';

function AppRoutes() {
  const tenant = useTenant();

  // Show loading while fetching tenant branding
  if (tenant.loading) {
    return (
      <div className="page-wrapper">
        <main className="page-content">
          <div className="card">
            <div className="card-body" style={{
              textAlign: 'center',
              padding: 60,
            }}>
              <LoadingSpinner size={40} />
              <p style={{ marginTop: 16, color: 'var(--gray-500)' }}>
                Loading workspace...
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Tenant doesn't exist
  if (tenant.isNotFound) {
    return (
      <Routes>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify" element={<VerifyOtpPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/welcome-back" element={<WelcomeBackPage />} />
      <Route path="/onboarding/complete" element={<OnboardingComplete />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      <Route path="/admin/settings" element={<AdminSettingsPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route path="/ws-console" element={<WebSocketConsolePage />} />
      <Route path="/not-found" element={<NotFoundPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <TenantProvider>
      <Router>
        <AppRoutes />
      </Router>
    </TenantProvider>
  );
}