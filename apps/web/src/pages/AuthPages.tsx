
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UserRound,
  Building2,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { z } from "zod";

import { useAuth } from "../auth/AuthProvider";
import { ApiError, apiRequest, type User } from "../lib/api";
import { workspaceHref } from "../workspaces/types";

type AuthMode = "login" | "register";

type AuthValues = {
  firstName?: string;
  lastName?: string;
  email: string;
  password: string;
};

const authSchema = z.object({
  firstName: z
    .string()
    .trim()
    .max(60, "Use 60 characters or fewer.")
    .optional()
    .or(z.literal("")),
  lastName: z
    .string()
    .trim()
    .max(60, "Use 60 characters or fewer.")
    .optional()
    .or(z.literal("")),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(128, "Use 128 characters or fewer."),
});

const signupPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{6,}$/;

const emailSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

type EmailValues = z.infer<typeof emailSchema>;

const resetSchema = z
  .object({
    password: z
      .string()
      .min(12, "Use at least 12 characters.")
      .max(128, "Use 128 characters or fewer."),
    confirmPassword: z.string(),
  })
  .refine(
    (values) => values.password === values.confirmPassword,
    {
      message: "Passwords do not match.",
      path: ["confirmPassword"],
    },
  );

type ResetValues = z.infer<typeof resetSchema>;

/* -------------------------------------------------------
   DESIGN SYSTEM
------------------------------------------------------- */

const inputClass =
  "h-[50px] w-full rounded-lg border border-[#E5EAF0] bg-white px-4 text-sm text-[#172B3A] outline-none transition placeholder:text-[#A0AEC0] hover:border-[#CBD5E0] focus:border-[#20AD43] focus:ring-[3px] focus:ring-[#20AD43]/10";

const primaryButtonClass =
  "inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-lg bg-[#20AD43] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#199438] focus:outline-none focus:ring-4 focus:ring-[#20AD43]/20 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryLinkClass =
  "text-sm font-semibold text-[#20AD43] transition hover:text-[#168B36]";

/* -------------------------------------------------------
   REUSABLE AUTHENTICATION LAYOUT
------------------------------------------------------- */

function Brand() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-2 text-[24px] font-bold tracking-[-1.3px] text-[#102B46]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#20AD43] text-xl font-bold text-white">
        i
      </span>
      IMARA<span className="-ml-2 text-[#20AD43]">.</span>
    </Link>
  );
}

function PublicFrame({
  children,
  eyebrow = "Your digital world, securely kept.",
}: {
  children: ReactNode;
  eyebrow?: string;
}) {
  return (
    <main className="min-h-screen bg-[#F7F9FC]">
      <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">

        {/* LEFT BRAND PANEL */}
        <aside className="relative hidden overflow-hidden bg-[#102B46] px-12 py-12 lg:flex lg:flex-col lg:justify-between xl:px-16">

          <div className="relative z-10">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-[26px] font-bold tracking-[-1.5px] text-white"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#20AD43] text-xl text-white">
                i
              </span>
              IMARA<span className="-ml-2 text-[#20AD43]">.</span>
            </Link>
          </div>

          <div className="relative z-10 max-w-[490px] py-16">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-white/75">
              <ShieldCheck size={15} className="text-[#57D477]" />
              DOCUMENTS · TEAM FOLDERS · EVENT GALLERIES
            </div>

            <h1 className="text-4xl font-bold leading-[1.15] tracking-[-1.8px] text-white xl:text-[52px]">
              Organise the work.
              <span className="mt-2 block text-[#57D477]">
                Collect the moments.
              </span>
            </h1>

            <p className="mt-6 max-w-[390px] text-base leading-8 text-white/65">
              Upload documents to your Digital Drive, invite teammates into business folders, or collect event photos and videos with a QR gallery.
            </p>

            <div className="mt-12 space-y-5">
              <div className="flex items-center gap-3 text-sm text-white/85">
                <CheckCircle2 size={18} className="text-[#57D477]" />
                5GB free storage
              </div>

              <div className="flex items-center gap-3 text-sm text-white/85">
                <CheckCircle2 size={18} className="text-[#57D477]" />
                Invite business teammates to shared folders
              </div>

              <div className="flex items-center gap-3 text-sm text-white/85">
                <CheckCircle2 size={18} className="text-[#57D477]" />
                Event QR galleries for guest photos and videos
              </div>
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6">
            <span className="flex items-center gap-2 text-xs text-white/60">
              <LockKeyhole size={14} />
              Private by design
            </span>

            <span className="text-xs text-white/40">
              © {new Date().getFullYear()} IMARA
            </span>
          </div>

          {/* Subtle decorative background */}
          <div className="pointer-events-none absolute -right-40 top-1/4 h-[430px] w-[430px] rounded-full border border-white/[0.06]" />
          <div className="pointer-events-none absolute -right-20 top-[32%] h-[300px] w-[300px] rounded-full border border-white/[0.06]" />
          <div className="pointer-events-none absolute -bottom-32 -left-32 h-[350px] w-[350px] rounded-full bg-[#20AD43]/10 blur-3xl" />
        </aside>

        {/* RIGHT FORM AREA */}
        <section className="flex min-h-screen flex-col bg-white">

          {/* MOBILE HEADER */}
          <header className="flex items-center justify-between border-b border-[#E5EAF0] px-5 py-5 lg:hidden">
            <Brand />

            <Link
              to="/"
              className="text-xs font-semibold text-[#718096] hover:text-[#102B46]"
            >
              Home
            </Link>
          </header>

          {/* FORM CONTENT */}
          <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-10 lg:px-12 xl:px-20">
            <div className="w-full max-w-[440px]">

              <div className="mb-9 hidden lg:block">
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[1.5px] text-[#20AD43]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#20AD43]" />
                  {eyebrow}
                </span>
              </div>

              <div className="mb-8 lg:hidden">
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[1px] text-[#20AD43]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#20AD43]" />
                  {eyebrow}
                </span>
              </div>

              {children}

            </div>
          </div>

          {/* FOOTER */}
          <footer className="flex flex-col items-center justify-between gap-3 border-t border-[#E5EAF0] px-5 py-5 text-xs text-[#A0AEC0] sm:flex-row sm:px-10 lg:px-12 xl:px-20">
            <span>
              © {new Date().getFullYear()} IMARA
            </span>

            <div className="flex items-center gap-5">
              <Link to="/" className="transition hover:text-[#102B46]">
                Home
              </Link>

              <Link to="/privacy" className="transition hover:text-[#102B46]">
                Privacy
              </Link>

              <Link to="/terms" className="transition hover:text-[#102B46]">
                Terms
              </Link>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}

/* -------------------------------------------------------
   REUSABLE FORM ELEMENTS
------------------------------------------------------- */

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <label className="block text-[13px] font-semibold text-[#102B46]">
        {label}
      </label>

      {children}

      {error && (
        <p className="text-xs font-medium text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function FormHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8">
      <h2 className="text-[30px] font-bold leading-tight tracking-[-1.2px] text-[#102B46] sm:text-[34px]">
        {title}
      </h2>

      <p className="mt-3 text-sm leading-6 text-[#718096]">
        {description}
      </p>
    </div>
  );
}

function FormAlert({
  children,
  success = false,
}: {
  children: ReactNode;
  success?: boolean;
}) {
  return (
    <div
      role={success ? "status" : "alert"}
      className={`rounded-lg border px-4 py-3 text-sm ${
        success
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-red-200 bg-red-50 text-red-600"
      }`}
    >
      {children}
    </div>
  );
}

function SuccessIcon() {
  return (
    <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF8EE] text-[#20AD43]">
      <CheckCircle2 size={28} />
    </div>
  );
}

/* -------------------------------------------------------
   AUTHENTICATION PAGE
------------------------------------------------------- */

export function AuthPage({ mode }: { mode: AuthMode }) {
  const { user, setUser } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const inviteToken = searchParams.get("invite");

  const invitationReturnTo = inviteToken
    ? `/workspace/invitations/accept?token=${encodeURIComponent(inviteToken)}`
    : "";

  const locationState = location.state;
  const returnTo =
    typeof locationState === "object" &&
    locationState !== null &&
    "from" in locationState &&
    typeof locationState.from === "string" &&
    locationState.from.startsWith("/") &&
    !locationState.from.startsWith("//")
      ? locationState.from
      : "";

  const notice =
    typeof locationState === "object" &&
    locationState !== null &&
    "notice" in locationState &&
    typeof locationState.notice === "string"
      ? locationState.notice
      : "";

  const [formError, setFormError] = useState("");
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [verificationError, setVerificationError] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [accountType, setAccountType] = useState<"PERSONAL" | "BUSINESS">("PERSONAL");
  const [workspaceName, setWorkspaceName] = useState("");

  const formSchema = authSchema.superRefine((values, context) => {
    if (mode === "register" && values.password.length > 0 && !signupPasswordPattern.test(values.password)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Use at least 6 characters, including uppercase and lowercase letters, a number, and a special character.",
      });
    }

    if (mode === "register" && !values.firstName?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["firstName"],
        message: "Enter your first name.",
      });
    }

    if (mode === "register" && !values.lastName?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lastName"],
        message: "Enter your last name.",
      });
    }

    if (
      mode === "register" &&
      `${values.firstName ?? ""} ${values.lastName ?? ""}`.trim().length > 120
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lastName"],
        message: "Your full name must be 120 characters or fewer.",
      });
    }
  });

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<AuthValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
    },
  });

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(values: AuthValues) {
    setFormError("");
    setVerificationNeeded(false);
    setVerificationMessage("");

    try {
      if (mode === "register") {
        const registration = await apiRequest<{ emailVerified: boolean }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: `${values.firstName?.trim()} ${values.lastName?.trim()}`,
            email: values.email,
            password: values.password,
            accountType: inviteToken ? "PERSONAL" : accountType,
            ...(accountType === "BUSINESS" && !inviteToken && workspaceName.trim()
              ? { workspaceName: workspaceName.trim() }
              : {}),
          }),
        });

        if (invitationReturnTo) {
          window.sessionStorage.setItem(
            "imara.invitationReturnTo",
            invitationReturnTo,
          );
        }
        if (returnTo) {
          window.sessionStorage.setItem("imara.postVerificationReturnTo", returnTo);
        }

        if (registration.emailVerified) {
          navigate("/login", {
            replace: true,
            state: {
              notice: "Your account is ready. Sign in to continue.",
              ...((invitationReturnTo || returnTo)
                ? { from: invitationReturnTo || returnTo }
                : {}),
            },
          });
        } else {
          navigate(`/verify-email?email=${encodeURIComponent(values.email.trim())}`, {
            replace: true,
            state: invitationReturnTo || returnTo
              ? { from: invitationReturnTo || returnTo }
              : undefined,
          });
        }
        return;
      }

      const loginResult = await apiRequest<{ user: User; workspaceId: string | null }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: values.email,
          password: values.password,
        }),
      });
      setUser(loginResult.user);

      const state = location.state;

      const destination =
        typeof state === "object" &&
        state !== null &&
        "from" in state &&
        typeof state.from === "string" &&
        state.from.startsWith("/") &&
        !state.from.startsWith("//")
          ? state.from
          : loginResult.workspaceId
            ? workspaceHref("/workspace", loginResult.workspaceId)
            : "/dashboard";

      navigate(destination, { replace: true });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "We couldn't complete that request.",
      );

      setVerificationNeeded(
        mode === "login" &&
          error instanceof ApiError &&
          error.status === 403 &&
          error.message.toLowerCase().includes("verify"),
      );
    }
  }

  async function resendVerification() {
    setVerificationMessage("");
    setVerificationError(false);
    setResendingVerification(true);

    try {
      await apiRequest("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({
          email: getValues("email"),
        }),
      });

      setVerificationMessage(
        "If that account needs verification, an email will be sent.",
      );
    } catch (error) {
      setVerificationMessage(
        error instanceof Error
          ? error.message
          : "We couldn't resend the verification email.",
      );

      setVerificationError(true);
    } finally {
      setResendingVerification(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <PublicFrame eyebrow={isLogin ? "Welcome back" : "Create your account"}>
      <FormHeading
        title={isLogin ? "Welcome back." : "Create your space."}
        description={
          isLogin
            ? "Enter your details to access your files."
            : "Start organising your digital world with IMARA."
        }
      />

      {notice && isLogin && (
        <div className="mb-5">
          <FormAlert success>{notice}</FormAlert>
        </div>
      )}

      <form
        className="space-y-5"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >

        {/* NAME FIELDS */}
        {!isLogin && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="First name"
              error={errors.firstName?.message}
            >
              <input
                className={inputClass}
                autoComplete="given-name"
                placeholder="First name"
                {...register("firstName")}
              />
            </Field>

            <Field
              label="Last name"
              error={errors.lastName?.message}
            >
              <input
                className={inputClass}
                autoComplete="family-name"
                placeholder="Last name"
                {...register("lastName")}
              />
            </Field>
          </div>
        )}

        {/* ACCOUNT TYPE */}
        {!isLogin && !inviteToken && (
          <div className="space-y-3">
            <span className="block text-[13px] font-semibold text-[#102B46]">
              Account type
            </span>

            <div className="grid grid-cols-2 gap-3">

              <button
                type="button"
                onClick={() => setAccountType("PERSONAL")}
                aria-pressed={accountType === "PERSONAL"}
                className={`rounded-xl border p-4 text-left transition ${
                  accountType === "PERSONAL"
                    ? "border-[#20AD43] bg-[#F2FBF4] ring-1 ring-[#20AD43]"
                    : "border-[#E5EAF0] bg-white hover:border-[#CBD5E0]"
                }`}
              >
                <UserRound
                  size={20}
                  className={
                    accountType === "PERSONAL"
                      ? "text-[#20AD43]"
                      : "text-[#718096]"
                  }
                />

                <span className="mt-3 block text-sm font-semibold text-[#102B46]">
                  Personal
                </span>

                <span className="mt-1 block text-[11px] leading-5 text-[#718096]">
                  Your private files
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAccountType("BUSINESS")}
                aria-pressed={accountType === "BUSINESS"}
                className={`rounded-xl border p-4 text-left transition ${
                  accountType === "BUSINESS"
                    ? "border-[#20AD43] bg-[#F2FBF4] ring-1 ring-[#20AD43]"
                    : "border-[#E5EAF0] bg-white hover:border-[#CBD5E0]"
                }`}
              >
                <Building2
                  size={20}
                  className={
                    accountType === "BUSINESS"
                      ? "text-[#20AD43]"
                      : "text-[#718096]"
                  }
                />

                <span className="mt-3 block text-sm font-semibold text-[#102B46]">
                  Business
                </span>

                <span className="mt-1 block text-[11px] leading-5 text-[#718096]">
                  Your team workspace
                </span>
              </button>
            </div>

            {accountType === "BUSINESS" && (
              <Field label="Business workspace name">
                <input
                  className={inputClass}
                  value={workspaceName}
                  maxLength={160}
                  onChange={(event) =>
                    setWorkspaceName(event.target.value)
                  }
                  placeholder="Business name"
                />
              </Field>
            )}
          </div>
        )}

        {/* EMAIL */}
        <Field
          label="Email address"
          error={errors.email?.message}
        >
          <input
            className={inputClass}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register("email")}
          />
        </Field>

        {/* PASSWORD */}
        <Field
          label="Password"
          error={errors.password?.message}
        >
          <div className="relative">
            <input
              className={`${inputClass} pr-12`}
              type={showPassword ? "text" : "password"}
              autoComplete={
                isLogin ? "current-password" : "new-password"
              }
              placeholder={
                isLogin ? "Enter your password" : "At least 6 characters"
              }
              {...register("password")}
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#718096] transition hover:bg-[#F7F9FC] hover:text-[#102B46]"
            >
              {showPassword ? (
                <EyeOff size={18} />
              ) : (
                <Eye size={18} />
              )}
            </button>
          </div>
          {!isLogin && (
            <p className="mt-2 text-xs leading-5 text-[#718096]">
              Use at least 6 characters, with uppercase and lowercase letters, a number, and a special character.
            </p>
          )}
        </Field>

        {/* FORGOT PASSWORD */}
        {isLogin && (
          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className={secondaryLinkClass}
            >
              Forgot password?
            </Link>
          </div>
        )}

        {/* ERRORS */}
        {formError && (
          <FormAlert>{formError}</FormAlert>
        )}

        {verificationNeeded && (
          <button
            type="button"
            onClick={() => void resendVerification()}
            disabled={resendingVerification}
            className="text-sm font-semibold text-[#20AD43] hover:text-[#168B36] disabled:opacity-50"
          >
            {resendingVerification
              ? "Sending verification email..."
              : "Resend verification email"}
          </button>
        )}

        {verificationMessage && (
          <FormAlert success={!verificationError}>
            {verificationMessage}
          </FormAlert>
        )}
        {verificationMessage && !verificationError && (
          <Link
            to={`/verify-email?email=${encodeURIComponent(getValues("email"))}`}
            className={secondaryLinkClass}
          >
            Enter verification code
          </Link>
        )}

        {/* SUBMIT */}
        <button
          className={primaryButtonClass}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Please wait..."
            : isLogin
              ? "Log in"
              : "Create account"}

          {!isSubmitting && <ArrowRight size={17} />}
        </button>

      </form>

      {/* SWITCH AUTH MODE */}
      <div className="mt-8 border-t border-[#E5EAF0] pt-6 text-center">
        <p className="text-sm text-[#718096]">
          {isLogin
            ? "Don't have an account?"
            : "Already have an account?"}

          {" "}

          <Link
            to={isLogin ? "/register" : "/login"}
            state={returnTo ? { from: returnTo } : undefined}
            className={secondaryLinkClass}
          >
            {isLogin ? "Create account" : "Log in"}
          </Link>
        </p>
      </div>

      {!isLogin && (
        <div className="mt-5 flex items-center justify-center gap-2 text-center text-[11px] text-[#A0AEC0]">
          <LockKeyhole size={13} />
          Your account details are protected.
        </div>
      )}
    </PublicFrame>
  );
}

/* -------------------------------------------------------
   FORGOT PASSWORD
------------------------------------------------------- */

export function ForgotPasswordPage() {
  const [formError, setFormError] = useState("");
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
  });

  async function onSubmit({ email }: EmailValues) {
    setFormError("");

    try {
      await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      navigate(`/reset-password?email=${encodeURIComponent(email.trim())}`);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "We couldn't send that request.",
      );
    }
  }

  return (
    <PublicFrame eyebrow="Account recovery">
      <>
          <Link
            to="/login"
            className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-[#718096] transition hover:text-[#20AD43]"
          >
            <ArrowLeft size={15} />
            Back to login
          </Link>

          <FormHeading
            title="Forgot your password?"
            description="Enter your email address and we'll send you a six-digit reset code."
          />

          <form
            className="space-y-5"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <Field
              label="Email address"
              error={errors.email?.message}
            >
              <input
                className={inputClass}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register("email")}
              />
            </Field>

            {formError && (
              <FormAlert>{formError}</FormAlert>
            )}

            <button
              className={primaryButtonClass}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Send reset code"}
              {!isSubmitting && <ArrowRight size={17} />}
            </button>
          </form>
      </>
    </PublicFrame>
  );
}

/* -------------------------------------------------------
   RESET PASSWORD
------------------------------------------------------- */

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [resending, setResending] = useState(false);

  const [complete, setComplete] = useState(false);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
  });

  async function onSubmit({ password }: ResetValues) {
    if (!token && (!email.trim() || code.length !== 6)) {
      setFormError(
        "Enter the email address and six-digit reset code to continue.",
      );
      return;
    }

    setFormError("");

    try {
      await apiRequest(token ? "/auth/reset-password" : "/auth/reset-password-code", {
        method: "POST",
        body: JSON.stringify({
          ...(token ? { token } : { email: email.trim(), code }),
          password,
        }),
      });

      setComplete(true);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "We couldn't reset your password.",
      );
    }
  }

  async function resendCode() {
    setFormError("");
    setResendMessage("");
    setResending(true);
    try {
      await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setResendMessage("If an account exists for that address, a new reset code will be sent.");
    } catch (error) {
      setResendMessage(error instanceof Error ? error.message : "We couldn't send a reset code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <PublicFrame eyebrow="Password recovery">
      {complete ? (
        <>
          <SuccessIcon />

          <FormHeading
            title="Password updated."
            description="Your password has been changed successfully. You can now sign in with your new details."
          />

          <Link className={primaryButtonClass} to="/login">
            Continue to log in
            <ArrowRight size={17} />
          </Link>
        </>
      ) : (
        <>
          <FormHeading
            title="Create a new password."
            description={token
              ? "Choose a strong password you haven't used before."
              : "Enter the reset code from your email and choose a new password. The code expires after a short time."}
          />

          <form
            className="space-y-5"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            {!token && (
              <>
                <Field label="Email address">
                  <input
                    className={inputClass}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Six-digit reset code">
                  <input
                    className={`${inputClass} text-center text-xl font-semibold tracking-[0.35em]`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    aria-label="Six-digit password reset code"
                    required
                  />
                </Field>
              </>
            )}
            <Field
              label="New password"
              error={errors.password?.message}
            >
              <div className="relative">
                <input
                  className={`${inputClass} pr-12`}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 12 characters"
                  {...register("password")}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#718096] hover:bg-[#F7F9FC]"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>

            <Field
              label="Confirm password"
              error={errors.confirmPassword?.message}
            >
              <div className="relative">
                <input
                  className={`${inputClass} pr-12`}
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Enter password again"
                  {...register("confirmPassword")}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmPassword(!showConfirmPassword)
                  }
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#718096] hover:bg-[#F7F9FC]"
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </Field>

            {formError && (
              <FormAlert>{formError}</FormAlert>
            )}

            <button
              className={primaryButtonClass}
              type="submit"
              disabled={isSubmitting || (!token && code.length !== 6)}
            >
              {isSubmitting ? "Updating..." : "Update password"}
              {!isSubmitting && <ArrowRight size={17} />}
            </button>
          </form>
          {!token && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => void resendCode()}
                disabled={resending || !email.trim()}
                className={secondaryLinkClass}
              >
                {resending ? "Sending a new code..." : "Resend reset code"}
              </button>
              {resendMessage && <p className="mt-3 text-xs text-[#718096]" role="status">{resendMessage}</p>}
            </div>
          )}
        </>
      )}
    </PublicFrame>
  );
}

/* -------------------------------------------------------
   EMAIL VERIFICATION
------------------------------------------------------- */

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const token = params.get("token");
  const email = params.get("email") ?? "";
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    token ? "loading" : "idle",
  );
  const [message, setMessage] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [invitationReturnTo, setInvitationReturnTo] = useState("");
  const [postVerificationReturnTo, setPostVerificationReturnTo] = useState("");

  useEffect(() => {
    setInvitationReturnTo(
      window.sessionStorage.getItem("imara.invitationReturnTo") ?? "",
    );
    const stateReturnTo =
      typeof location.state === "object" &&
      location.state !== null &&
      "from" in location.state &&
      typeof location.state.from === "string" &&
      location.state.from.startsWith("/") &&
      !location.state.from.startsWith("//")
        ? location.state.from
        : "";
    setPostVerificationReturnTo(
      stateReturnTo
      || window.sessionStorage.getItem("imara.postVerificationReturnTo")
      || "",
    );

    if (!token) return;

    let active = true;

    apiRequest("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => {
        if (active) {
          setStatus("success");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus("error");

          setMessage(
            error instanceof Error
              ? error.message
              : "We couldn't verify your email.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [token, location.state]);

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setVerifyingCode(true);
    try {
      await apiRequest("/auth/verify-email-code", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), code }),
      });
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "We couldn't verify your email.");
    } finally {
      setVerifyingCode(false);
    }
  }

  async function resendCode() {
    setResendMessage("");
    setResending(true);
    try {
      await apiRequest("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setResendMessage("If that address needs verification, a new code will be sent.");
    } catch (error) {
      setResendMessage(error instanceof Error ? error.message : "We couldn't resend the verification code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <PublicFrame eyebrow="Email verification">
      {token && status === "loading" && (
        <>
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF8EE]">
            <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#D5EFDC] border-t-[#20AD43]" />
          </div>

          <FormHeading
            title="Verifying your email."
            description="Please wait while we confirm your email address."
          />
        </>
      )}

      {status === "success" && (
        <>
          <SuccessIcon />

          <FormHeading
            title="You're verified."
            description="Your email address is confirmed. Your IMARA space is ready."
          />

          <Link
            className={primaryButtonClass}
            to="/login"
            state={
              invitationReturnTo || postVerificationReturnTo
                ? { from: invitationReturnTo || postVerificationReturnTo }
                : undefined
            }
          >
            Log in to your space
            <ArrowRight size={17} />
          </Link>
        </>
      )}

      {token && status === "error" && (
        <>
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            <ShieldCheck size={27} />
          </div>

          <FormHeading
            title="Verification failed."
            description={message}
          />

          <Link className={primaryButtonClass} to="/login">
            Continue to log in
            <ArrowRight size={17} />
          </Link>

          <div className="mt-5 text-center">
            <Link
              to="/register"
              className={secondaryLinkClass}
            >
              Create a new account
            </Link>
          </div>
        </>
      )}

      {!token && status !== "success" && (
        <>
          <FormHeading
            title="Verify your email."
            description="Enter the six-digit verification code sent to your email address. If it doesn't arrive, you can resend it."
          />
          <form className="mt-6 space-y-5" onSubmit={(event) => void submitCode(event)}>
            <Field label="Verification code">
              <input
                className={`${inputClass} text-center text-xl font-semibold tracking-[0.35em]`}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                aria-label="Six-digit verification code"
                required
              />
            </Field>
            {message && <FormAlert>{message}</FormAlert>}
            <button className={primaryButtonClass} type="submit" disabled={verifyingCode || !email.trim() || code.length !== 6}>
              {verifyingCode ? "Verifying..." : "Verify email"}
              {!verifyingCode && <ArrowRight size={17} />}
            </button>
          </form>
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => void resendCode()}
              disabled={resending || !email.trim()}
              className={secondaryLinkClass}
            >
              {resending ? "Sending a new code..." : "Resend code"}
            </button>
            {resendMessage && <p className="mt-3 text-xs text-[#718096]" role="status">{resendMessage}</p>}
          </div>
        </>
      )}
    </PublicFrame>
  );
}
