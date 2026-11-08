import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { AuthPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./pages/AuthPages";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SupportPage } from "./pages/SupportPage";
import { FilesPage } from "./pages/FilesPage";
import { ScannerHomePage } from "./pages/scanner/ScannerHomePage";
import { SearchResultsPage } from "./pages/dashboard";
import NotificationsPage from "./pages/dashboard/NotificationsPage";
import { CheckoutPage, PaymentStatusPage, PricingPlansPage, SubscriptionOverviewPage } from "./pages/billing";
import { AppShell } from "./components/AppShell";
import {
  AboutPage,
  AccessibilityPage,
  ContactPage,
  FAQPage,
  FeaturesPage,
  HelpCenterPage,
  HomePage,
  HowItWorksPage,
  PricingPage,
  PrivacyPage,
  SecurityPage,
  TermsPage,
} from "./pages/public";
import {
  AcceptWorkspaceInvitationPage,
  WorkspaceActivityPage,
  WorkspaceInvitationsPage,
  WorkspaceInvitePage,
  WorkspaceMemberPage,
  WorkspacePermissionsPage,
  WorkspaceRolesPage,
  WorkspaceTeamPage,
} from "./workspaces/WorkspaceAdminPages";
import { WorkspaceStoragePage } from "./workspaces/WorkspaceStoragePage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminPortal } from "./pages/admin/AdminPortal";

const EventsPage = lazy(() => import("./events/EventPages").then((pages) => ({ default: pages.EventsPage })));
const CreateEventPage = lazy(() => import("./events/EventPages").then((pages) => ({ default: pages.CreateEventPage })));
const EventDetailPage = lazy(() => import("./events/EventPages").then((pages) => ({ default: pages.EventDetailPage })));
const CaptureEventPage = lazy(() => import("./events/EventPages").then((pages) => ({ default: pages.CaptureEventPage })));
const EventGalleryPage = lazy(() => import("./events/EventPages").then((pages) => ({ default: pages.EventGalleryPage })));

function ProtectedRoutes() {
  const { user, loading, loadError, refresh } = useAuth();
  const location = useLocation();

  if (loading) {
    return <main className="full-state"><span className="loader" />Checking your secure session…</main>;
  }
  if (loadError) {
    return (
      <main className="full-state">
        <div className="state-card">
          <span className="eyebrow">Connection interrupted</span>
          <h1>We couldn’t reach your account.</h1>
          <p>{loadError}</p>
          <button className="button button-dark" onClick={() => void refresh().catch(() => undefined)}>Try again</button>
        </div>
      </main>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/storage" element={<DashboardPage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/scanner" element={<ScannerHomePage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/new" element={<CreateEventPage />} />
        <Route path="/events/:eventId" element={<EventDetailPage />} />
        <Route path="/my-files" element={<FilesPage />} />
        <Route path="/all-files" element={<FilesPage />} />
        <Route path="/folders" element={<FilesPage />} />
        <Route path="/folders/:folderId" element={<FolderRoute />} />
        <Route path="/settings/profile" element={<ProfilePage />} />
        <Route path="/settings/account" element={<ProfilePage />} />
        <Route path="/settings/security" element={<ProfilePage />} />
        <Route path="/settings/sessions" element={<ProfilePage />} />
        <Route path="/settings/subscription" element={<SubscriptionOverviewPage />} />
        <Route path="/billing/subscription" element={<SubscriptionOverviewPage />} />
        <Route path="/billing/checkout" element={<CheckoutPage />} />
        <Route path="/billing/payment-status" element={<PaymentStatusPage />} />
        <Route path="/billing/plans" element={<PricingPlansPage />} />
        <Route path="/search" element={<SearchResultsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/workspace" element={<WorkspaceStoragePage />} />
        <Route path="/workspace/shared-folders" element={<WorkspaceStoragePage />} />
        <Route path="/workspace/team" element={<WorkspaceTeamPage />} />
        <Route path="/workspace/members" element={<WorkspaceTeamPage />} />
        <Route path="/workspace/team/invite" element={<WorkspaceInvitePage />} />
        <Route path="/workspace/invite" element={<WorkspaceInvitePage />} />
        <Route path="/workspace/team/:memberId/permissions" element={<WorkspacePermissionsPage />} />
        <Route path="/workspace/team/:memberId" element={<WorkspaceMemberPage />} />
        <Route path="/workspace/invitations" element={<WorkspaceInvitationsPage />} />
        <Route path="/workspace/activity" element={<WorkspaceActivityPage />} />
        <Route path="/workspace/roles" element={<WorkspaceRolesPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

function FolderRoute() {
  const { folderId } = useParams();
  return <Navigate to={`/files?folder=${encodeURIComponent(folderId ?? "")}`} replace />;
}

export function App() {
  return (
    <Suspense fallback={<main className="full-state"><span className="loader" />Opening page…</main>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/help" element={<HelpCenterPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/accessibility" element={<AccessibilityPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/*" element={<AdminPortal />} />
        <Route path="/login" element={<AuthPage key="login" mode="login" />} />
        <Route path="/register" element={<AuthPage key="register" mode="register" />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/workspace/invitations/accept" element={<AcceptWorkspaceInvitationPage />} />
        <Route path="/capture/:token" element={<CaptureEventPage />} />
        <Route path="/gallery/:token" element={<EventGalleryPage />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </Suspense>
  );
}
