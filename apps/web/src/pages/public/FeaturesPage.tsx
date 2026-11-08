
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  LockKeyhole,
  MoreHorizontal,
  QrCode,
  Search,
  ShieldCheck,
  Smartphone,
  Upload,
  Users,
  Video,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../PageShell";
import {
  MarketingCTA,
  ReadAloudButton,
  useHashScroll,
} from "./MarketingContent";

const featureLinks = [
  { href: "#digital-drive", label: "Digital Drive", icon: Folder },
  { href: "#file-sharing", label: "File sharing", icon: Users },
  { href: "#event-qr", label: "Event creation", icon: QrCode },
  { href: "#shared-gallery", label: "Shared gallery", icon: ImageIcon },
];

const eventPhotos = [
  {
    src: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=85",
    alt: "Outdoor wedding celebration",
  },
  {
    src: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=700&q=85",
    alt: "Colourful event celebration",
  },
  {
    src: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=700&q=85",
    alt: "Friends celebrating together",
  },
  {
    src: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=700&q=85",
    alt: "Event dinner setting",
  },
];

function SectionLabel({
  number,
  label,
  light = false,
}: {
  number: string;
  label: string;
  light?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[1.8px] ${
        light ? "text-emerald-300" : "text-[#168D34]"
      }`}
    >
      <span>{number}</span>
      <span className={light ? "text-white/30" : "text-[#C6D2CA]"}>/</span>
      <span>{label}</span>
    </div>
  );
}

function FeatureBenefits({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-[#536779]">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EAF8EE] text-[#168D34]">
            <Check size={12} strokeWidth={2.5} />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function FeatureAction({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#20AD43] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#199438]"
    >
      {children}
      <ArrowRight size={15} />
    </Link>
  );
}

/* -------------------------------------------------------
   DIGITAL DRIVE PREVIEW
------------------------------------------------------- */

function DrivePreview() {
  const files = [
    {
      name: "Business Documents",
      detail: "12 items",
      type: "folder",
    },
    {
      name: "Annual Report 2026.pdf",
      detail: "2.4 MB",
      type: "pdf",
    },
    {
      name: "Project Resources",
      detail: "8 items",
      type: "folder",
    },
    {
      name: "Company Profile.docx",
      detail: "1.8 MB",
      type: "doc",
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E4EAF0] bg-white shadow-[0_24px_65px_rgba(16,43,70,0.12)]">
      <div className="flex items-center justify-between border-b border-[#EDF1F4] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#20AD43] text-sm font-bold text-white">
            i
          </div>
          <div>
            <p className="text-xs font-bold text-[#102B46]">IMARA Drive</p>
            <p className="text-[9px] text-[#98A5B1]">Personal workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-[#EAF8EE] px-2.5 py-1 text-[9px] font-semibold text-[#168D34] sm:inline-block">
            Files synced
          </span>
          <MoreHorizontal size={17} className="text-[#8796A4]" />
        </div>
      </div>

      <div className="grid min-h-[320px] grid-cols-[100px_1fr] sm:grid-cols-[145px_1fr]">
        <aside className="border-r border-[#EDF1F4] bg-[#FAFBFC] p-3 sm:p-4">
          <div className="mb-5 flex items-center gap-2 rounded-lg bg-[#EAF8EE] px-2 py-2 text-[10px] font-semibold text-[#168D34]">
            <FolderOpen size={14} />
            My Drive
          </div>

          <div className="space-y-4 text-[10px] text-[#718096] sm:text-xs">
            <div className="flex items-center gap-2">
              <Clock3 size={13} /> Recent
            </div>
            <div className="flex items-center gap-2">
              <Users size={13} /> Shared
            </div>
            <div className="flex items-center gap-2">
              <FileText size={13} /> Documents
            </div>
            <div className="flex items-center gap-2">
              <ImageIcon size={13} /> Images
            </div>
          </div>

          <div className="mt-9">
            <p className="mb-2 text-[8px] font-bold uppercase tracking-wider text-[#9AA7B5]">
              Storage
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#E7EDF0]">
              <div className="h-full w-[62%] rounded-full bg-[#20AD43]" />
            </div>
            <p className="mt-2 text-[9px] text-[#8796A4]">Storage overview</p>
          </div>
        </aside>

        <div className="min-w-0 p-3 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[9px] text-[#9AA7B5]">Workspace / Files</p>
              <h3 className="mt-1 text-base font-bold text-[#102B46] sm:text-lg">
                My Drive
              </h3>
            </div>
            <button className="flex items-center gap-1.5 rounded-lg bg-[#20AD43] px-3 py-2 text-[10px] font-semibold text-white">
              <Upload size={12} /> Upload
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#E7ECF0] bg-[#FAFBFC] px-3 py-2.5">
            <Search size={13} className="text-[#9AA7B5]" />
            <span className="text-[10px] text-[#9AA7B5]">
              Search files and folders
            </span>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <p className="text-[10px] font-bold text-[#526678]">
              Recent files
            </p>
            <span className="text-[9px] text-[#9AA7B5]">View all</span>
          </div>

          <div className="mt-2 space-y-1">
            {files.map((file) => (
              <div
                key={file.name}
                className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-[#F7F9FC] sm:gap-3"
              >
                {file.type === "folder" ? (
                  <Folder size={19} className="shrink-0 text-amber-500" />
                ) : (
                  <FileText
                    size={19}
                    className={`shrink-0 ${
                      file.type === "pdf" ? "text-red-500" : "text-blue-500"
                    }`}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[#34495B] sm:text-xs">
                  {file.name}
                </span>
                <span className="hidden text-[9px] text-[#9AA7B5] sm:block">
                  {file.detail}
                </span>
                <MoreHorizontal size={14} className="shrink-0 text-[#9AA7B5]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   FILE SHARING PREVIEW
------------------------------------------------------- */

function SharingPreview() {
  const members = [
    {
      name: "Sarah Johnson",
      email: "sarah@company.com",
      initials: "SJ",
      permission: "Can edit",
      color: "bg-[#FCE9D9] text-[#B86A32]",
    },
    {
      name: "David Williams",
      email: "david@company.com",
      initials: "DW",
      permission: "Can view",
      color: "bg-[#E6EDFF] text-[#526DB4]",
    },
    {
      name: "Amaka Okoro",
      email: "amaka@company.com",
      initials: "AO",
      permission: "Can edit",
      color: "bg-[#E5F5E9] text-[#258B45]",
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E4EAF0] bg-white shadow-[0_24px_65px_rgba(16,43,70,0.10)]">
      <div className="flex items-center justify-between border-b border-[#EDF1F4] px-4 py-4 sm:px-5">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#9AA7B5]">
            Business workspace
          </p>
          <h3 className="mt-1 text-sm font-bold text-[#102B46]">
            Project Alpha
          </h3>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF8EE] text-[#20AD43]">
          <Users size={17} />
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-3 rounded-xl border border-[#E7ECF0] bg-[#FAFBFC] p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF3DB] text-amber-600">
            <FolderOpen size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-[#102B46]">
              Project Alpha
            </p>
            <p className="mt-1 text-[10px] text-[#8796A4]">
              Shared folder · 18 files
            </p>
          </div>
          <LockKeyhole size={15} className="text-[#20AD43]" />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-xs font-bold text-[#102B46]">
            People with access
          </p>
          <span className="text-[10px] text-[#8796A4]">3 members</span>
        </div>

        <div className="mt-4 space-y-4">
          {members.map((member) => (
            <div key={member.email} className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${member.color}`}
              >
                {member.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-[#34495B]">
                  {member.name}
                </p>
                <p className="truncate text-[9px] text-[#9AA7B5]">
                  {member.email}
                </p>
              </div>
              <span className="rounded-md bg-[#F2F5F7] px-2 py-1 text-[9px] font-semibold text-[#526678]">
                {member.permission}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-dashed border-[#B8DCC1] bg-[#F5FBF6] py-3 text-[11px] font-semibold text-[#168D34]">
          <Users size={14} /> Invite team member
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   EVENT CREATION PREVIEW
------------------------------------------------------- */

function EventPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E4EAF0] bg-white shadow-[0_24px_65px_rgba(16,43,70,0.12)]">
      <div className="relative h-[190px] overflow-hidden sm:h-[235px]">
        <img
          src={eventPhotos[0].src}
          alt={eventPhotos[0].alt}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#102B46]/85 via-[#102B46]/15 to-transparent" />

        <div className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-[9px] font-bold text-[#168D34]">
          EVENT PREVIEW
        </div>

        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-[9px] font-bold uppercase tracking-[1.5px] text-white/70">
            A day to remember
          </p>
          <h3 className="mt-1 text-xl font-bold text-white sm:text-2xl">
            The Wedding Celebration
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-white/85">
            <span className="flex items-center gap-1.5">
              <CalendarDays size={12} /> 24 October, 2026
            </span>
            <span className="flex items-center gap-1.5">
              <Users size={12} /> Private event
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#9AA7B5]">
            Event settings
          </p>
          <h3 className="mt-1 text-sm font-bold text-[#102B46]">
            Guest gallery access
          </h3>
          <p className="mt-1 max-w-[230px] text-[10px] leading-5 text-[#718096]">
            Choose how people can view the completed event gallery.
          </p>
          <div className="mt-3 flex items-center gap-2 text-[10px] font-semibold text-[#168D34]">
            <ShieldCheck size={13} /> Privacy settings
          </div>
        </div>

        <div className="flex w-[94px] flex-col items-center justify-center rounded-xl border border-[#E5EAF0] bg-[#FAFBFC] p-2 sm:w-[110px]">
          <div className="flex h-[62px] w-[62px] items-center justify-center rounded-lg bg-white text-[#102B46] sm:h-[70px] sm:w-[70px]">
            <QrCode size={58} strokeWidth={1.5} />
          </div>
          <span className="mt-2 text-[9px] font-bold text-[#102B46]">
            Event QR code
          </span>
          <span className="mt-0.5 text-[8px] text-[#9AA7B5]">
            Guest upload access
          </span>
        </div>
      </div>

      <div className="mx-4 mb-4 flex items-center justify-between rounded-lg bg-[#F5FBF6] px-3 py-3 sm:mx-5 sm:mb-5">
        <span className="flex items-center gap-2 text-[10px] font-semibold text-[#168D34]">
          <span className="h-2 w-2 rounded-full bg-[#20AD43]" />
          Event ready
        </span>
        <span className="text-[9px] text-[#718096]">Share with guests</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   SHARED GALLERY PREVIEW
------------------------------------------------------- */

function GalleryPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E4EAF0] bg-white shadow-[0_24px_65px_rgba(16,43,70,0.12)]">
      <div className="flex items-center justify-between border-b border-[#EDF1F4] px-4 py-4 sm:px-5">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#9AA7B5]">
            Shared event gallery
          </p>
          <h3 className="mt-1 text-sm font-bold text-[#102B46]">
            Wedding memories
          </h3>
        </div>
        <span className="rounded-full bg-[#EAF8EE] px-2.5 py-1 text-[9px] font-semibold text-[#168D34]">
          Event gallery
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-4">
        <div className="relative col-span-2 h-[155px] overflow-hidden rounded-xl sm:h-[200px]">
          <img
            src={eventPhotos[0].src}
            alt={eventPhotos[0].alt}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-3 left-3 text-white">
            <p className="text-[9px] font-medium text-white/75">
              24 October, 2026
            </p>
            <p className="mt-1 text-base font-bold">
              Moments worth keeping
            </p>
          </div>
        </div>

        {eventPhotos.slice(1).map((photo) => (
          <div
            key={photo.src}
            className="h-[100px] overflow-hidden rounded-xl sm:h-[125px]"
          >
            <img
              src={photo.src}
              alt={photo.alt}
              className="h-full w-full object-cover transition duration-500 hover:scale-105"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 pb-4 sm:px-5">
        <div className="flex -space-x-2">
          {["bg-[#F3C7A6]", "bg-[#D8E6F8]", "bg-[#D8EEDC]", "bg-[#EBDDF6]"].map(
            (color, index) => (
              <div
                key={index}
                className={`h-7 w-7 rounded-full border-2 border-white ${color}`}
              />
            )
          )}
        </div>
        <span className="text-[10px] font-semibold text-[#526678]">
          Shared by event guests
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   GUEST UPLOAD PREVIEW
------------------------------------------------------- */

function GuestJourneyPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/15 bg-white shadow-[0_24px_65px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between border-b border-[#EDF1F4] px-4 py-4">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#9AA7B5]">
            Guest upload experience
          </p>
          <h3 className="mt-1 text-sm font-bold text-[#102B46]">
            Add to the wedding gallery
          </h3>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF8EE] text-[#20AD43]">
          <Smartphone size={17} />
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-[0.85fr_1.15fr] sm:p-5">
        <div className="mx-auto w-full max-w-[190px] rounded-[25px] border-[5px] border-[#263C50] bg-[#F7F9FC] p-2">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#263C50]" />
          <div className="overflow-hidden rounded-xl">
            <img
              src={eventPhotos[1].src}
              alt="Event photo on a mobile screen"
              className="h-[105px] w-full object-cover"
            />
          </div>
          <p className="mt-3 text-center text-[10px] font-bold text-[#102B46]">
            Share your moment
          </p>
          <p className="mt-1 text-center text-[8px] leading-4 text-[#718096]">
            Add photos and videos to this event.
          </p>
          <div className="mt-3 rounded-lg bg-[#20AD43] py-2 text-center text-[9px] font-bold text-white">
            Add your photos
          </div>
          <div className="mt-2 rounded-lg border border-[#E5EAF0] py-2 text-center text-[9px] font-semibold text-[#526678]">
            Take a photo
          </div>
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-[#CBD3D9]" />
        </div>

        <div className="flex flex-col justify-center">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF8EE] text-[#20AD43]">
              <QrCode size={21} />
            </div>
            <div>
              <p className="text-xs font-bold text-[#102B46]">
                Scan the event QR
              </p>
              <p className="text-[10px] text-[#8796A4]">
                Open the guest upload page
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F2F5F7] text-[#526678]">
                <ImageIcon size={14} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#34495B]">
                  Choose photos
                </p>
                <p className="mt-1 text-[10px] leading-4 text-[#8796A4]">
                  Select pictures or videos already on your phone.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F2F5F7] text-[#526678]">
                <Video size={14} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#34495B]">
                  Capture a moment
                </p>
                <p className="mt-1 text-[10px] leading-4 text-[#8796A4]">
                  Use the browser camera to take a photo or video.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F2F5F7] text-[#526678]">
                <Upload size={14} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#34495B]">
                  Upload to the gallery
                </p>
                <p className="mt-1 text-[10px] leading-4 text-[#8796A4]">
                  Add your contribution to the event collection.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   FEATURE SECTION LAYOUT
------------------------------------------------------- */

function FeatureSection({
  id,
  number,
  eyebrow,
  title,
  description,
  benefits,
  actionTo,
  actionLabel,
  children,
  dark = false,
  reverse = false,
}: {
  id: string;
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  benefits: string[];
  actionTo: string;
  actionLabel: string;
  children: ReactNode;
  dark?: boolean;
  reverse?: boolean;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-28 px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24 ${
        dark ? "bg-[#102B46]" : "bg-white"
      }`}
    >
      <div
        className={`mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
          reverse ? "lg:[&>*:first-child]:order-2" : ""
        }`}
      >
        <div className="min-w-0">
          <SectionLabel number={number} label={eyebrow} light={dark} />

          <h2
            className={`mt-5 max-w-[550px] text-3xl font-extrabold leading-[1.16] tracking-[-1.5px] sm:text-4xl lg:text-[42px] ${
              dark ? "text-white" : "text-[#102B46]"
            }`}
          >
            {title}
          </h2>

          <p
            className={`mt-5 max-w-[540px] text-sm leading-7 sm:text-base ${
              dark ? "text-white/65" : "text-[#718096]"
            }`}
          >
            {description}
          </p>

          <FeatureBenefits items={benefits} />

          <FeatureAction to={actionTo}>{actionLabel}</FeatureAction>
        </div>

        <div className="min-w-0">
          {children}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------
   MAIN PAGE
------------------------------------------------------- */

export function FeaturesPage() {
  useHashScroll();

  const readAloudText =
    "IMARA has four main experiences. Digital Drive stores and organises files and folders. Business owners invite teammates and set folder-level access. Event organisers create an event and share its QR code. Guests scan the code, capture or choose photos and videos, and upload them to that event's collection. Gallery viewers see the media according to the organiser's privacy settings.";

  return (
    <PageShell
      eyebrow="THE IMARA PRODUCT"
      title="Everything you need to manage files, teams and event memories."
      description="Explore the four ways to use IMARA: organise documents, share business folders, create events and collect guest photos through QR-powered galleries."
    >
      <div className="w-full overflow-hidden">
        {/* Intro */}
        <section className="px-5 pb-10 pt-5 sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-6 border-b border-[#E8EDF1] pb-8 sm:flex-row sm:items-end">
            <div className="max-w-[650px]">
              <p className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#168D34]">
                EXPLORE IMARA
              </p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-[-1px] text-[#102B46] sm:text-3xl">
                Four experiences. One workspace.
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#718096]">
                See how each part of IMARA works, from your first document upload to the photos guests contribute at an event.
              </p>
            </div>
            <ReadAloudButton text={readAloudText} />
          </div>
        </section>

        {/* Feature navigation */}
        <div className="sticky top-[72px] z-30 border-y border-[#E8EDF1] bg-white/95 backdrop-blur-xl">
          <nav
            aria-label="Jump to a feature"
            className="mx-auto flex max-w-[1200px] gap-2 overflow-x-auto px-5 py-3 [scrollbar-width:none] sm:px-8 lg:px-10 [&::-webkit-scrollbar]:hidden"
          >
            {featureLinks.map(({ href, label, icon: Icon }, index) => (
              <a
                key={href}
                href={href}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-[#E7ECF0] bg-white px-3 py-2.5 text-[11px] font-semibold text-[#526678] transition hover:border-[#B9DFC2] hover:bg-[#F5FBF6] hover:text-[#168D34]"
              >
                <Icon size={14} className="text-[#20AD43]" />
                {label}
                {index === 0 && (
                  <ArrowDown size={11} className="ml-1 text-[#9AA7B5]" />
                )}
              </a>
            ))}
          </nav>
        </div>

        {/* 01 Digital Drive */}
        <FeatureSection
          id="digital-drive"
          number="01"
          eyebrow="DIGITAL DRIVE"
          title="Keep every important document in its place."
          description="Upload your documents, create folders and subfolders, and search by file name when you need something. Open supported files, download copies, and edit supported formats when your plan allows it."
          actionTo="/register"
          actionLabel="Start your Digital Drive"
          benefits={[
            "Upload files and organise them in nested folders.",
            "Search for files and folders by name.",
            "View and download supported documents.",
            "Rename, move or delete files and folders.",
          ]}
        >
          <DrivePreview />
        </FeatureSection>

        {/* 02 Sharing */}
        <FeatureSection
          id="file-sharing"
          number="02"
          eyebrow="FILE & FOLDER SHARING"
          title="Give each teammate access to the folders they need."
          description="Create a business workspace and invite staff by email. Share folders with workspace members and set permissions for viewing, uploading, editing supported files and downloading. Change or remove access when responsibilities change."
          actionTo="/register"
          actionLabel="Set up a business workspace"
          reverse
          benefits={[
            "Invite staff into your business workspace.",
            "Assign workspace roles to members.",
            "Control access with folder-level permissions.",
            "Update permissions or remove a member's access.",
          ]}
        >
          <SharingPreview />
        </FeatureSection>

        {/* Sharing scope note */}
        {/* <div className="px-5 pb-10 sm:px-8 lg:px-10">
          <aside className="mx-auto flex max-w-[1200px] items-start gap-3 rounded-xl border border-[#E5EAF0] bg-[#F7F9FC] p-4 sm:p-5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF8EE] text-[#168D34]">
              <ShieldCheck size={16} />
            </span>
            <div>
              <p className="text-xs font-bold text-[#102B46]">
                How sharing works in IMARA
              </p>
              <p className="mt-1 text-xs leading-6 text-[#718096]">
                Business content is shared through invited workspace members and folder permissions. Public share links for individual files in a personal Drive are not currently part of this workflow.
              </p>
            </div>
          </aside>
        </div> */}

        {/* 03 Event creation */}
        <FeatureSection
          id="event-qr"
          number="03"
          eyebrow="EVENT CREATION & QR CODE"
          title="Set up your event and give guests one QR code."
          description="Add an event name and date, then choose how people can access its finished gallery: private, by link or with a passcode. IMARA generates a unique guest-upload QR code and capture link for the event. Download or print the code for invitations, signs or tables."
          actionTo="/register"
          actionLabel="Create an event workspace"
          benefits={[
            "Add event details and choose gallery access settings.",
            "Generate a dedicated guest-upload QR code.",
            "Download or print the code for your event.",
            "View collected media and event storage use.",
          ]}
        >
          <EventPreview />
        </FeatureSection>

        {/* Event visual strip */}
        <section className="bg-[#F5F8F6] px-5 py-14 sm:px-8 lg:px-10">
          <div className="mx-auto grid max-w-[1200px] items-center gap-8 md:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#168D34]">
                MADE FOR REAL OCCASIONS
              </p>
              <h3 className="mt-3 text-2xl font-extrabold leading-tight tracking-[-1px] text-[#102B46] sm:text-3xl">
                Weddings, birthdays, celebrations and more.
              </h3>
              <p className="mt-4 text-sm leading-7 text-[#718096]">
                Set up an event gallery, share its QR code and let attendees contribute photos and videos from their phones.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {eventPhotos.slice(1).map((photo) => (
                <div
                  key={photo.src}
                  className="h-[125px] overflow-hidden rounded-xl sm:h-[180px]"
                >
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 hover:scale-105"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 04 Shared gallery */}
        <FeatureSection
          id="shared-gallery"
          number="04"
          eyebrow="QR-POWERED SHARED GALLERY"
          title="Collect the photos your guests take on their own phones."
          description="Guests scan the event QR code to open a mobile capture page—no app installation required. They can use the browser camera to take a photo or video, or select media already on their device. Their uploads go directly into that event's collection."
          actionTo="/how-it-works#event-journey"
          actionLabel="See the guest journey"
          reverse
          benefits={[
            "Scan the event QR code to open the guest page.",
            "Take photos and videos using the browser camera.",
            "Select existing media from a phone.",
            "Let organisers and authorised viewers revisit the collection.",
          ]}
        >
          <GalleryPreview />
        </FeatureSection>

        {/* Guest journey */}
        <section className="bg-[#102B46] px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionLabel number="GUEST FLOW" label="HOW UPLOADS WORK" light />
              <h2 className="mt-5 max-w-[500px] text-3xl font-extrabold leading-tight tracking-[-1.5px] text-white sm:text-4xl">
                No app installation. Just scan, capture and upload.
              </h2>
              <p className="mt-5 max-w-[480px] text-sm leading-7 text-white/65">
                The organiser shares the event QR code. Guests open the upload page in their phone browser, choose or capture their media, and submit it to the event collection.
              </p>

              <div className="mt-8 space-y-5">
                {[
                  ["01", "Scan the QR code", "Open the event's guest upload page."],
                  ["02", "Take or select media", "Use the camera or choose existing photos and videos."],
                  ["03", "Upload to the event", "Add the contribution to the shared collection."],
                ].map(([number, title, detail]) => (
                  <div key={number} className="flex items-start gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-xs font-bold text-emerald-300">
                      {number}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-white/55">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                to="/how-it-works#event-journey"
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#20AD43] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#199438]"
              >
                View the full process <ArrowRight size={15} />
              </Link>
            </div>

            <div className="min-w-0">
              <GuestJourneyPreview />
            </div>
          </div>
        </section>

        {/* Plans */}
        <section className="px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
          <div className="mx-auto grid max-w-[1100px] items-center gap-6 rounded-2xl border border-[#E5EAF0] bg-[#F7F9FC] p-6 sm:p-9 md:grid-cols-[1fr_auto]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#168D34]">
                PLANS & CAPACITY
              </p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-[-1px] text-[#102B46] sm:text-3xl">
                Choose the capacity your workspace needs.
              </h2>
              <p className="mt-3 max-w-[650px] text-sm leading-7 text-[#718096]">
                Storage and active-event allowances depend on your subscription. Check the current plan limits before choosing the right option for your files, team and events.
              </p>
            </div>
            <Link
              to="/pricing"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#102B46] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1B4569]"
            >
              Compare plans <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        {/* CTA */}
        <section className="px-5 pb-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1200px]">
            <MarketingCTA
              title="Bring your files and event memories into IMARA."
              description="Create an account to organise documents, invite business teammates and build QR-powered event galleries."
            />
          </div>
        </section>

        <div className="pb-10 text-center">
          <Link
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#168D34] transition hover:gap-3"
            to="/how-it-works"
          >
            Explore how IMARA works <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

export default FeaturesPage;
