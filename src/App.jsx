import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import PermissionRoute from '@/components/PermissionRoute';
import ScrollToTop from './components/ScrollToTop';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

import AppLayout from '@/components/layout/AppLayout';
import Overview from '@/pages/Overview';
import DistributionDashboard from '@/pages/DistributionDashboard';
import LeadsView from '@/pages/LeadsView';
import QueueRecovery from '@/pages/QueueRecovery';
import Campaigns from '@/pages/Campaigns';
import SupplierDetail from '@/pages/SupplierDetail';
import BuyerDetail from '@/pages/BuyerDetail';
import Reports from '@/pages/Reports';
import Finances from '@/pages/Finances';

import Deliveries from '@/pages/Deliveries';
import ConversionEvents from '@/pages/ConversionEvents';
import Notifications from '@/pages/Notifications';
import Verification from '@/pages/Verification';
import Settings from '@/pages/Settings';
import CustomCalculations from '@/pages/CustomCalculations';
import PayloadTester from '@/pages/PayloadTester';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route element={<PermissionRoute />}>
          <Route path="/" element={<Overview />} />
          <Route path="/leads" element={<LeadsView view="all" />} />
          <Route path="/leads/sold" element={<LeadsView view="sold" />} />
          <Route path="/leads/unsold" element={<LeadsView view="unsold" />} />
          <Route path="/leads/disqualified" element={<LeadsView view="disqualified" />} />
          <Route path="/leads/rejected" element={<LeadsView view="rejected" />} />
          <Route path="/leads/queued" element={<LeadsView view="queued" />} />
          <Route path="/leads/rejections" element={<Navigate to="/leads/rejected" replace />} />
          <Route path="/queue-recovery" element={<QueueRecovery />} />
          <Route path="/errors" element={<Navigate to="/settings?tab=errors" replace />} />
          <Route path="/distribution" element={<DistributionDashboard />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/suppliers/:id" element={<SupplierDetail />} />
          <Route path="/buyers/:id" element={<BuyerDetail />} />
          <Route path="/buyers" element={<Navigate to="/campaigns?tab=buyers" replace />} />
          <Route path="/suppliers" element={<Navigate to="/campaigns?tab=suppliers" replace />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/finances" element={<Finances />} />
          <Route path="/deliveries" element={<Deliveries />} />
          <Route path="/conversion-events" element={<ConversionEvents />} />
          <Route path="/lead-distribution" element={<Navigate to="/campaigns" replace />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/verification" element={<Verification />} />
          <Route path="/calculated-fields" element={<CustomCalculations />} />
          <Route path="/payload-tester" element={<PayloadTester />} />
          <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App