
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Laptop,
  LockKeyhole,
  Monitor,
  Save,
  ShieldCheck,
  Smartphone,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { useAuth } from "../auth/AuthProvider";
import { apiRequest, type AuthSession, type User } from "../lib/api";

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(120, "Use 120 characters or fewer."),
});

type ProfileValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Enter your current password.")
      .max(128, "Use 128 characters or fewer."),
    newPassword: z
      .string()
      .min(12, "Use at least 12 characters.")
      .max(128, "Use 128 characters or fewer."),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type PasswordValues = z.infer<typeof passwordSchema>;

/* -------------------------------------------------------------------------- */
/* Shared styles                                                              */
/* -------------------------------------------------------------------------- */

const inputClass =
  "mt-2 w-full min-w-0 rounded-xl border border-[#E5EAF0] bg-white px-4 py-3 text-sm text-[#172B3A] outline-none transition placeholder:text-[#A0AAB5] hover:border-[#CBD5E1] focus:border-[#20AD43] focus:ring-4 focus:ring-[#20AD43]/10";

const labelClass = "block text-sm font-semibold text-[#263B4D]";

function formatDate(value: string, includeTime = false) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

/* -------------------------------------------------------------------------- */
/* Main page                                                                  */
/* -------------------------------------------------------------------------- */

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const [profileNotice, setProfileNotice] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name ?? "",
    },
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  async function saveProfile(values: ProfileValues) {
    setProfileNotice("");
    setProfileError("");

    try {
      const response = await apiRequest<User>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(values),
      });

      setUser(response);
      profileForm.reset({ name: response.name });
      setProfileNotice("Your profile has been updated successfully.");
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "We couldn't save your profile. Please try again."
      );
    }
  }

  async function updatePassword(values: PasswordValues) {
    setPasswordError("");

    try {
      await apiRequest("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });

      passwordForm.reset();
      setUser(null);

      navigate("/login", {
        replace: true,
        state: {
          notice:
            "Your password was updated. Please sign in with your new password.",
        },
      });
    } catch (error) {
      setPasswordError(
        error instanceof Error
          ? error.message
          : "We couldn't update your password. Please try again."
      );
    }
  }

  const sections = [
    {
      id: "profile",
      label: "Personal details",
      description: "Your account information",
      icon: UserRound,
    },
    {
      id: "security",
      label: "Security",
      description: "Password and active devices",
      icon: LockKeyhole,
    },
    {
      id: "privacy",
      label: "Privacy",
      description: "Your account protection",
      icon: ShieldCheck,
    },
  ];

  return (
    <main className="min-h-screen min-w-0 bg-[#F7F9FC] px-4 py-6 text-[#172B3A] sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-[1440px] min-w-0">

        {/* Page heading */}
        <header className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#20AD43]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#718096]">
                Account management
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-[#102B46] sm:text-3xl lg:text-[36px]">
              Account settings
            </h1>

            <p className="mt-2 max-w-xl text-sm leading-6 text-[#718096] sm:text-base">
              Manage your personal information, security preferences and
              account access.
            </p>
          </div>

          <div className="flex w-fit items-center gap-2 rounded-full border border-[#DDEFE2] bg-[#F0FAF2] px-3 py-2">
            <ShieldCheck size={16} className="text-[#20AD43]" />
            <span className="text-xs font-semibold text-[#247A3C]">
              Account settings
            </span>
          </div>
        </header>

        {/* Main layout */}
        <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8">

          {/* Sidebar navigation */}
          <aside className="min-w-0 lg:sticky lg:top-6">
            <div className="overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white p-3 shadow-sm">
              <div className="px-3 pb-3 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9AA6B2]">
                  Settings menu
                </p>
              </div>

              <nav
                aria-label="Settings sections"
                className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible"
              >
                {sections.map((section, index) => {
                  const Icon = section.icon;

                  return (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className={`group flex min-w-max items-center gap-3 rounded-xl px-3 py-3 transition lg:min-w-0 ${
                        index === 0
                          ? "bg-[#F0FAF2] text-[#168A35]"
                          : "text-[#64748B] hover:bg-[#F7F9FC] hover:text-[#102B46]"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          index === 0
                            ? "bg-white text-[#20AD43]"
                            : "bg-[#F7F9FC] text-[#718096] group-hover:bg-white"
                        }`}
                      >
                        <Icon size={17} />
                      </span>

                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {section.label}
                        </span>
                        <span className="hidden text-[11px] text-[#94A3B8] lg:block">
                          {section.description}
                        </span>
                      </span>

                      <ArrowRight
                        size={14}
                        className="ml-auto hidden opacity-0 transition group-hover:opacity-100 lg:block"
                      />
                    </a>
                  );
                })}
              </nav>
            </div>

            {/* Account identity */}
            <div className="mt-4 rounded-2xl border border-[#E5EAF0] bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EAF7ED] text-base font-bold text-[#168A35]">
                  {user?.name?.trim()?.charAt(0)?.toUpperCase() || "U"}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#102B46]">
                    {user?.name || "Your account"}
                  </p>
                  <p className="truncate text-xs text-[#94A3B8]">
                    {user?.email || "Account profile"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-[#F0F2F5] pt-3">
                <span
                  className={`h-2 w-2 rounded-full ${
                    user?.emailVerified ? "bg-[#20AD43]" : "bg-amber-400"
                  }`}
                />
                <span className="text-xs font-medium text-[#718096]">
                  {user?.emailVerified
                    ? "Verified account"
                    : "Email not verified"}
                </span>
              </div>
            </div>
          </aside>

          {/* Settings content */}
          <div className="flex min-w-0 flex-col gap-6">

            {/* Personal details */}
            <section
              id="profile"
              className="scroll-mt-6 overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white shadow-sm"
            >
              <div className="flex flex-col gap-3 border-b border-[#F0F2F5] px-5 py-5 sm:flex-row sm:items-center sm:px-7">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF7ED] text-[#20AD43]">
                  <UserRound size={20} />
                </div>

                <div className="min-w-0">
                  <h2 className="text-base font-bold text-[#102B46] sm:text-lg">
                    Personal details
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-[#8A97A6] sm:text-sm">
                    Update the information associated with your IMARA account.
                  </p>
                </div>

                <span className="ml-auto hidden rounded-full bg-[#F7F9FC] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#718096] sm:inline-flex">
                  Profile
                </span>
              </div>

              <form
                onSubmit={profileForm.handleSubmit(saveProfile)}
                noValidate
                className="space-y-6 px-5 py-6 sm:px-7 sm:py-7"
              >
                <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
                  <label className={labelClass}>
                    Full name
                    <input
                      autoComplete="name"
                      placeholder="Enter your full name"
                      className={inputClass}
                      {...profileForm.register("name")}
                    />
                    {profileForm.formState.errors.name && (
                      <span className="mt-2 block text-xs font-medium text-red-600">
                        {profileForm.formState.errors.name.message}
                      </span>
                    )}
                  </label>

                  <label className={labelClass}>
                    Email address
                    <div className="relative">
                      <input
                        type="email"
                        value={user?.email ?? ""}
                        readOnly
                        className={`${inputClass} cursor-not-allowed bg-[#F7F9FC] pr-24 text-[#718096]`}
                      />

                      <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[10px] font-bold text-[#20AD43]">
                        <CheckCircle2 size={13} />
                        {user?.emailVerified ? "Verified" : "Unverified"}
                      </span>
                    </div>

                    <span className="mt-2 block text-xs font-normal text-[#94A3B8]">
                      Your email address is used for account access.
                    </span>
                  </label>
                </div>

                {profileError && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700"
                  >
                    <AlertCircle size={17} className="mt-0.5 shrink-0" />
                    <span>{profileError}</span>
                  </div>
                )}

                {profileNotice && (
                  <div
                    role="status"
                    className="flex items-center gap-3 rounded-xl border border-[#D9EFDF] bg-[#F0FAF2] p-3 text-sm font-medium text-[#168A35]"
                  >
                    <CheckCircle2 size={17} />
                    {profileNotice}
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-[#F0F2F5] pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-[#94A3B8]">
                    Your changes will be saved to your account.
                  </p>

                  <button
                    type="submit"
                    disabled={profileForm.formState.isSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#102B46] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#193D5D] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    <Save size={15} />
                    {profileForm.formState.isSubmitting
                      ? "Saving changes..."
                      : "Save changes"}
                  </button>
                </div>
              </form>
            </section>

            {/* Security */}
            <section
              id="security"
              className="scroll-mt-6 overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white shadow-sm"
            >
              <div className="flex items-center gap-3 border-b border-[#F0F2F5] px-5 py-5 sm:px-7">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0FAF2] text-[#20AD43]">
                  <LockKeyhole size={20} />
                </div>

                <div className="min-w-0">
                  <h2 className="text-base font-bold text-[#102B46] sm:text-lg">
                    Sign-in & security
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-[#8A97A6] sm:text-sm">
                    Manage your password and control access to your account.
                  </p>
                </div>
              </div>

              <form
                onSubmit={passwordForm.handleSubmit(updatePassword)}
                noValidate
                className="space-y-5 px-5 py-6 sm:px-7 sm:py-7"
              >
                <div>
                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-[#263B4D]">
                      Change password
                    </h3>
                    <p className="mt-1 text-xs text-[#94A3B8]">
                      Choose a strong password that you don't use elsewhere.
                    </p>
                  </div>

                  <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
                    <PasswordField
                      label="Current password"
                      name="currentPassword"
                      register={passwordForm.register}
                      error={passwordForm.formState.errors.currentPassword?.message}
                      visible={showCurrentPassword}
                      onToggle={() =>
                        setShowCurrentPassword((value) => !value)
                      }
                      autoComplete="current-password"
                    />

                    <div className="hidden md:block" />

                    <PasswordField
                      label="New password"
                      name="newPassword"
                      register={passwordForm.register}
                      error={passwordForm.formState.errors.newPassword?.message}
                      visible={showNewPassword}
                      onToggle={() => setShowNewPassword((value) => !value)}
                      autoComplete="new-password"
                    />

                    <PasswordField
                      label="Confirm new password"
                      name="confirmPassword"
                      register={passwordForm.register}
                      error={passwordForm.formState.errors.confirmPassword?.message}
                      visible={showConfirmPassword}
                      onToggle={() =>
                        setShowConfirmPassword((value) => !value)
                      }
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-[#E8EEF3] bg-[#F8FAFC] p-4">
                  <ShieldCheck
                    size={18}
                    className="mt-0.5 shrink-0 text-[#20AD43]"
                  />
                  <div>
                    <p className="text-xs font-bold text-[#263B4D]">
                      Password security
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#8291A1]">
                      Use at least 12 characters. A combination of letters,
                      numbers and symbols is recommended.
                    </p>
                  </div>
                </div>

                {passwordError && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700"
                  >
                    <AlertCircle size={17} className="mt-0.5 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-[#F0F2F5] pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-[#94A3B8]">
                    You'll need to sign in again after changing your password.
                  </p>

                  <button
                    type="submit"
                    disabled={passwordForm.formState.isSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#102B46] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#193D5D] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    <LockKeyhole size={15} />
                    {passwordForm.formState.isSubmitting
                      ? "Updating password..."
                      : "Update password"}
                  </button>
                </div>
              </form>

              {/* Sessions */}
              <div className="border-t border-[#E5EAF0] bg-[#FCFDFE] px-5 py-6 sm:px-7 sm:py-7">
                <SessionsPanel />
              </div>
            </section>

            {/* Privacy */}
            <section
              id="privacy"
              className="scroll-mt-6 overflow-hidden rounded-2xl border border-[#DDEFE2] bg-[#F1FAF3] p-5 sm:p-6"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#20AD43] shadow-sm">
                  <ShieldCheck size={21} />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-[#185C2C]">
                      Your privacy matters
                    </h2>
                    <span className="rounded-full bg-[#DDF3E3] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#168A35]">
                      Protected
                    </span>
                  </div>

                  <p className="mt-2 max-w-2xl text-xs leading-6 text-[#63836B] sm:text-sm">
                    IMARA is designed to keep your documents and personal
                    information protected. Your account access is controlled
                    through your sign-in credentials and active sessions.
                  </p>
                </div>
              </div>
            </section>

            <p className="pb-4 text-center text-[11px] text-[#A0AAB5]">
              IMARA · Your Digital World, Securely Kept.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Password field                                                             */
/* -------------------------------------------------------------------------- */

type PasswordFieldProps = {
  label: string;
  name: "currentPassword" | "newPassword" | "confirmPassword";
  register: ReturnType<typeof useForm<PasswordValues>>["register"];
  error?: string;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
};

function PasswordField({
  label,
  name,
  register,
  error,
  visible,
  onToggle,
  autoComplete,
}: PasswordFieldProps) {
  return (
    <label className={labelClass}>
      {label}

      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder="Enter password"
          className={`${inputClass} pr-12`}
          {...register(name)}
        />

        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#94A3B8] transition hover:bg-[#F1F5F9] hover:text-[#102B46]"
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>

      {error && (
        <span className="mt-2 block text-xs font-medium text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Active sessions                                                            */
/* -------------------------------------------------------------------------- */

function SessionsPanel() {
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: () =>
      apiRequest<{ sessions: AuthSession[] }>("/auth/sessions"),
  });

  const revokeSession = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["auth-sessions"],
      });
    },
  });

  return (
    <div className="min-w-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#102B46]">
              Active sessions
            </h3>
            <span className="rounded-full bg-[#EAF7ED] px-2 py-1 text-[10px] font-bold text-[#168A35]">
              {sessionsQuery.data?.sessions.length ?? 0} devices
            </span>
          </div>

          <p className="mt-1 text-xs leading-5 text-[#94A3B8]">
            Review devices currently signed in to your account.
          </p>
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#718096]">
          <Clock3 size={17} />
        </div>
      </div>

      {sessionsQuery.isLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-[#E5EAF0] bg-white px-4 py-8 text-sm text-[#718096]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#20AD43] border-t-transparent" />
          Loading active sessions...
        </div>
      ) : sessionsQuery.isError ? (
        <div className="flex flex-col gap-3 rounded-xl border border-red-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle size={16} />
            <span>
              {sessionsQuery.error instanceof Error
                ? sessionsQuery.error.message
                : "Unable to load active sessions."}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void sessionsQuery.refetch()}
            className="text-left text-xs font-bold text-[#168A35] hover:underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessionsQuery.data?.sessions.map((session) => {
            const userAgent = session.userAgent || "Browser session";
            const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);
            const DeviceIcon = isMobile ? Smartphone : Monitor;

            return (
              <div
                key={session.id}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-[#E8EDF2] bg-white p-4 transition hover:border-[#D5E3D9] sm:flex-row sm:items-center"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    session.current
                      ? "bg-[#EAF7ED] text-[#20AD43]"
                      : "bg-[#F1F5F9] text-[#718096]"
                  }`}
                >
                  <DeviceIcon size={19} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="max-w-full break-words text-sm font-bold text-[#263B4D]">
                      {userAgent}
                    </p>

                    {session.current && (
                      <span className="rounded-full bg-[#EAF7ED] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#168A35]">
                        This device
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-xs leading-5 text-[#94A3B8]">
                    Last active {formatDate(session.lastSeenAt, true)}
                  </p>

                  <p className="text-[11px] text-[#A0AAB5]">
                    Started {formatDate(session.createdAt)}
                  </p>
                </div>

                {session.current ? (
                  <span className="flex w-fit items-center gap-1.5 rounded-lg bg-[#F0FAF2] px-3 py-2 text-xs font-semibold text-[#168A35]">
                    <CheckCircle2 size={14} />
                    Current
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => revokeSession.mutate(session.id)}
                    disabled={revokeSession.isPending}
                    className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-[#F0DCDC] px-3 py-2 text-xs font-semibold text-[#C05252] transition hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    <X size={14} />
                    {revokeSession.isPending &&
                    revokeSession.variables === session.id
                      ? "Revoking..."
                      : "Revoke"}
                  </button>
                )}
              </div>
            );
          })}

          {sessionsQuery.data?.sessions.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#DCE3EA] bg-white px-4 py-10 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#F1F5F9] text-[#94A3B8]">
                <Laptop size={20} />
              </div>
              <p className="text-sm font-semibold text-[#263B4D]">
                No active sessions found
              </p>
              <p className="mt-1 text-xs text-[#94A3B8]">
                Your active devices will appear here.
              </p>
            </div>
          )}
        </div>
      )}

      {revokeSession.isError && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700"
        >
          {revokeSession.error instanceof Error
            ? revokeSession.error.message
            : "Unable to revoke this session."}
        </div>
      )}

      {revokeSession.isSuccess && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl border border-[#D9EFDF] bg-[#F0FAF2] p-3 text-xs font-medium text-[#168A35]"
        >
          <Check size={15} />
          Session revoked successfully.
        </div>
      )}
    </div>
  );
}
