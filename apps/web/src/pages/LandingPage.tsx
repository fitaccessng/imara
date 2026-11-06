
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Cloud,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderLock,
  HardDrive,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const features = [
  {
    icon: Folder,
    title: "Everything organised",
    description:
      "Keep your documents in folders that make sense to you.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy comes first",
    description:
      "Protect your files with secure access and folder locks.",
  },
  {
    icon: Search,
    title: "Find files faster",
    description:
      "Search and access the documents you need, whenever you need them.",
  },
];

const fileItems = [
  {
    name: "Project Proposal.pdf",
    type: "PDF document",
    size: "2.4 MB",
    icon: FileText,
    color: "text-red-500",
    bg: "bg-red-50",
  },
  {
    name: "Annual Report.xlsx",
    type: "Spreadsheet",
    size: "1.8 MB",
    icon: FileSpreadsheet,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    name: "Family Photos",
    type: "12 images",
    size: "8.2 MB",
    icon: FileImage,
    color: "text-blue-500",
    bg: "bg-blue-50",
  },
];

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <main className="min-h-screen overflow-hidden bg-white text-[#172B3A]">
      {/* NAVIGATION */}
      <header className="sticky top-0 z-50 border-b border-[#E5EAF0] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link
            to="/"
            className="flex items-center gap-2 text-[25px] font-bold tracking-[-1.5px] text-[#102B46]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#20AD43] text-xl font-bold text-white">
              i
            </span>
            IMARA<span className="-ml-2 text-[#20AD43]">.</span>
          </Link>

          <nav className="hidden items-center gap-9 md:flex">
            <a
              href="#features"
              className="text-sm font-medium text-[#718096] transition hover:text-[#102B46]"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-[#718096] transition hover:text-[#102B46]"
            >
              How it works
            </a>
            <a
              href="#security"
              className="text-sm font-medium text-[#718096] transition hover:text-[#102B46]"
            >
              Security
            </a>
            <Link
              to="/pricing"
              className="text-sm font-medium text-[#718096] transition hover:text-[#102B46]"
            >
              Pricing
            </Link>
          </nav>

          <div className="hidden items-center gap-6 md:flex">
            <Link
              to="/login"
              className="text-sm font-semibold text-[#102B46] transition hover:text-[#20AD43]"
            >
              Log in
            </Link>

            <Link
              to="/register"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#20AD43] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#199438]"
            >
              Get started
              <ArrowRight size={16} />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5EAF0] text-[#102B46] md:hidden"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-[#E5EAF0] bg-white px-5 py-5 md:hidden">
            <nav className="flex flex-col gap-5">
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-medium"
              >
                Features
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-medium"
              >
                How it works
              </a>
              <a
                href="#security"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-medium"
              >
                Security
              </a>
              <Link
                to="/pricing"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-medium"
              >
                Pricing
              </Link>

              <div className="flex gap-3 border-t border-[#E5EAF0] pt-4">
                <Link
                  to="/login"
                  className="flex-1 rounded-lg border border-[#E5EAF0] py-3 text-center text-sm font-semibold"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="flex-1 rounded-lg bg-[#20AD43] py-3 text-center text-sm font-semibold text-white"
                >
                  Get started
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-[#F7F9FC]">
        <div className="mx-auto grid min-h-[650px] max-w-[1240px] items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:px-10 lg:py-24">
          <div className="relative z-10 max-w-[570px]">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#DDEDE1] bg-white px-3.5 py-2 text-xs font-semibold text-[#168B36]">
              <span className="h-2 w-2 rounded-full bg-[#20AD43]" />
              YOUR FILES. YOUR SPACE.
            </div>

            <h1 className="text-[46px] font-bold leading-[1.08] tracking-[-2.5px] text-[#102B46] sm:text-[58px] lg:text-[68px]">
              Your digital world,
              <span className="block text-[#20AD43]">
                securely kept.
              </span>
            </h1>

            <p className="mt-7 max-w-[440px] text-base leading-8 text-[#718096] sm:text-lg">
              One simple place for all your files. Store, organise,
              access and share what matters.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                to="/register"
                className="inline-flex h-13 items-center justify-center gap-3 rounded-lg bg-[#20AD43] px-7 py-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(32,173,67,0.16)] transition hover:-translate-y-0.5 hover:bg-[#199438]"
              >
                Create your free account
                <ArrowRight size={17} />
              </Link>

              <Link
                to="/login"
                className="inline-flex h-13 items-center justify-center gap-2 rounded-lg px-5 py-4 text-sm font-semibold text-[#102B46] transition hover:bg-white"
              >
                Sign in
                <ArrowUpRight size={16} />
              </Link>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-[#718096]">
              <span className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-[#20AD43]" />
                5GB free storage
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-[#20AD43]" />
                Private workspace
              </span>
            </div>
          </div>

          {/* PRODUCT PREVIEW */}
          <div className="relative mx-auto w-full max-w-[570px] lg:ml-auto">
            <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-[#20AD43]/10 blur-3xl" />
            <div className="absolute -bottom-10 -left-10 h-64 w-64 rounded-full bg-blue-100/60 blur-3xl" />

            <div className="relative rounded-2xl border border-[#E5EAF0] bg-white p-3 shadow-[0_25px_80px_rgba(16,43,70,0.10)] sm:p-5">
              {/* Preview header */}
              <div className="flex items-center justify-between border-b border-[#E5EAF0] pb-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#20AD43] text-sm font-bold text-white">
                    i
                  </div>
                  <span className="font-bold tracking-tight text-[#102B46]">
                    IMARA
                  </span>
                </div>

                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F7F9FC] text-[#718096]">
                  <MoreHorizontal size={20} />
                </div>
              </div>

              {/* Search */}
              <div className="mt-5 flex h-10 items-center gap-2 rounded-lg border border-[#E5EAF0] bg-[#F7F9FC] px-3">
                <Search size={15} className="text-[#718096]" />
                <span className="text-xs text-[#A0AEC0]">
                  Search your files...
                </span>
              </div>

              {/* Welcome */}
              <div className="mt-6 flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#718096]">Your workspace</p>
                  <h3 className="mt-1 text-xl font-bold tracking-tight text-[#102B46]">
                    My Files
                  </h3>
                </div>

                <div className="flex h-9 items-center gap-2 rounded-lg bg-[#20AD43] px-3 text-xs font-semibold text-white">
                  <Upload size={14} />
                  Upload
                </div>
              </div>

              {/* Storage card */}
              <div className="mt-5 rounded-xl border border-[#E5EAF0] bg-[#FAFCFB] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive size={17} className="text-[#20AD43]" />
                    <span className="text-xs font-semibold text-[#102B46]">
                      Storage
                    </span>
                  </div>
                  <span className="text-[11px] text-[#718096]">
                    Free plan
                  </span>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <span className="text-2xl font-bold text-[#102B46]">
                      1.9 GB
                    </span>
                    <span className="ml-1 text-xs text-[#718096]">
                      of 5 GB used
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-[#20AD43]">
                    38%
                  </span>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E5EAF0]">
                  <div className="h-full w-[38%] rounded-full bg-[#20AD43]" />
                </div>
              </div>

              {/* Folders */}
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[#102B46]">
                    Recent files
                  </h4>
                  <span className="text-[11px] font-medium text-[#20AD43]">
                    View all
                  </span>
                </div>

                <div className="space-y-2">
                  {fileItems.map((item) => {
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.name}
                        className="flex items-center gap-3 rounded-lg p-2.5 transition hover:bg-[#F7F9FC]"
                      >
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.bg}`}
                        >
                          <Icon size={19} className={item.color} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-[#102B46]">
                            {item.name}
                          </p>
                          <p className="mt-1 text-[10px] text-[#718096]">
                            {item.type}
                          </p>
                        </div>

                        <span className="text-[10px] text-[#718096]">
                          {item.size}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Preview footer */}
              <div className="mt-4 flex items-center justify-between border-t border-[#E5EAF0] pt-4">
                <div className="flex items-center gap-2 text-[11px] text-[#718096]">
                  <LockKeyhole size={13} className="text-[#20AD43]" />
                  Secure workspace
                </div>
                <span className="text-[11px] font-medium text-[#20AD43]">
                  All files organised
                </span>
              </div>
            </div>

            {/* Floating folder card */}
            <div className="absolute -bottom-7 -left-5 hidden items-center gap-3 rounded-xl border border-[#E5EAF0] bg-white p-3 shadow-xl sm:flex">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-[#20AD43]">
                <FolderLock size={20} />
              </div>
              <div>
                <p className="text-xs font-bold text-[#102B46]">
                  Private folders
                </p>
                <p className="mt-1 text-[10px] text-[#718096]">
                  Your files, protected
                </p>
              </div>
              <Check size={16} className="ml-2 text-[#20AD43]" />
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section
        id="security"
        className="border-b border-[#E5EAF0] bg-white"
      >
        <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-6 px-5 py-8 sm:grid-cols-3 sm:px-8 lg:px-10">
          <div className="flex items-center justify-center gap-3 sm:justify-start">
            <ShieldCheck size={21} className="text-[#20AD43]" />
            <span className="text-sm font-semibold text-[#102B46]">
              Privacy-focused storage
            </span>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Cloud size={21} className="text-[#20AD43]" />
            <span className="text-sm font-semibold text-[#102B46]">
              Access your files anywhere
            </span>
          </div>
          <div className="flex items-center justify-center gap-3 sm:justify-end">
            <LockKeyhole size={21} className="text-[#20AD43]" />
            <span className="text-sm font-semibold text-[#102B46]">
              Protected private folders
            </span>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section
        id="features"
        className="bg-white px-5 py-24 sm:px-8 lg:px-10"
      >
        <div className="mx-auto max-w-[1240px]">
          <div className="mx-auto max-w-[600px] text-center">
            <span className="text-xs font-bold uppercase tracking-[2px] text-[#20AD43]">
              Everything in one place
            </span>

            <h2 className="mt-4 text-3xl font-bold tracking-[-1.5px] text-[#102B46] sm:text-4xl">
              Less searching.
              <span className="block text-[#20AD43]">
                More doing.
              </span>
            </h2>

            <p className="mt-5 text-sm leading-7 text-[#718096] sm:text-base">
              Everything you need to keep your digital life organised
              and accessible.
            </p>
          </div>

          <div className="mt-16 grid gap-5 md:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <div
                  key={feature.title}
                  className="group rounded-2xl border border-[#E5EAF0] bg-white p-7 transition duration-300 hover:-translate-y-1 hover:border-[#B9E5C4] hover:shadow-[0_15px_40px_rgba(16,43,70,0.06)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAF8EE] text-[#20AD43] transition group-hover:bg-[#20AD43] group-hover:text-white">
                    <Icon size={23} />
                  </div>

                  <h3 className="mt-7 text-lg font-bold text-[#102B46]">
                    {feature.title}
                  </h3>

                  <p className="mt-3 text-sm leading-7 text-[#718096]">
                    {feature.description}
                  </p>

                  <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-[#20AD43]">
                    Learn more
                    <ArrowRight size={14} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how-it-works"
        className="bg-[#F7F9FC] px-5 py-24 sm:px-8 lg:px-10"
      >
        <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-[2px] text-[#20AD43]">
              Simple by design
            </span>

            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-[-1.5px] text-[#102B46] sm:text-4xl">
              Your files.
              <br />
              Your space.
              <br />
              <span className="text-[#20AD43]">Your control.</span>
            </h2>

            <p className="mt-6 max-w-md text-sm leading-7 text-[#718096] sm:text-base">
              Start with a free account and bring your documents
              together in one secure, organised workspace.
            </p>

            <Link
              to="/register"
              className="mt-8 inline-flex items-center gap-3 rounded-lg bg-[#20AD43] px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#199438]"
            >
              Start organising
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="space-y-4">
            {[
              {
                number: "01",
                title: "Create your space",
                description: "Set up your personal or business workspace.",
              },
              {
                number: "02",
                title: "Upload your files",
                description: "Bring your documents, images and media together.",
              },
              {
                number: "03",
                title: "Access and share",
                description: "Find, manage and share files when you need them.",
              },
            ].map((step) => (
              <div
                key={step.number}
                className="flex gap-5 rounded-xl border border-[#E5EAF0] bg-white p-6"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#EAF8EE] text-sm font-bold text-[#20AD43]">
                  {step.number}
                </span>

                <div>
                  <h3 className="font-bold text-[#102B46]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#718096]">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-white px-5 py-24 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1100px] overflow-hidden rounded-2xl bg-[#102B46] px-6 py-16 text-center sm:px-12">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-[#57D477]">
            <HardDrive size={24} />
          </div>

          <h2 className="mx-auto mt-6 max-w-[650px] text-3xl font-bold tracking-[-1.5px] text-white sm:text-4xl">
            Give your files a better home.
          </h2>

          <p className="mt-4 text-sm leading-7 text-white/65">
            Start with 5GB of free storage.
          </p>

          <Link
            to="/register"
            className="mt-8 inline-flex items-center gap-3 rounded-lg bg-[#20AD43] px-7 py-4 text-sm font-semibold text-white transition hover:bg-[#199438]"
          >
            Create your free account
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#E5EAF0] bg-white px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-5 sm:flex-row">
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-bold tracking-tight text-[#102B46]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#20AD43] text-base text-white">
              i
            </span>
            IMARA<span className="-ml-2 text-[#20AD43]">.</span>
          </Link>

          <p className="text-center text-xs text-[#718096]">
            Your Digital World, Securely Kept.
          </p>

          <p className="text-xs text-[#718096]">
            © {new Date().getFullYear()} IMARA. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
