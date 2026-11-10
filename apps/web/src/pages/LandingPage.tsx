
import { useState } from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  Clock3,
  File,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Plus,
  QrCode,
  Search,
  Share2,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { BrandIdentity, BrandMark } from "../components/BrandLockup";

const photos = {
  wedding:
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1000&q=85",
  celebration:
    "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=900&q=85",
  friends:
    "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=900&q=85",
  dinner:
    "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=900&q=85",
  couple:
    "https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=900&q=85",
  party:
    "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=900&q=85",
};

const experiences = [
  {
    id: "digital-drive",
    number: "01",
    title: "Your documents, organised.",
    description:
      "Keep important files in one place. Create folders, search documents, preview files and download what you need.",
    tags: ["Folders", "File search", "Document preview"],
    icon: HardDrive,
  },
  {
    id: "file-sharing",
    number: "02",
    title: "Share files with your team.",
    description:
      "Invite people into your workspace and give them access to the folders they need.",
    tags: ["Team invitations", "Folder access", "Permissions"],
    icon: Share2,
  },
  {
    id: "event-qr",
    number: "03",
    title: "Create an event. Share a QR.",
    description:
      "Set up an event, customise its gallery access and give guests one QR code to contribute their memories.",
    tags: ["Event details", "QR code", "Gallery privacy"],
    icon: CalendarDays,
  },
  {
    id: "shared-gallery",
    number: "04",
    title: "Every moment in one gallery.",
    description:
      "Guests scan the QR code, take or select photos and videos, and upload them to your shared event collection.",
    tags: ["Guest uploads", "Photos and videos", "Shared gallery"],
    icon: ImageIcon,
  },
];

function Brand() {
  return (
    <Link
      to="/"
      className="landing-brand flex items-center gap-2 text-[25px] font-extrabold tracking-[-1.5px] text-[#102B46]"
      aria-label="imara home"
    >
      <BrandIdentity />
    </Link>
  );
}

function DrivePreview() {
  const files = [
    { name: "Business Documents", type: "folder", detail: "12 files", color: "text-amber-500" },
    { name: "Project Proposal.pdf", type: "pdf", detail: "2.4 MB", color: "text-red-500" },
    { name: "Brand Guidelines", type: "folder", detail: "8 files", color: "text-amber-500" },
    { name: "Annual Report.docx", type: "doc", detail: "1.8 MB", color: "text-blue-500" },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white shadow-[0_25px_70px_rgba(16,43,70,0.12)]">
      <div className="flex items-center justify-between border-b border-[#EEF1F5] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <BrandMark className="drive-preview-mark" />
          <span className="text-sm font-bold text-[#102B46]">IMARA Drive</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-[#EAF8EE] px-2.5 py-1 text-[10px] font-semibold text-[#168D34] sm:inline-flex">
            All files synced
          </span>
          <button className="rounded-lg p-2 text-slate-400"><Bell size={16} /></button>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E7F5EA] text-[10px] font-bold text-[#168D34]">JD</div>
        </div>
      </div>

      <div className="grid min-h-[310px] grid-cols-[112px_1fr] sm:grid-cols-[150px_1fr]">
        <aside className="border-r border-[#EEF1F5] bg-[#FAFBFC] p-3 sm:p-4">
          <div className="mb-5 flex items-center gap-2 rounded-lg bg-[#EAF8EE] px-2 py-2 text-[11px] font-semibold text-[#168D34]">
            <LayoutGrid size={14} /> My Drive
          </div>
          {[
            ["Recent", Clock3],
            ["Shared", Users],
            ["Favourites", Check],
            ["Recycle bin", File],
          ].map(([label, Icon]) => (
            <div key={label as string} className="mb-4 flex items-center gap-2 text-[10px] text-[#718096] sm:text-xs">
              <Icon size={13} /> {label as string}
            </div>
          ))}
          <div className="mt-8">
            <div className="mb-2 text-[9px] font-bold uppercase tracking-wider text-[#9AA7B5]">Storage</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#E8EDF1]">
              <div className="h-full w-[62%] rounded-full bg-[#20AD43]" />
            </div>
            <p className="mt-2 text-[9px] text-[#718096]">Storage overview</p>
          </div>
        </aside>

        <div className="min-w-0 p-3 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[9px] text-[#9AA7B5]">Workspace / Files</p>
              <h3 className="mt-1 text-base font-bold text-[#102B46] sm:text-lg">My Drive</h3>
            </div>
            <button className="flex items-center gap-1.5 rounded-lg bg-[#20AD43] px-3 py-2 text-[10px] font-semibold text-white">
              <Plus size={13} /> New
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#E8EDF1] bg-[#FAFBFC] px-3 py-2">
            <Search size={13} className="text-[#9AA7B5]" />
            <span className="text-[10px] text-[#9AA7B5]">Search your files and folders...</span>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[#526678]">Recently accessed</span>
            <span className="text-[9px] text-[#9AA7B5]">View all</span>
          </div>

          <div className="mt-2 space-y-1">
            {files.map((item) => (
              <div key={item.name} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 transition hover:bg-[#F7F9FC] sm:gap-3">
                {item.type === "folder" ? (
                  <Folder size={19} className={item.color} />
                ) : item.type === "pdf" ? (
                  <FileText size={19} className={item.color} />
                ) : (
                  <File size={19} className={item.color} />
                )}
                <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[#34495B] sm:text-xs">{item.name}</span>
                <span className="hidden text-[9px] text-[#9AA7B5] sm:block">{item.detail}</span>
                <MoreHorizontal size={15} className="text-[#9AA7B5]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SharingPreview() {
  const members = [
    { name: "Sarah Johnson", email: "sarah@company.com", initials: "SJ", role: "Can edit", color: "bg-[#FCE8D8] text-[#B86A32]" },
    { name: "David Williams", email: "david@company.com", initials: "DW", role: "Can view", color: "bg-[#E6EDFF] text-[#526DB4]" },
    { name: "Amaka Okoro", email: "amaka@company.com", initials: "AO", role: "Can edit", color: "bg-[#E5F5E9] text-[#258B45]" },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white shadow-[0_25px_70px_rgba(16,43,70,0.10)]">
      <div className="flex items-center justify-between border-b border-[#EEF1F5] px-4 py-4">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#9AA7B5]">Workspace access</p>
          <h3 className="mt-1 text-sm font-bold text-[#102B46]">Project Alpha</h3>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF8EE] text-[#20AD43]">
          <Users size={17} />
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="rounded-xl border border-[#E8EDF1] bg-[#FAFBFC] p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF2D9] text-amber-600">
              <FolderOpen size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[#102B46]">Project Alpha</p>
              <p className="mt-1 text-[10px] text-[#718096]">Shared folder · 18 files</p>
            </div>
            <LockKeyhole size={15} className="text-[#20AD43]" />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs font-bold text-[#102B46]">People with access</span>
          <span className="text-[10px] text-[#718096]">3 members</span>
        </div>

        <div className="mt-3 space-y-3">
          {members.map((member) => (
            <div key={member.email} className="flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${member.color}`}>
                {member.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-[#34495B]">{member.name}</p>
                <p className="truncate text-[9px] text-[#9AA7B5]">{member.email}</p>
              </div>
              <span className="rounded-md bg-[#F2F5F7] px-2 py-1 text-[9px] font-semibold text-[#526678]">{member.role}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-dashed border-[#B8DCC1] bg-[#F5FBF6] py-3 text-[11px] font-semibold text-[#168D34]">
          <Plus size={14} /> Invite a team member
        </div>
      </div>
    </div>
  );
}

function EventPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white shadow-[0_25px_70px_rgba(16,43,70,0.12)]">
      <div className="relative h-[175px] overflow-hidden sm:h-[205px]">
        <img src={photos.wedding} alt="Elegant outdoor wedding celebration" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#102B46]/80 via-[#102B46]/10 to-transparent" />
        <div className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-[9px] font-bold text-[#168D34]">
          EVENT PREVIEW
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-[9px] font-semibold uppercase tracking-[1.5px] text-white/75">A day to remember</p>
          <h3 className="mt-1 text-xl font-bold text-white sm:text-2xl">The Wedding Celebration</h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-white/85">
            <span className="flex items-center gap-1"><CalendarDays size={12} /> 24 October, 2026</span>
            <span className="flex items-center gap-1"><Users size={12} /> Private event</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#9AA7B5]">Your event gallery</p>
          <p className="mt-1 text-sm font-bold text-[#102B46]">Collect every moment.</p>
          <p className="mt-1 max-w-[260px] text-[10px] leading-5 text-[#718096]">
            Give your guests a simple way to share their photos and videos.
          </p>
          <div className="mt-3 flex items-center gap-2 text-[10px] font-semibold text-[#168D34]">
            <ShieldCheck size={13} /> Gallery access settings
          </div>
        </div>
        <div className="flex w-[94px] flex-col items-center justify-center rounded-xl border border-[#E5EAF0] bg-[#FAFBFC] p-2 sm:w-[110px]">
          <div className="flex h-[58px] w-[58px] items-center justify-center rounded-lg bg-white text-[#102B46] sm:h-[68px] sm:w-[68px]">
            <QrCode size={54} strokeWidth={1.5} />
          </div>
          <span className="mt-2 text-[9px] font-bold text-[#102B46]">Event QR code</span>
          <span className="mt-0.5 text-[8px] text-[#9AA7B5]">Ready to share</span>
        </div>
      </div>

      <div className="mx-4 mb-4 flex items-center justify-between rounded-lg bg-[#F5FBF6] px-3 py-2.5 sm:mx-5 sm:mb-5">
        <span className="flex items-center gap-2 text-[10px] font-semibold text-[#168D34]">
          <span className="h-2 w-2 rounded-full bg-[#20AD43]" /> Event gallery ready
        </span>
        <span className="text-[9px] text-[#718096]">Share with guests</span>
      </div>
    </div>
  );
}

function GalleryPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/15 bg-white shadow-[0_25px_70px_rgba(0,0,0,0.20)]">
      <div className="flex items-center justify-between border-b border-[#EEF1F5] px-4 py-3 sm:px-5">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#9AA7B5]">Shared event gallery</p>
          <h3 className="mt-1 text-sm font-bold text-[#102B46]">Wedding memories</h3>
        </div>
        <span className="rounded-full bg-[#EAF8EE] px-2.5 py-1 text-[9px] font-semibold text-[#168D34]">Live gallery</span>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-4">
        <div className="relative col-span-2 h-[150px] overflow-hidden rounded-xl sm:h-[190px]">
          <img src={photos.celebration} alt="Guests celebrating together" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
          <div className="absolute bottom-3 left-3 text-white">
            <p className="text-[9px] font-medium text-white/75">24 October, 2026</p>
            <p className="mt-1 text-base font-bold">The moments we shared</p>
          </div>
        </div>
        <div className="h-[105px] overflow-hidden rounded-xl sm:h-[125px]">
          <img src={photos.friends} alt="Friends enjoying a celebration" className="h-full w-full object-cover" />
        </div>
        <div className="h-[105px] overflow-hidden rounded-xl sm:h-[125px]">
          <img src={photos.dinner} alt="Beautiful event dinner setting" className="h-full w-full object-cover" />
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-4 sm:px-5">
        <div className="flex -space-x-2">
          {["bg-[#F3C7A6]", "bg-[#D8E6F8]", "bg-[#D8EEDC]", "bg-[#EBDDF6]"].map((color, i) => (
            <div key={i} className={`h-7 w-7 rounded-full border-2 border-white ${color}`} />
          ))}
        </div>
        <span className="text-[10px] font-semibold text-[#526678]">Shared by your guests</span>
      </div>
    </div>
  );
}

function FeatureCard({
  number,
  title,
  description,
  tags,
  icon: Icon,
  children,
  id,
}: {
  number: string;
  title: string;
  description: string;
  tags: string[];
  icon: typeof HardDrive;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <article id={id} className="group overflow-hidden rounded-2xl border border-[#E7ECF0] bg-white transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_55px_rgba(16,43,70,0.09)]">
      <div className="min-w-0 bg-[#F5F7FA] p-3 sm:p-5">
        {children}
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-[1.5px] text-[#20AD43]">{number}</span>
          <Icon size={18} className="text-[#20AD43]" />
        </div>
        <h3 className="mt-3 text-lg font-bold tracking-tight text-[#102B46] sm:text-xl">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#718096]">{description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[#F2F6F3] px-2.5 py-1.5 text-[10px] font-medium text-[#526678]">{tag}</span>
          ))}
        </div>
        <Link to={`/features#${id}`} className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#168D34] transition group-hover:gap-3">
          Explore feature <ArrowRight size={14} />
        </Link>
      </div>
    </article>
  );
}

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function closeMenu() {
    setMobileMenuOpen(false);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-white text-[#172B3A]">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-[#E9EEF1] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <Brand />

          <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
            <Link to="/features" className="text-sm font-medium text-[#526678] hover:text-[#20AD43]">Features</Link>
            <Link to="/how-it-works" className="text-sm font-medium text-[#526678] hover:text-[#20AD43]">How it works</Link>
            <Link to="/pricing" className="text-sm font-medium text-[#526678] hover:text-[#20AD43]">Pricing</Link>
            <Link to="/help" className="text-sm font-medium text-[#526678] hover:text-[#20AD43]">Help</Link>
          </nav>

          <div className="hidden items-center gap-6 md:flex">
            <Link to="/login" className="text-sm font-semibold text-[#102B46] hover:text-[#20AD43]">Log in</Link>
            <Link to="/register" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#20AD43] px-5 text-sm font-semibold text-white transition hover:bg-[#199438]">
              Get started <ArrowRight size={16} />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5EAF0] text-[#102B46] md:hidden"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-[#E5EAF0] bg-white px-5 py-5 md:hidden">
            <nav className="flex flex-col gap-5 text-sm font-medium text-[#526678]" aria-label="Mobile navigation">
              <Link to="/features" onClick={closeMenu}>Features</Link>
              <Link to="/how-it-works" onClick={closeMenu}>How it works</Link>
              <Link to="/pricing" onClick={closeMenu}>Pricing</Link>
              <Link to="/help" onClick={closeMenu}>Help</Link>
              <div className="flex gap-3 border-t border-[#E5EAF0] pt-4">
                <Link to="/login" onClick={closeMenu} className="flex-1 rounded-lg border border-[#E5EAF0] py-3 text-center">Log in</Link>
                <Link to="/register" onClick={closeMenu} className="flex-1 rounded-lg bg-[#20AD43] py-3 text-center text-white">Get started</Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative bg-[#F6F9F7]">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[0.88fr_1.12fr] lg:px-10 lg:py-24">
          <div className="relative z-10">

              <h1 className="text-[42px] font-extrabold leading-[1.08] tracking-[-2px] text-[#102B46] sm:text-5xl lg:text-[64px]">
              Everything important.
              <span className="mt-2 block text-[#20AD43]">
                In one place.
              </span>
            </h1>
            <p className="mt-6 max-w-[470px] text-base leading-7 text-[#647789] sm:text-lg sm:leading-8">
              Organise documents, share folders with your team, and bring every event photo into one shared gallery.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-[#20AD43] px-6 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(32,173,67,0.18)] transition hover:-translate-y-0.5 hover:bg-[#199438]">
                Create your account <ArrowRight size={17} />
              </Link>
              <Link to="/features" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[#DCE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#102B46] hover:border-[#20AD43]">
                Explore IMARA
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-[#647789]">
              <span className="flex items-center gap-2"><Check size={14} className="text-[#20AD43]" /> Organised file storage</span>
              <span className="flex items-center gap-2"><Check size={14} className="text-[#20AD43]" /> QR-powered event galleries</span>
            </div>
          </div>

          <div className="min-w-0">
            <DrivePreview />
            <div className="ml-auto mt-3 flex w-fit items-center gap-2 rounded-xl border border-[#E5EAF0] bg-white px-3 py-2 shadow-lg">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EAF8EE] text-[#20AD43]"><ShieldCheck size={15} /></span>
              <span className="text-[10px] font-semibold text-[#526678]">Your workspace, in one place</span>
            </div>
          </div>
        </div>
      </section>

      {/* Four experiences */}
      <section id="core-experiences" className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-[1240px]">
          <div className="max-w-[650px]">
            <span className="text-[10px] font-extrabold uppercase tracking-[2px] text-[#168D34]">What you can do with IMARA</span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-[-1.5px] text-[#102B46] sm:text-4xl">
              One platform. Four useful experiences.
            </h2>
            <p className="mt-4 max-w-[560px] text-sm leading-7 text-[#718096] sm:text-base">
              From everyday documents to the photos everyone took at your event, IMARA gives everything a clear place.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <FeatureCard {...experiences[0]} icon={HardDrive}>
              <DrivePreview />
            </FeatureCard>
            <FeatureCard {...experiences[1]} icon={Share2}>
              <SharingPreview />
            </FeatureCard>
            <FeatureCard {...experiences[2]} icon={CalendarDays}>
              <EventPreview />
            </FeatureCard>
            <FeatureCard {...experiences[3]} icon={ImageIcon}>
              <GalleryPreview />
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* Event gallery spotlight */}
      <section className="relative overflow-hidden bg-[#102B46] px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="absolute -right-40 -top-40 h-[450px] w-[450px] rounded-full bg-[#20AD43]/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[2px] text-[#8FE2A2]">
              <QrCode size={15} /> IMARA EVENT GALLERIES
            </span>
            <h2 className="mt-5 max-w-[520px] text-3xl font-extrabold leading-tight tracking-[-1.5px] text-white sm:text-4xl lg:text-[46px]">
              Your event happens once. Keep every perspective.
            </h2>
            <p className="mt-5 max-w-[460px] text-sm leading-7 text-white/65 sm:text-base">
              Create an event and share its QR code. Guests scan it on their phones, capture or select photos and videos, and contribute to one shared collection.
            </p>

            <div className="mt-8 space-y-5">
              {[
                ["01", "Create your event", "Add the event details and choose gallery access."],
                ["02", "Share your QR code", "Guests scan the code using their phone camera."],
                ["03", "Collect the memories", "Photos and videos come together in one gallery."],
              ].map(([number, title, detail]) => (
                <div key={number} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-xs font-bold text-[#8FE2A2]">{number}</span>
                  <div>
                    <h3 className="text-sm font-bold text-white">{title}</h3>
                    <p className="mt-1 text-xs leading-5 text-white/55">{detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link to="/features#shared-gallery" className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#20AD43] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#199438]">
              Explore event galleries <ArrowRight size={16} />
            </Link>
          </div>

          <div className="relative min-w-0">
            <GalleryPreview />
            <div className="absolute -bottom-5 -left-3 hidden items-center gap-3 rounded-xl border border-[#E5EAF0] bg-white p-3 shadow-xl sm:flex">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAF8EE] text-[#20AD43]"><Upload size={17} /></div>
              <div>
                <p className="text-[10px] font-bold text-[#102B46]">Guest contribution</p>
                <p className="text-[9px] text-[#718096]">Add photos to the collection</p>
              </div>
              <Check size={15} className="text-[#20AD43]" />
            </div>
          </div>
        </div>
      </section>

      {/* Pricing CTA */}
      <section className="px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-[1080px] items-center gap-7 rounded-2xl border border-[#E5EAF0] bg-[#F7F9FC] p-6 sm:p-9 md:grid-cols-[1fr_auto]">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-[2px] text-[#168D34]">Plans that fit your needs</span>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-1px] text-[#102B46] sm:text-3xl">
              Make room for your work and memories.
            </h2>
            <p className="mt-3 max-w-[650px] text-sm leading-7 text-[#718096]">
              Compare Free, PRO and BUSINESS plans to find the storage, team capacity and event allowance that suit you.
            </p>
          </div>
          <Link to="/pricing" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#102B46] px-5 text-sm font-bold text-white transition hover:bg-[#1c456b]">
            Compare plans <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-white px-5 pb-20 pt-5 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1100px] overflow-hidden rounded-2xl bg-[#102B46] px-6 py-14 text-center sm:px-12 sm:py-16">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-[#57D477]">
            <QrCode size={24} />
          </div>
          <h2 className="mx-auto mt-6 max-w-[720px] text-3xl font-extrabold tracking-[-1.5px] text-white sm:text-4xl">
            Give your files and memories a home.
          </h2>
          <p className="mx-auto mt-4 max-w-[540px] text-sm leading-7 text-white/65">
            Start organising your documents, sharing with your team or collecting event memories with IMARA.
          </p>
          <Link to="/register" className="mt-7 inline-flex items-center gap-3 rounded-lg bg-[#20AD43] px-7 py-4 text-sm font-bold text-white transition hover:bg-[#199438]">
            Create your account <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E5EAF0] bg-white px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-5 sm:flex-row">
          <Brand />
          <p className="text-center text-xs text-[#718096]">Documents organised. Event memories collected.</p>
          <p className="text-xs text-[#718096]">© {new Date().getFullYear()} IMARA. All rights reserved.</p>
        </div>
        <nav className="mx-auto mt-7 flex max-w-[900px] flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-[#718096]" aria-label="Footer navigation">
          <Link to="/about" className="hover:text-[#20AD43]">About</Link>
          <Link to="/features" className="hover:text-[#20AD43]">Features</Link>
          <Link to="/how-it-works" className="hover:text-[#20AD43]">How it works</Link>
          <Link to="/security" className="hover:text-[#20AD43]">Security</Link>
          <Link to="/pricing" className="hover:text-[#20AD43]">Pricing</Link>
          <Link to="/help" className="hover:text-[#20AD43]">Help</Link>
          <Link to="/contact" className="hover:text-[#20AD43]">Contact</Link>
          <Link to="/privacy" className="hover:text-[#20AD43]">Privacy</Link>
          <Link to="/terms" className="hover:text-[#20AD43]">Terms</Link>
          <Link to="/admin/login" className="hover:text-[#20AD43]">Admin sign in</Link>
        </nav>
      </footer>
    </main>
  );
}
