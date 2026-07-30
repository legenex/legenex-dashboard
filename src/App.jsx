import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useParams, useSearchParams } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import PermissionRoute from '@/components/PermissionRoute';
import ScrollToTop from './components/ScrollToTop';
import { hostScope, isAllowedOnProgressHost } from '@/lib/hostScope';
import { OperatorRoutes, DocsRoutes, ProgressRoutes } from './AppRoutes';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

import ApiStatus from '@/pages/ApiStatus';
import Apply from '@/pages/Apply';
import DocsLayout from '@/components/docs/DocsLayout';
import { DOCS_ROUTES } from '@/components/docs/docsConfig';
import AppLayout from '@/components/layout/AppLayout';
import DistributionLayout from '@/components/distribution/DistributionLayout';
import LeadsLayout from '@/components/leads/LeadsLayout';
import FinancesLayout from '@/components/finances/FinancesLayout';
import OperationsLayout from '@/components/operations/OperationsLayout';
import AdManagerLayout from '@/components/admanager/AdManagerLayout';
import ToolsLayout from '@/components/tools/ToolsLayout';
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
import RouteSimulator from '@/pages/RouteSimulator';
import RouteGroups from '@/pages/RouteGroups';
import Notifications from '@/pages/Notifications';
import Verification from '@/pages/Verification';
import Settings from '@/pages/Settings';
import CustomCalculations from '@/pages/CustomCalculations';
import OperationsBuyers from '@/pages/operations/OperationsBuyers';
import OperationsSuppliers from '@/pages/operations/OperationsSuppliers';
import OperationsActiveStates from '@/pages/operations/OperationsActiveStates';
import OperationsVerticals from '@/pages/operations/OperationsVerticals';
import OperationsBillingReports from '@/pages/operations/OperationsBillingReports';
import OperationsBuyerOnboarding from '@/pages/operations/OperationsBuyerOnboarding';
import OperationsDashboard from '@/pages/operations/OperationsDashboard';
import AdPerformanceDashboard from '@/pages/admanager/AdPerformanceDashboard';
import AdReports from '@/pages/admanager/AdReports';
import CreativeAnalyzer from '@/pages/admanager/CreativeAnalyzer';
import AdBuilder from '@/pages/admanager/AdBuilder';
import PayloadTester from '@/pages/PayloadTester';
import ToolsDashboard from '@/pages/ToolsDashboard';

import ProgressLayout from '@/components/progress/ProgressLayout';
import CommandCenter from '@/pages/progress/CommandCenter';
import ApplicationReview from '@/pages/progress/ApplicationReview';
import Migration from '@/pages/progress/Migration';
import Gates from '@/pages/progress/Gates';
import Findings from '@/pages/progress/Findings';
import ChangeRequests from '@/pages/progress/ChangeRequests';
import PromptStudio from '@/pages/progress/PromptStudio';
import BuildActivity from '@/pages/progress/BuildActivity';
import ProgressSettings from '@/pages/progress/ProgressSettings';

import PortalLayout from '@/components/portal/PortalLayout';
import PortalDashboard from '@/pages/portal/PortalDashboard';
import PortalLeads from '@/pages/portal/PortalLeads';
import PortalReports from '@/pages/portal/PortalReports';
import PortalReturns from '@/pages/portal/PortalReturns';
import PortalSettings from '@/pages/portal/PortalSettings';

import SupplierPortalLayout from '@/components/supplierportal/SupplierPortalLayout';
import SupplierPortalDashboard from '@/pages/supplierportal/SupplierPortalDashboard';
import SupplierPortalLeads from '@/pages/supplierportal/SupplierPortalLeads';
import SupplierPortalReports from '@/pages/supplierportal/SupplierPortalReports';
import SupplierPortalReturns from '@/pages/supplierportal/SupplierPortalReturns';
import SupplierPortalApi from '@/pages/supplierportal/SupplierPortalApi';
import SupplierPortalSettings from '@/pages/supplierportal/SupplierPortalSettings';

// The standalone /suppliers/:id page predates Operations owning suppliers, so
// its tabs duplicated (and drifted from) the Operations ones. Operations now
// deep-links via ?supplier=<id>&tab=<tab>, so old links land on the maintained
// surface with the tab they asked for. ?legacy=1 still reaches the old page if
// something turns out to depend on it.

// Host predicates live in src/lib/hostScope.js so they can be unit tested. Host
// scoping is a security boundary, not a convenience.
const currentHost = () => (typeof window !== 'undefined' ? window.location.hostname : '');
const isDocsHost = () => hostScope(currentHost()) === 'docs';

// api.legenex.com exists only to serve backend functions, so the frontend just
// shows a status page and never gates on auth or redirects to login.
const isApiHost = () => hostScope(currentHost()) === 'api';

// progress.dashboard.legenex.com serves ONLY the authenticated Progress Control
// Center. The operator dashboard, the portals, the docs and the public
// application form are all unreachable there, enforced by the path allowlist
// below rather than by which links happen to exist.
const isProgressHost = () => hostScope(currentHost()) === 'progress';

// The progress route table, reused on both the progress subdomain (as the whole
// app) and under /progress on the main dashboard.


const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // API host: never gate on auth. Every path renders the API status page.
  if (isApiHost()) {
    return (
      <Routes>
        <Route path="*" element={<ApiStatus />} />
      </Routes>
    );
  }

  // Docs subdomain: never gate on auth, never redirect to login. Route the
  // root and every path into the docs so anonymous visitors can read them.
  if (isDocsHost()) {
    return (
      <Routes>
        <Route path="/" element={<Navigate to="/docs" replace />} />
        {DocsRoutes()}
        <Route path="*" element={<Navigate to="/docs" replace />} />
      </Routes>
    );
  }

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  // Progress subdomain: authenticated, and the ONLY thing it serves. The
  // operator dashboard is never reachable here, so an unauthenticated visitor
  // goes to login and every other path lands back on the Command Center rather
  // than falling through to the operator app.
  if (isProgressHost()) {
    // Hard guard before any route matching. If a path is not on the allowlist,
    // redirect immediately rather than letting the route table decide, so adding
    // a route later cannot accidentally expose it on this domain.
    const path = typeof window !== 'undefined' ? window.location.pathname : '/progress';
    if (!isAllowedOnProgressHost(path)) {
      return <Navigate to="/progress" replace />;
    }
    if (authError) {
      if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
      if (authError.type === 'auth_required') { navigateToLogin(); return null; }
    }
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route element={<PermissionRoute />}>
            {ProgressRoutes()}
          </Route>
        </Route>
        {/* Anything not on the allowlist goes back to the Command Center. This is
            what locks the subdomain: typing an operator route into the address
            bar on this host cannot render it. */}
        <Route path="*" element={<Navigate to="/progress" replace />} />
      </Routes>
    );
  }

  // /docs and /apply are public on the main host too, render them without redirecting to login.
  const onDocsPath = typeof window !== 'undefined' &&
    (window.location.pathname.startsWith('/docs') || window.location.pathname.startsWith('/apply'));
  // The app's own auth pages must render normally, never bounce them to the
  // hosted login, or an unauthenticated visitor on /login loops forever.
  const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];
  const onAuthPath = typeof window !== 'undefined' && AUTH_PATHS.some((p) => window.location.pathname.startsWith(p));

  if (authError && !onDocsPath && !onAuthPath) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      {/* Single source of truth, shared with the screenshot capturer. */}
      {OperatorRoutes()}
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