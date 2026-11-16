import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { LandingPage } from "./pages/LandingPage";
import { AppShell } from "./components/AppShell";

const AuthPage = lazy(() => import("./pages/AuthPages").then((pages) => ({ default: pages.AuthPage })));
const ForgotPasswordPage = lazy(() => import("./pages/AuthPages").then((pages) => ({ default: pages.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/AuthPages").then((pages) => ({ default: pages.ResetPasswordPage })));
const VerifyEmailPage = lazy(() => import("./pages/AuthPages").then((pages) => ({ default: pages.VerifyEmailPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((pages) => ({ default: pages.DashboardPage })));
const DocsPage = lazy(() => import("./pages/public/DocsPage").then((pages) => ({ default: pages.DocsPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((pages) => ({ default: pages.ProfilePage })));
const ActiveSessionsPage = lazy(() => import("./pages/settings/ActiveSessionsPage").then((pages) => ({ default: pages.ActiveSessionsPage })));
const SupportPage = lazy(() => import("./pages/SupportPage").then((pages) => ({ default: pages.SupportPage })));
const FilesPage = lazy(() => import("./pages/FilesPage").then((pages) => ({ default: pages.FilesPage })));
const ScannerHomePage = lazy(() => import("./pages/scanner/ScannerHomePage").then((pages) => ({ default: pages.ScannerHomePage })));
const SearchResultsPage = lazy(() => import("./pages/dashboard/SearchResultsPage").then((pages) => ({ default: pages.default })));
const StarredFilesPage = lazy(() => import("./pages/dashboard/StarredFilesPage").then((pages) => ({ default: pages.default })));
const TrashPage = lazy(() => import("./pages/dashboard/TrashPage").then((pages) => ({ default: pages.default })));
const NotificationsPage = lazy(() => import("./pages/dashboard/NotificationsPage").then((pages) => ({ default: pages.default })));
const CheckoutPage = lazy(() => import("./pages/billing/CheckoutPage").then((pages) => ({ default: pages.default })));
const PaymentStatusPage = lazy(() => import("./pages/billing/PaymentStatusPage").then((pages) => ({ default: pages.default })));
const PricingPlansPage = lazy(() => import("./pages/billing/PricingPlansPage").then((pages) => ({ default: pages.default })));
const SubscriptionOverviewPage = lazy(() => import("./pages/billing/SubscriptionOverviewPage").then((pages) => ({ default: pages.default })));
const ApprovalsPage = lazy(() => import("./approvals/ApprovalsPage").then((pages) => ({ default: pages.ApprovalsPage })));
const RemindersPage = lazy(() => import("./reminders/RemindersPage").then((pages) => ({ default: pages.RemindersPage })));
const CalendarPage = lazy(() => import("./calendar/CalendarPage").then((pages) => ({ default: pages.CalendarPage })));
const SmartFilesPage = lazy(() => import("./smart-files/SmartFilesPage").then((pages) => ({ default: pages.SmartFilesPage })));
const SignaturesPage = lazy(() => import("./signatures/SignaturesPage").then((pages) => ({ default: pages.SignaturesPage })));
const AboutPage = lazy(() => import("./pages/public/AboutPage").then((pages) => ({ default: pages.default })));
const AccessibilityPage = lazy(() => import("./pages/public/AccessibilityPage").then((pages) => ({ default: pages.default })));
const ContactPage = lazy(() => import("./pages/public/ContactPage").then((pages) => ({ default: pages.default })));
const FAQPage = lazy(() => import("./pages/public/FAQPage").then((pages) => ({ default: pages.default })));
const FeaturesPage = lazy(() => import("./pages/public/FeaturesPage").then((pages) => ({ default: pages.default })));
const HelpCenterPage = lazy(() => import("./pages/public/HelpCenterPage").then((pages) => ({ default: pages.default })));
const HomePage = lazy(() => import("./pages/public/HomePage").then((pages) => ({ default: pages.default })));
const HowItWorksPage = lazy(() => import("./pages/public/HowItWorksPage").then((pages) => ({ default: pages.default })));
const PricingPage = lazy(() => import("./pages/public/PricingPage").then((pages) => ({ default: pages.default })));
const PrivacyPage = lazy(() => import("./pages/public/PrivacyPage").then((pages) => ({ default: pages.default })));
const SecurityPage = lazy(() => import("./pages/public/SecurityPage").then((pages) => ({ default: pages.default })));
const TermsPage = lazy(() => import("./pages/public/TermsPage").then((pages) => ({ default: pages.default })));
const AcceptWorkspaceInvitationPage = lazy(() => import("./workspaces/WorkspaceAdminPages").then((pages) => ({ default: pages.AcceptWorkspaceInvitationPage })));
const WorkspaceActivityPage = lazy(() => import("./workspaces/WorkspaceAdminPages").then((pages) => ({ default: pages.WorkspaceActivityPage })));
const WorkspaceInvitationsPage = lazy(() => import("./workspaces/WorkspaceAdminPages").then((pages) => ({ default: pages.WorkspaceInvitationsPage })));
const WorkspaceInvitePage = lazy(() => import("./workspaces/WorkspaceAdminPages").then((pages) => ({ default: pages.WorkspaceInvitePage })));
const WorkspaceMemberPage = lazy(() => import("./workspaces/WorkspaceAdminPages").then((pages) => ({ default: pages.WorkspaceMemberPage })));
const WorkspacePermissionsPage = lazy(() => import("./workspaces/WorkspaceAdminPages").then((pages) => ({ default: pages.WorkspacePermissionsPage })));
const WorkspaceRolesPage = lazy(() => import("./workspaces/WorkspaceAdminPages").then((pages) => ({ default: pages.WorkspaceRolesPage })));
const WorkspaceTeamPage = lazy(() => import("./workspaces/WorkspaceAdminPages").then((pages) => ({ default: pages.WorkspaceTeamPage })));
const WorkspaceStoragePage = lazy(() => import("./workspaces/WorkspaceStoragePage").then((pages) => ({ default: pages.WorkspaceStoragePage })));
const WorkspaceChatPage = lazy(() => import("./workspaces/WorkspaceChatPage").then((pages) => ({ default: pages.WorkspaceChatPage })));
const WorkspaceFileDeliveriesPage = lazy(() => import("./workspaces/WorkspaceFileDeliveriesPage").then((pages) => ({ default: pages.WorkspaceFileDeliveriesPage })));
const AdminLoginPage = lazy(() => import("./pages/admin/AdminLoginPage").then((pages) => ({ default: pages.AdminLoginPage })));
const AdminPortal = lazy(() => import("./pages/admin/AdminPortal").then((pages) => ({ default: pages.AdminPortal })));
const SharedFilePreviewPage = lazy(() => import("./pages/sharing/SharedFilePreviewPage").then((pages) => ({ default: pages.default })));
const OfflineAccessPage = lazy(() => import("./offline/OfflineAccessPage").then((pages) => ({ default: pages.default })));
const NotesPage = lazy(() => import("./notes/NotesPage").then((pages) => ({ default: pages.NotesPage })));

const EventsPage = lazy(() => import("./events/EventPages").then((pages) => ({ default: pages.EventsPage })));
const CreateEventPage = lazy(() => import("./events/EventPages").then((pages) => ({ default: pages.CreateEventPage })));
const EventDetailPage = lazy(() => import("./events/EventPages").then((pages) => ({ default: pages.EventDetailPage })));
const CaptureEventPage = lazy(() => import("./events/EventPages").then((pages) => ({ default: pages.CaptureEventPage })));
const EventGalleryPage = lazy(() => import("./events/EventPages").then((pages) => ({ default: pages.EventGalleryPage })));
const FileRequestsPage = lazy(() => import("./file-requests/FileRequestsPage").then((pages) => ({ default: pages.FileRequestsPage })));
const PublicFileRequestPage = lazy(() => import("./file-requests/FileRequestsPage").then((pages) => ({ default: pages.PublicFileRequestPage })));
const DocumentToolsPage = lazy(() => import("./document-tools/DocumentToolsPage").then((pages) => ({ default: pages.DocumentToolsPage })));
const DocumentStudioPage = lazy(() => import("./documents/DocumentStudioPage").then((pages) => ({ default: pages.DocumentStudioPage })));
const PublicDocumentPage = lazy(() => import("./documents/DocumentStudioPage").then((pages) => ({ default: pages.PublicDocumentPage })));

function ProtectedRoutes() {
  const { user, loading, loadError, refresh } = useAuth();
  const location = useLocation();

  if (loading) {
    return <main className="full-state"><span className="loader" />Checking your secure session…</main>;
  }
  if (loadError) {
    if (!navigator.onLine) {
      return (
        <main className="full-state">
          <div className="state-card">
            <span className="eyebrow">Offline mode</span>
            <h1>Your saved documents are still here.</h1>
            <p>Reconnect to refresh your account. Files saved to this device can be opened now.</p>
            <Link className="button button-dark" to="/offline-files">Open offline access</Link>
          </div>
        </main>
      );
    }
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
        <Route path="/documents" element={<DocumentStudioPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/document-tools" element={<DocumentToolsPage />} />
        <Route path="/file-requests" element={<FileRequestsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/smart-files" element={<SmartFilesPage />} />
        <Route path="/favorites" element={<StarredFilesPage />} />
        <Route path="/starred" element={<StarredFilesPage />} />
        <Route path="/trash" element={<TrashPage />} />
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
        <Route path="/settings/sessions" element={<ActiveSessionsPage />} />
        <Route path="/settings/subscription" element={<SubscriptionOverviewPage />} />
        <Route path="/billing/subscription" element={<SubscriptionOverviewPage />} />
        <Route path="/billing/checkout" element={<CheckoutPage />} />
        <Route path="/billing/payment-status" element={<PaymentStatusPage />} />
        <Route path="/billing/plans" element={<PricingPlansPage />} />
        <Route path="/search" element={<SearchResultsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/workspace/approvals" element={<ApprovalsPage />} />
        <Route path="/workspace/signatures" element={<SignaturesPage />} />
        <Route path="/workspace/reminders" element={<RemindersPage />} />
        <Route path="/workspace/calendar" element={<CalendarPage shared />} />
        <Route path="/workspace/file-deliveries" element={<WorkspaceFileDeliveriesPage />} />
        <Route path="/workspace/chat" element={<WorkspaceChatPage />} />
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
  const { sessionExpired, dismissSessionExpired } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <Suspense fallback={<main className="full-state"><span className="loader" />Opening page…</main>}>
        <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/help" element={<HelpCenterPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/accessibility" element={<AccessibilityPage />} />
        <Route path="/offline-files" element={<OfflineAccessPage />} />
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
        <Route path="/share/:token" element={<SharedFilePreviewPage />} />
        <Route path="/respond/:token" element={<PublicDocumentPage />} />
        <Route path="/request/:token" element={<PublicFileRequestPage />} />
        <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </Suspense>
      {sessionExpired && (
        <div className="session-expired-backdrop">
          <section className="session-expired-dialog" role="dialog" aria-modal="true" aria-labelledby="session-expired-title">
            <span className="eyebrow">SECURE SESSION</span>
            <h2 id="session-expired-title">Please log in again</h2>
            <p>Your session has expired. Log in to continue using IMARA.</p>
            <button
              className="button button-dark"
              onClick={() => {
                dismissSessionExpired();
                navigate("/login", { replace: true });
              }}
            >
              Login
            </button>
          </section>
        </div>
      )}
    </>
  );
}
