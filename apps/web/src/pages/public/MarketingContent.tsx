import { useEffect, useLayoutEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpFromLine,
  CalendarDays,
  Check,
  ChevronRight,
  CircleStop,
  FileText,
  Folder,
  Image,
  LockKeyhole,
  Mail,
  Search,
  ShieldCheck,
  Smartphone,
  Users,
  Video,
  Volume2,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import "./ProductDemos.css";

export type ProductDemoType = "drive" | "sharing" | "event" | "gallery";

export function useHashScroll() {
  const { hash } = useLocation();

  useLayoutEffect(() => {
    const targetId = hash.slice(1);
    if (!targetId) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    document.getElementById(targetId)?.scrollIntoView({ behavior, block: "start" });
  }, [hash]);
}

const qrPattern = [
  "1111111001001",
  "1000001010110",
  "1011101011001",
  "1011101000110",
  "1011101011011",
  "1000001001100",
  "1111111010101",
  "0000000011110",
  "1101011100011",
  "0110100011100",
  "1011011101011",
  "0100110010110",
  "1110001011001",
];

export function ReadAloudButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function toggleSpeech() {
    setError("");
    if (!("speechSynthesis" in window)) {
      setError("Read-aloud is not available in this browser. Try your device’s built-in screen reader.");
      return;
    }

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = (event) => {
      setSpeaking(false);
      if (event.error !== "canceled" && event.error !== "interrupted") {
        setError("The page could not be read aloud. Please try again.");
      }
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <div className="read-aloud-control">
      <button className="read-aloud-button" type="button" onClick={toggleSpeech} aria-pressed={speaking}>
        {speaking ? <CircleStop size={17} /> : <Volume2 size={17} />}
        {speaking ? "Stop reading" : "Read this page aloud"}
      </button>
      {error && <span role="alert" className="read-aloud-error">{error}</span>}
    </div>
  );
}

export function FeatureStory({
  eyebrow,
  title,
  description,
  image,
  imageAlt,
  demo,
  id,
  reverse = false,
  spotlight = false,
  benefits,
  actionTo = "/register",
  actionLabel = "Create a free account",
}: {
  eyebrow: string;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  demo?: ProductDemoType;
  id?: string;
  reverse?: boolean;
  spotlight?: boolean;
  benefits: string[];
  actionTo?: string;
  actionLabel?: string;
}) {
  return (
    <section id={id} className={`feature-story${reverse ? " feature-story-reverse" : ""}${spotlight ? " feature-story-spotlight" : ""}`}>
      {demo && <ProductDemo type={demo} />}
      {image && <img className="feature-story-image" src={image} alt={imageAlt ?? ""} loading="lazy" decoding="async" />}
      <div className="feature-story-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <ul>
          {benefits.map((benefit) => (
            <li key={benefit}><Check size={16} aria-hidden="true" />{benefit}</li>
          ))}
        </ul>
        <Link className="feature-story-link" to={actionTo}>
          {actionLabel} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function ProductDemoFrame({ children, label, compact = false }: { children: ReactNode; label: string; compact?: boolean }) {
  return (
    <figure className={`product-demo${compact ? " product-demo-compact" : ""}`}>
      <div className="product-demo-label">
        <span><span className="product-demo-live-dot" /> IMARA interface preview</span>
        <span>Example content</span>
      </div>
      {children}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function DriveDemo({ compact }: { compact: boolean }) {
  return (
    <ProductDemoFrame compact={compact} label="Illustrative screen based on the current file and folder workflow.">
      <div className="demo-window">
        <div className="demo-window-bar">
          <span className="demo-window-dots"><i /><i /><i /></span>
          <span className="demo-window-title">IMARA <b>/</b> Your files</span>
          <span className="demo-upload"><ArrowUpFromLine size={12} /> Upload</span>
        </div>
        <div className="demo-workspace">
          <aside className="demo-sidebar">
            <span className="demo-brand"><span>i</span> IMARA</span>
            <span className="demo-sidebar-active"><Folder size={13} /> Your files</span>
            <span><Users size={13} /> Shared folders</span>
            <span><CalendarDays size={13} /> Events</span>
          </aside>
          <div className="demo-main">
            <div className="demo-search"><Search size={12} /> Search files and folders</div>
            <div className="demo-breadcrumb">Your files <ChevronRight size={12} /> Operations</div>
            <div className="demo-heading-row"><strong>Operations</strong><span>New folder</span></div>
            <div className="demo-file-row demo-file-header"><span>Name</span><span>Type</span><span>Action</span></div>
            <div className="demo-file-row"><span><Folder size={14} /> Client records</span><small>Folder</small><span className="demo-file-action">Open</span></div>
            <div className="demo-file-row"><span><Folder size={14} /> Finance</span><small>Folder</small><span className="demo-file-action">Open</span></div>
            <div className="demo-file-row"><span><FileText size={14} /> Service agreement.pdf</span><small>PDF</small><span className="demo-file-action">View</span></div>
            <div className="demo-file-row"><span><FileText size={14} /> Q3 budget.xlsx</span><small>Sheet</small><span className="demo-file-action">View</span></div>
            <div className="demo-storage"><span>Workspace storage</span><span><i /></span><small>Plan allowance shown in your account</small></div>
          </div>
        </div>
      </div>
    </ProductDemoFrame>
  );
}

function SharingDemo({ compact }: { compact: boolean }) {
  return (
    <ProductDemoFrame compact={compact} label="Illustrative workspace invitation and folder-permission controls.">
      <div className="demo-window">
        <div className="demo-window-bar">
          <span className="demo-window-dots"><i /><i /><i /></span>
          <span className="demo-window-title">Business workspace <b>/</b> Shared folders</span>
          <span className="demo-invite"><Mail size={12} /> Invite</span>
        </div>
        <div className="sharing-demo-content">
          <div className="sharing-folder-card">
            <span className="sharing-folder-icon"><Folder size={19} /></span>
            <div><strong>Project files</strong><small>Folder shared with your workspace team</small></div>
            <span className="sharing-access-tag"><ShieldCheck size={12} /> Access controlled</span>
          </div>
          <div className="sharing-demo-columns">
            <div className="sharing-member-list">
              <span className="demo-section-label">WORKSPACE MEMBERS</span>
              <div><span className="demo-avatar demo-avatar-green">AM</span><span><b>Alex Morgan</b><small>Manager</small></span><Check size={14} /></div>
              <div><span className="demo-avatar demo-avatar-blue">JO</span><span><b>Jordan Okafor</b><small>Staff member</small></span><Check size={14} /></div>
              <div className="sharing-add-member"><Users size={14} /> Invite another teammate</div>
            </div>
            <div className="sharing-permission-card">
              <span className="demo-section-label">FOLDER ACCESS · PROJECT FILES</span>
              <span><Check size={13} /> View folder &amp; files</span>
              <span><Check size={13} /> Upload files</span>
              <span><Check size={13} /> Edit supported files</span>
              <span className="sharing-permission-note"><LockKeyhole size={12} /> Permission changes apply to this folder</span>
            </div>
          </div>
        </div>
      </div>
    </ProductDemoFrame>
  );
}

function EventDemo({ compact }: { compact: boolean }) {
  return (
    <ProductDemoFrame compact={compact} label="Example event and decorative QR preview; this code is not scannable.">
      <div className="event-demo-window">
        <div className="event-demo-form">
          <div className="demo-window-bar">
            <span className="demo-window-dots"><i /><i /><i /></span>
            <span className="demo-window-title">IMARA <b>/</b> New event</span>
          </div>
          <span className="demo-section-label">EVENT DETAILS</span>
          <strong className="event-demo-title">Maya &amp; Sam’s wedding</strong>
          <div className="event-demo-field"><CalendarDays size={13} /> 18 October · 2:00 PM</div>
          <span className="demo-section-label">GALLERY ACCESS</span>
          <div className="event-demo-access"><LockKeyhole size={13} /><span><b>Passcode protected</b><small>Choose who can view the finished gallery</small></span><Check size={14} /></div>
          <span className="event-demo-created"><Check size={12} /> Event ready</span>
        </div>
        <div className="event-demo-qr-panel">
          <span className="demo-section-label">GUEST UPLOADS</span>
          <div className="event-demo-qr" aria-hidden="true">
            {qrPattern.join("").split("").map((cell, index) => <i className={cell === "1" ? "is-filled" : ""} key={index} />)}
          </div>
          <strong>One QR for this event</strong>
          <small>Download or print it for guests</small>
          <span className="event-demo-qr-note">Illustration only · not scannable</span>
        </div>
      </div>
    </ProductDemoFrame>
  );
}

const gallerySteps = [
  { number: "01", label: "Scan" },
  { number: "02", label: "Capture" },
  { number: "03", label: "Upload" },
  { number: "04", label: "Collect" },
];

function GalleryDemo({ compact }: { compact: boolean }) {
  return (
    <ProductDemoFrame compact={compact} label="A visual walkthrough of the attendee capture flow and event gallery.">
      <div className="gallery-demo">
        {gallerySteps.map(({ number, label }) => (
          <div className="gallery-demo-step" key={number}>
            <div className="gallery-demo-step-heading"><span>{number}</span><b>{label}</b></div>
            <div className="demo-phone">
              <div className="demo-phone-speaker" />
              <div className={`demo-phone-screen demo-phone-screen-${number}`}>
                {number === "01" && <>
                  <span className="phone-brand">IMARA <i>EVENT</i></span>
                  <div className="phone-scan-view"><div className="phone-scan-mark"><span /><span /><span /><span /></div><div className="phone-fake-qr"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
                  <small>Point your camera at the event QR</small>
                </>}
                {number === "02" && <>
                  <span className="phone-camera-label"><CameraGlyph /> Maya &amp; Sam’s wedding</span>
                  <div className="phone-camera-view"><div className="phone-scene-sun" /><div className="phone-scene-hill" /></div>
                  <div className="phone-camera-controls"><span /><i /><span><Video size={10} /></span></div>
                </>}
                {number === "03" && <>
                  <span className="phone-brand">Add to event</span>
                  <div className="phone-upload-image"><Image size={20} /></div>
                  <span className="phone-upload-file">Reception-photo.jpg</span>
                  <div className="phone-upload-progress"><i /></div>
                  <small><Check size={10} /> Added to the collection</small>
                </>}
                {number === "04" && <>
                  <span className="phone-brand">The shared gallery</span>
                  <div className="phone-gallery-grid"><i /><i /><i /><i /></div>
                  <div className="phone-gallery-footer"><Image size={11} /> Moments from your guests</div>
                </>}
              </div>
              <div className="demo-phone-home" />
            </div>
            <p>{number === "01" ? "Open the event camera" : number === "02" ? "Take a photo or video" : number === "03" ? "Upload captured or selected media" : "View the collected event memories"}</p>
          </div>
        ))}
      </div>
      <div className="gallery-demo-note"><ShieldCheck size={14} /> Gallery visibility follows the organiser’s private, link, or passcode setting.</div>
    </ProductDemoFrame>
  );
}

function CameraGlyph() {
  return <Smartphone size={11} aria-hidden="true" />;
}

export function ProductDemo({ type, compact = false }: { type: ProductDemoType; compact?: boolean }) {
  if (type === "drive") return <DriveDemo compact={compact} />;
  if (type === "sharing") return <SharingDemo compact={compact} />;
  if (type === "event") return <EventDemo compact={compact} />;
  return <GalleryDemo compact={compact} />;
}

export function MarketingCTA({ title, description }: { title: string; description: string }) {
  return (
    <section className="marketing-cta">
      <div>
        <span className="eyebrow">Start with the essentials</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <Link to="/register" className="button button-green">
        Get started free <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
