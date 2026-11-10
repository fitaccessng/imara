import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  Copy,
  Download,
  ExternalLink,
  Image,
  LockKeyhole,
  Plus,
  Printer,
  RotateCcw,
  RefreshCw,
  ShieldCheck,
  SwitchCamera,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError, apiBlob, apiRequest, downloadFile } from "../lib/api";
import { ActionModal, type ActionModalRequest } from "../components/ActionModal";
import { BrandIdentity, BrandMark } from "../components/BrandLockup";
import { PlanLimitMessage } from "../components/PlanLimitMessage";

type GallerySetting = "PRIVATE" | "LINK_PUBLIC" | "PASSCODE";
const MAX_EVENT_CAPTURE_BYTES = 25 * 1024 * 1024;

interface EventStorage {
  capBytes: string;
  usedBytes: string;
  reservedBytes: string;
  availableBytes: string;
}

interface ImaraEvent {
  id: string;
  name: string;
  date: string;
  description: string | null;
  gallerySetting: GallerySetting;
  folderId: string;
  storage: EventStorage;
  createdAt: string;
  updatedAt: string;
}

interface EventMedia {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
}

interface EventTokens {
  captureToken: string;
  galleryToken: string;
}

interface EventCreated {
  event: ImaraEvent;
  tokens: EventTokens;
}

interface EventMediaList {
  event: { id: string; name: string; date: string; description: string | null };
  media: EventMedia[];
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function addEventStorageUsage(event: ImaraEvent, sizeBytes: string): ImaraEvent {
  const size = BigInt(sizeBytes);
  return {
    ...event,
    storage: {
      ...event.storage,
      usedBytes: (BigInt(event.storage.usedBytes) + size).toString(),
      availableBytes: (BigInt(event.storage.availableBytes) - size).toString(),
    },
  };
}

function formatBytes(raw: string | number) {
  const bytes = Number(raw);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** unit;
  return `${amount >= 10 || unit === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`;
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function eventDateInputValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function EventHeader({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading event-page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}<span className="heading-period">.</span></h1>
        <p className="page-subtitle">{detail}</p>
      </div>
      {action}
    </header>
  );
}

function EventEmptyState() {
  return (
    <section className="event-empty-state">
      <div className="event-empty-mark"><CalendarDays size={23} /></div>
      <h2>Your event stories start here.</h2>
      <p>Create an event to collect photos and videos from guests with one scannable QR code.</p>
      <Link to="/events/new" className="button button-green"><Plus size={16} /> Create your first event</Link>
    </section>
  );
}

export function EventsPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiRequest<ImaraEvent[]>("/events"),
  });

  return (
    <div className="events-page">
      <EventHeader
        eyebrow="COLLECT TOGETHER"
        title="Your events"
        detail="One QR code for every moment your guests capture."
        action={<Link className="button button-green" to="/events/new"><Plus size={16} /> Create event</Link>}
      />
      {isLoading && <div className="page-loading"><span className="loader" />Loading your events…</div>}
      {isError && (
        <div className="inline-error" role="alert">
          <div><strong>Events could not load.</strong><p>{errorMessage(error, "Please try again.")}</p></div>
          <button className="button button-outline button-small" onClick={() => void refetch()}>Try again</button>
        </div>
      )}
      {!isLoading && !isError && data?.length === 0 && <EventEmptyState />}
      {Boolean(data?.length) && (
        <section className="event-grid" aria-label="Your events">
          {data?.map((event) => {
            const used = Number(event.storage.usedBytes) + Number(event.storage.reservedBytes);
            const cap = Number(event.storage.capBytes);
            const percent = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
            return (
              <Link className="event-card" to={`/events/${event.id}`} key={event.id}>
                <div className="event-card-top">
                  <span className="event-card-icon"><CalendarDays size={19} /></span>
                  <span className={`event-access-chip event-access-${event.gallerySetting.toLowerCase()}`}>
                    {event.gallerySetting === "PRIVATE" ? "Private" : event.gallerySetting === "PASSCODE" ? "Passcode" : "Link access"}
                  </span>
                </div>
                <h2>{event.name}</h2>
                <p className="event-card-date">{formatEventDate(event.date)}</p>
                <div className="event-card-storage">
                  <div className="event-storage-label"><span>Event storage</span><strong>{formatBytes(used)} / {formatBytes(cap)}</strong></div>
                  <div className="event-progress"><span style={{ width: `${percent}%` }} /></div>
                </div>
                <span className="event-card-open">Manage event <ArrowRight size={14} /></span>
              </Link>
            );
          })}
        </section>
      )}
      <aside className="event-plan-note"><ShieldCheck size={16} /> Each event cap is set from the storage available on your plan when you create it.</aside>
    </div>
  );
}

export function CreateEventPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [date, setDate] = useState(eventDateInputValue);
  const [description, setDescription] = useState("");
  const [gallerySetting, setGallerySetting] = useState<GallerySetting>("PRIVATE");
  const [passcode, setPasscode] = useState("");
  const [formError, setFormError] = useState("");

  const createEvent = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest<EventCreated>("/events", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    onSuccess: async (created) => {
      queryClient.setQueryData(["event-tokens", created.event.id], created.tokens);
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate(`/events/${created.event.id}`);
    },
    onError: (error) => setFormError(errorMessage(error, "Could not create this event.")),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (gallerySetting === "PASSCODE" && passcode.length < 8) {
      setFormError("Use at least 8 characters for the gallery passcode.");
      return;
    }
    void createEvent.mutateAsync({
      name: name.trim(),
      date: new Date(date).toISOString(),
      description: description.trim() || undefined,
      gallerySetting,
      ...(gallerySetting === "PASSCODE" ? { passcode } : {}),
    }).catch(() => undefined);
  }

  return (
    <div className="events-page">
      <Link to="/events" className="event-back-link"><ArrowLeft size={15} /> All events</Link>
      <EventHeader eyebrow="NEW COLLECTION" title="Create an event" detail="Set up a shared camera roll for the people who are there." />
      <div className="event-create-layout">
        <form className="event-form-card" onSubmit={submit}>
          <label className="event-field">
            <span>Event name</span>
            <input autoFocus maxLength={160} required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Maya & Sam’s wedding" />
          </label>
          <label className="event-field">
            <span>Date and time</span>
            <input type="datetime-local" required value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="event-field">
            <span>Description <em>Optional</em></span>
            <textarea maxLength={4000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short note for your guests" />
          </label>

          <div className="event-form-divider" />
          <div className="event-form-section-title">
            <div><span className="eyebrow">AFTER THE EVENT</span><h2>Gallery access</h2></div>
            <p>You can change this any time.</p>
          </div>
          <div className="event-access-options">
            <button type="button" className={`event-access-option ${gallerySetting === "PRIVATE" ? "selected" : ""}`} onClick={() => setGallerySetting("PRIVATE")}>
              <LockKeyhole size={17} /><span><strong>Private</strong><small>Only you can see the collection.</small></span>{gallerySetting === "PRIVATE" && <Check size={16} />}
            </button>
            <button type="button" className={`event-access-option ${gallerySetting === "LINK_PUBLIC" ? "selected" : ""}`} onClick={() => setGallerySetting("LINK_PUBLIC")}>
              <ExternalLink size={17} /><span><strong>Anyone with the link</strong><small>Guests can view and download.</small></span>{gallerySetting === "LINK_PUBLIC" && <Check size={16} />}
            </button>
            <button type="button" className={`event-access-option ${gallerySetting === "PASSCODE" ? "selected" : ""}`} onClick={() => setGallerySetting("PASSCODE")}>
              <ShieldCheck size={17} /><span><strong>Passcode protected</strong><small>Share the gallery link and passcode.</small></span>{gallerySetting === "PASSCODE" && <Check size={16} />}
            </button>
          </div>
          {gallerySetting === "PASSCODE" && (
            <label className="event-field">
              <span>Gallery passcode</span>
              <input autoComplete="new-password" minLength={8} maxLength={128} required type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} placeholder="At least 8 characters" />
            </label>
          )}
          {formError && <p className="form-alert" role="alert"><PlanLimitMessage message={formError} /></p>}
          <p className="event-form-hint"><ShieldCheck size={15} /> Your event cap uses the remaining storage on your current plan. Uploads also count toward your account quota.</p>
          <div className="event-form-actions">
            <Link to="/events" className="button button-outline">Cancel</Link>
            <button className="button button-green" type="submit" disabled={createEvent.isPending || !name.trim()}>
              {createEvent.isPending ? "Creating…" : "Create event"}{!createEvent.isPending && <ArrowRight size={15} />}
            </button>
          </div>
        </form>
        <aside className="event-create-aside">
          <div className="event-aside-illustration"><div className="event-aside-sun" /><div className="event-aside-photo photo-one" /><div className="event-aside-photo photo-two" /><div className="event-aside-ring"><Camera size={24} /></div></div>
          <span className="eyebrow">A MOMENT, SHARED</span>
          <h2>One scan.<br />Everyone’s point of view.</h2>
          <p>After creating your event, download or print its QR code. Guests scan it to add photos and videos from their phone.</p>
        </aside>
      </div>
    </div>
  );
}

function EventMediaCard({
  eventId,
  galleryToken,
  media,
  endpoint,
  authorization,
}: {
  eventId?: string;
  galleryToken?: string;
  media: EventMedia;
  endpoint: "owner" | "gallery";
  authorization?: string;
}) {
  const path = endpoint === "owner"
    ? `/events/${eventId}/media/${media.id}/download`
    : `/events/gallery/${galleryToken}/media/${media.id}/download`;
  const authHeader = authorization ? { Authorization: `Bearer ${authorization}` } : undefined;
  const [downloadError, setDownloadError] = useState("");
  const [imageExpanded, setImageExpanded] = useState(false);
  const previewQuery = useQuery({
    queryKey: ["event-media-preview", path, authorization],
    queryFn: () => apiBlob(path, authHeader),
  });
  const [previewUrl, setPreviewUrl] = useState("");
  const isVideo = media.mimeType.startsWith("video/");

  useEffect(() => {
    if (!previewQuery.data) return;
    const url = URL.createObjectURL(previewQuery.data);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewQuery.data]);

  async function handleDownload() {
    setDownloadError("");
    try {
      await downloadFile(path, media.name, authHeader);
    } catch (error) {
      setDownloadError(errorMessage(error, "Unable to download this media."));
    }
  }

  if (!path) return null;
  return (
    <article className="event-media-card">
      <div className="event-media-preview">
        {previewQuery.isLoading && <span className="loader" />}
        {previewQuery.isError && <div className="event-media-unavailable"><Image size={20} /><span>Preview unavailable: {errorMessage(previewQuery.error, "Unable to load media.")}</span><button type="button" onClick={() => void previewQuery.refetch()}>Try again</button></div>}
        {previewUrl && (isVideo
          ? <video src={previewUrl} controls preload="metadata" />
          : <button className="event-media-image-open" type="button" onClick={() => setImageExpanded(true)} aria-label={`View ${media.name}`}>
              <img src={previewUrl} alt={media.name} loading="lazy" />
            </button>)}
      </div>
      <div className="event-media-meta">
        <div><strong title={media.name}>{media.name}</strong><span>{formatBytes(media.sizeBytes)} · {formatEventDate(media.createdAt)}</span></div>
        <button
          className="icon-button"
          title="Download media"
          aria-label={`Download ${media.name}`}
          onClick={() => void handleDownload()}
        ><Download size={16} /></button>
      </div>
      {downloadError && <p className="event-media-error" role="alert">{downloadError}</p>}
      {imageExpanded && previewUrl && (
        <div className="event-image-lightbox" role="dialog" aria-modal="true" aria-label={media.name} onClick={() => setImageExpanded(false)}>
          <button className="event-image-lightbox-close" type="button" aria-label="Close image preview" onClick={() => setImageExpanded(false)}><X size={20} /></button>
          <img src={previewUrl} alt={media.name} onClick={(click) => click.stopPropagation()} />
          <span>{media.name}</span>
        </div>
      )}
    </article>
  );
}

export function EventDetailPage() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tokensQuery = useQuery<EventTokens | null>({
    queryKey: ["event-tokens", eventId],
    queryFn: async () => null,
    initialData: null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const tokens = tokensQuery.data;
  const [gallerySetting, setGallerySetting] = useState<GallerySetting>("PRIVATE");
  const [passcode, setPasscode] = useState("");
  const [feedback, setFeedback] = useState("");
  const [actionModal, setActionModal] = useState<ActionModalRequest | null>(null);
  const qrCanvas = useRef<HTMLCanvasElement>(null);
  const eventQuery = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiRequest<ImaraEvent>(`/events/${eventId}`),
    enabled: Boolean(eventId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const mediaQuery = useQuery({
    queryKey: ["event-media", eventId],
    queryFn: () => apiRequest<EventMedia[]>(`/events/${eventId}/media`),
    enabled: Boolean(eventId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  const event = eventQuery.data;

  useEffect(() => {
    if (event) setGallerySetting(event.gallerySetting);
  }, [event?.id, event?.gallerySetting]);

  const updateGallery = useMutation({
    mutationFn: () => apiRequest<ImaraEvent>(`/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify({
        gallerySetting,
        ...(gallerySetting === "PASSCODE" && passcode ? { passcode } : {}),
      }),
    }),
    onSuccess: async () => {
      setPasscode("");
      setFeedback("Gallery access updated.");
      await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    },
    onError: (error) => setFeedback(errorMessage(error, "Could not update gallery access.")),
  });
  const rotateTokens = useMutation({
    mutationFn: () => apiRequest<EventTokens>(`/events/${eventId}/rotate-tokens`, { method: "POST" }),
    onSuccess: (newTokens) => {
      queryClient.setQueryData(["event-tokens", eventId], newTokens);
      setFeedback("New QR and gallery links are ready. Previous links have been disabled.");
    },
    onError: (error) => setFeedback(errorMessage(error, "Could not generate new links.")),
  });
  const deleteEvent = useMutation({
    mutationFn: () => apiRequest<void>(`/events/${eventId}`, { method: "DELETE" }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["event-tokens", eventId], exact: true });
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate("/events", { replace: true });
    },
    onError: (error) => setFeedback(errorMessage(error, "Could not delete the event.")),
  });

  if (eventQuery.isLoading) return <div className="page-loading"><span className="loader" />Loading event…</div>;
  if (eventQuery.isError || !event) {
    return <div className="inline-error" role="alert"><div><strong>Event unavailable.</strong><p>{errorMessage(eventQuery.error, "This event could not be loaded.")}</p></div><Link to="/events" className="button button-outline button-small">All events</Link></div>;
  }

  const publicAppUrl = (import.meta.env.VITE_PUBLIC_APP_URL ?? window.location.origin).replace(/\/+$/, "");
  const captureUrl = tokens ? `${publicAppUrl}/capture/${tokens.captureToken}` : "";
  const galleryUrl = tokens ? `${publicAppUrl}/gallery/${tokens.galleryToken}` : "";
  const eventName = event.name;
  const used = Number(event.storage.usedBytes) + Number(event.storage.reservedBytes);
  const cap = Number(event.storage.capBytes);
  const percent = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;

  async function copyLink(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} copied.`);
    } catch {
      setFeedback("Clipboard access is unavailable in this browser.");
    }
  }

  function downloadQr() {
    const canvas = qrCanvas.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${eventName.trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-event-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function saveGallerySettings(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    setFeedback("");
    if (gallerySetting === "PASSCODE" && passcode && passcode.length < 8) {
      setFeedback("Use at least 8 characters for the gallery passcode.");
      return;
    }
    void updateGallery.mutateAsync().catch(() => undefined);
  }

  return (
    <div className="events-page">
      <Link to="/events" className="event-back-link"><ArrowLeft size={15} /> All events</Link>
      <EventHeader eyebrow="EVENT COLLECTION" title={event.name} detail={formatEventDate(event.date)} />

      <section className="event-detail-summary">
        <div className="event-detail-stat"><span>COLLECTED</span><strong>{mediaQuery.data?.length ?? 0} <small>items</small></strong></div>
        <div className="event-detail-stat"><span>STORAGE USED</span><strong>{formatBytes(used)} <small>of {formatBytes(cap)}</small></strong></div>
        <div className="event-detail-quota"><div className="event-progress"><span style={{ width: `${percent}%` }} /></div><small>{formatBytes(event.storage.availableBytes)} available</small></div>
        <span className={`event-access-chip event-access-${event.gallerySetting.toLowerCase()}`}>
          {event.gallerySetting === "PRIVATE" ? "Private gallery" : event.gallerySetting === "PASSCODE" ? "Passcode protected" : "Link accessible"}
        </span>
      </section>

      {event.description && <p className="event-detail-description">{event.description}</p>}
      {feedback && <p className="form-alert event-feedback" role="status">{feedback}</p>}

      <div className="event-detail-grid">
        <section className="event-panel event-qr-print">
          <div className="event-panel-heading"><div><span className="eyebrow">GUEST UPLOADS</span><h2>Share your event QR</h2></div><span className="event-panel-icon"><Camera size={17} /></span></div>
          {tokens ? (
            <div className="event-qr-layout">
              <div className="event-qr-canvas"><QRCodeCanvas ref={qrCanvas} value={captureUrl} size={220} level="M" includeMargin bgColor="#ffffff" fgColor="#102b46" /></div>
              <div className="event-qr-details">
                <h3>Ready to collect</h3>
                <p>Guests scan the code to open their camera, capture photos or videos, and add them to your collection.</p>
                {!captureUrl.startsWith("https://") && <p className="event-https-warning" role="status">Phone camera access requires HTTPS. Set VITE_PUBLIC_APP_URL to your secure public app URL before sharing this QR code.</p>}
                <div className="event-qr-url">{captureUrl}</div>
                <div className="event-inline-actions">
                  <button className="button button-green" onClick={downloadQr}><Download size={15} /> Download QR</button>
                  <button className="button button-outline" onClick={() => window.print()}><Printer size={15} /> Print</button>
                </div>
                <button className="event-text-action" onClick={() => void copyLink(captureUrl, "Capture link")}><Copy size={14} /> Copy upload link</button>
              </div>
            </div>
          ) : (
            <div className="event-token-missing">
              <p>For security, event links are kept only in memory during this app session. Generate new links to show a fresh QR code.</p>
              <button className="button button-outline" disabled={rotateTokens.isPending} onClick={() => setActionModal({
                title: "Generate new event links",
                description: "Any previously printed QR code will stop working when you generate new links.",
                confirmLabel: "Generate new links",
                onConfirm: async () => {
                  await rotateTokens.mutateAsync();
                  setActionModal(null);
                  return;
                },
              })}><RefreshCw size={15} /> Generate a new QR</button>
            </div>
          )}
        </section>

        <section className="event-panel">
          <div className="event-panel-heading"><div><span className="eyebrow">GALLERY SETTINGS</span><h2>Choose who can view</h2></div><span className="event-panel-icon"><ShieldCheck size={17} /></span></div>
          <form className="event-gallery-form" onSubmit={saveGallerySettings}>
            <label className="event-field"><span>Access</span>
              <select value={gallerySetting} onChange={(change) => setGallerySetting(change.target.value as GallerySetting)}>
                <option value="PRIVATE">Private — only you</option>
                <option value="LINK_PUBLIC">Anyone with the gallery link</option>
                <option value="PASSCODE">Passcode protected</option>
              </select>
            </label>
            {gallerySetting === "PASSCODE" && (
              <label className="event-field"><span>{event.gallerySetting === "PASSCODE" ? "Change passcode (optional)" : "Passcode"}</span>
                <input autoComplete="new-password" minLength={8} maxLength={128} type="password" value={passcode} onChange={(change) => setPasscode(change.target.value)} placeholder={event.gallerySetting === "PASSCODE" ? "Leave blank to keep current" : "At least 8 characters"} />
              </label>
            )}
            <p className="event-form-hint"><LockKeyhole size={14} /> Private is the default. Changing access invalidates previous gallery unlocks.</p>
            <button className="button button-green" type="submit" disabled={updateGallery.isPending || (gallerySetting === "PASSCODE" && event.gallerySetting !== "PASSCODE" && passcode.length < 8)}>
              {updateGallery.isPending ? "Saving…" : "Save gallery access"}
            </button>
          </form>
          {tokens && event.gallerySetting !== "PRIVATE" && (
            <div className="event-share-link">
              <span>GALLERY LINK</span>
              <div><code>{galleryUrl}</code><button aria-label="Copy gallery link" className="icon-button" onClick={() => void copyLink(galleryUrl, "Gallery link")}><Copy size={15} /></button></div>
              <a className="button button-outline event-open-gallery" href={galleryUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open shared gallery</a>
              {event.gallerySetting === "PASSCODE" && <small>Share the passcode separately. It is not shown again after leaving this page.</small>}
            </div>
          )}
          {!tokens && event.gallerySetting !== "PRIVATE" && <p className="event-form-hint">Regenerate the event links to reveal the current gallery link. Previous links will stop working.</p>}
        </section>
      </div>

      <section className="event-panel event-media-section">
        <div className="event-panel-heading"><div><span className="eyebrow">THE COLLECTION</span><h2>Photos and videos</h2></div>
          <span className="event-media-count">{mediaQuery.data?.length ?? 0} items</span>
        </div>
        {mediaQuery.isLoading && <div className="page-loading"><span className="loader" />Loading event media…</div>}
        {mediaQuery.isError && <div className="inline-error" role="alert"><div><strong>Media could not load.</strong><p>{errorMessage(mediaQuery.error, "Please try again.")}</p></div><button className="button button-outline button-small" onClick={() => void mediaQuery.refetch()}>Try again</button></div>}
        {mediaQuery.data?.length === 0 && <div className="event-media-empty"><Image size={21} /><p>Photos and videos from your guests will appear here.</p>{tokens && <span>Share the QR code to start collecting.</span>}</div>}
        {Boolean(mediaQuery.data?.length) && (
          <div className="event-media-grid">
            {mediaQuery.data?.map((media) => <EventMediaCard key={media.id} eventId={eventId} media={media} endpoint="owner" />)}
          </div>
        )}
      </section>

      <section className="event-danger-zone">
        <div><strong>Delete this event</strong><p>The event, QR codes, uploaded media, and gallery will be permanently removed.</p></div>
        <button className="button button-outline event-delete-button" disabled={deleteEvent.isPending} onClick={() => setActionModal({
          title: "Delete event",
          description: `Permanently delete “${event.name}” and all of its media? This cannot be undone.`,
          confirmLabel: "Delete event",
          danger: true,
          onConfirm: async () => {
            await deleteEvent.mutateAsync();
            setActionModal(null);
          },
        })}><Trash2 size={15} /> Delete event</button>
      </section>
      {actionModal && <ActionModal request={actionModal} onClose={() => setActionModal(null)} />}
    </div>
  );
}

export function CaptureEventPage() {
  const { token = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingStarting, setRecordingStarting] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [captureMode, setCaptureMode] = useState<"photo" | "video">("photo");
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [capturedMedia, setCapturedMedia] = useState<{ file: File; url: string; type: "image" | "video" } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingAudioStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingBytesRef = useRef(0);
  const recordingLimitReachedRef = useRef(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const cameraRequestRef = useRef(0);
  const nativeCameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const eventQuery = useQuery({
    queryKey: ["capture-event", token],
    queryFn: () => apiRequest<{ id: string; name: string; date: string; description: string | null }>(`/events/capture/${token}`),
    enabled: Boolean(token),
  });

  function setCapturedFile(file: File) {
    setCapturedMedia({
      file,
      url: URL.createObjectURL(file),
      type: file.type.startsWith("video/") ? "video" : "image",
    });
    setCameraError("");
    setUploadError("");
    setUploadMessage("");
  }

  useEffect(() => {
    const url = capturedMedia?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [capturedMedia?.url]);

  useEffect(() => {
    if (!recording) return;
    const updateElapsed = () => {
      const startedAt = recordingStartedAtRef.current;
      if (startedAt !== null) setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000));
    };
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(interval);
  }, [recording]);

  async function uploadFiles(selected: File[]) {
    if (!selected.length) return;
    setUploading(true);
    setUploadError("");
    setUploadMessage("");
    let completed = 0;
    try {
      for (const file of selected) {
        const body = new FormData();
        body.append("file", file);
        const uploaded = await apiRequest<EventMedia>(`/events/capture/${token}/uploads`, { method: "POST", body });
        const eventId = eventQuery.data?.id;
        if (eventId) {
          queryClient.setQueryData<EventMedia[]>(["event-media", eventId], (current) => current
            ? [...current.filter((media) => media.id !== uploaded.id), uploaded]
              .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
            : current);
          queryClient.setQueryData<ImaraEvent>(["event", eventId], (current) => {
            return current ? addEventStorageUsage(current, uploaded.sizeBytes) : current;
          });
          queryClient.setQueryData<ImaraEvent[]>(["events"], (current) => current?.map((event) => {
            return event.id === eventId ? addEventStorageUsage(event, uploaded.sizeBytes) : event;
          }));
        }
        completed += 1;
        setUploadedCount((count) => count + 1);
      }
      setUploadMessage(`${completed} ${completed === 1 ? "memory was" : "memories were"} added to the event.`);
      setCapturedMedia(null);
    } catch (error) {
      setUploadError(errorMessage(error, "Upload failed. Please try again."));
    } finally {
      setUploading(false);
      if (galleryInput.current) galleryInput.current.value = "";
    }
  }

  async function startCamera(facing: "environment" | "user" = cameraFacing) {
    if (!window.isSecureContext) {
      setCameraError("Live camera permission requires a secure HTTPS link. Try opening the device camera below, or ask the host to share the secure QR code.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser doesn't support live camera access. Try opening the device camera below.");
      return;
    }

    const requestId = cameraRequestRef.current + 1;
    cameraRequestRef.current = requestId;
    setCameraBusy(true);
    setCameraError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });

      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (error) {
      if (requestId !== cameraRequestRef.current) return;
      setCameraReady(false);
      setCameraError(error instanceof Error && error.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access for this site in your browser settings, then tap Allow camera access again."
        : "We couldn't open the camera. Check that no other app is using it, or open the device camera below.");
    } finally {
      if (requestId === cameraRequestRef.current) setCameraBusy(false);
    }
  }

  useEffect(() => {
    if (!eventQuery.data) return;
    return () => {
      cameraRequestRef.current += 1;
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.onerror = null;
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      recordingAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current?.getTracks().forEach((track) => track.stop());
      recordingAudioStreamRef.current = null;
      streamRef.current = null;
    };
  }, [eventQuery.data?.id]);

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("The camera is still starting. Please try again in a moment.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("This browser couldn't capture the photo. Choose media from your device instead.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError("The photo couldn't be created. Please try again.");
        return;
      }
      setCapturedFile(new File([blob], `imara-photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  async function toggleVideoRecording() {
    if (recording) {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      setRecording(false);
      return;
    }

    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") {
      setCameraError("Video recording isn't supported by this browser. You can choose a video from your device.");
      return;
    }

    const requestId = cameraRequestRef.current;
    setRecordingStarting(true);
    setCameraError("");
    try {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (requestId !== cameraRequestRef.current) {
          audioStream.getTracks().forEach((track) => track.stop());
          return;
        }
        recordingAudioStreamRef.current = audioStream;
      } catch {
        setCameraError("Microphone access isn't available. The video will be recorded without sound.");
      }

      if (requestId !== cameraRequestRef.current) return;
      const recordingStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...(recordingAudioStreamRef.current?.getAudioTracks() ?? []),
      ]);
      const candidates = ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];
      const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(recordingStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 1_500_000,
        audioBitsPerSecond: 96_000,
      });
      recordingChunksRef.current = [];
      recordingBytesRef.current = 0;
      recordingLimitReachedRef.current = false;
      setRecordingSeconds(0);
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        if (recordingBytesRef.current + event.data.size > MAX_EVENT_CAPTURE_BYTES) {
          recordingLimitReachedRef.current = true;
          if (recorder.state === "recording") recorder.stop();
          return;
        }
        recordingChunksRef.current.push(event.data);
        recordingBytesRef.current += event.data.size;
      };
      recorder.onerror = () => {
        setRecording(false);
        setCameraError("Video recording stopped unexpectedly. Please try again.");
      };
      recorder.onstop = () => {
        setRecording(false);
        recordingAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingAudioStreamRef.current = null;
        if (recordingLimitReachedRef.current) {
          recordingChunksRef.current = [];
          recordingBytesRef.current = 0;
          setCameraError("This video reached the 25 MB upload limit. Record a shorter video and try again.");
          return;
        }
        const type = recorder.mimeType || "video/webm";
        const extension = type.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(recordingChunksRef.current, { type });
        recordingChunksRef.current = [];
        recordingBytesRef.current = 0;
        if (!blob.size) {
          setCameraError("No video was captured. Please try recording again.");
          return;
        }
        if (blob.size > MAX_EVENT_CAPTURE_BYTES) {
          setCameraError("This video is over the 25 MB upload limit. Record a shorter video and try again.");
          return;
        }
        setCapturedFile(new File([blob], `imara-video-${Date.now()}.${extension}`, { type }));
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      recordingStartedAtRef.current = Date.now();
      setRecording(true);
    } catch {
      recordingAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingAudioStreamRef.current = null;
      setCameraError("We couldn't start video recording. Choose a video from your device instead.");
    } finally {
      if (requestId === cameraRequestRef.current) setRecordingStarting(false);
    }
  }

  async function switchCamera() {
    const facing = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(facing);
    setCameraReady(false);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    await startCamera(facing);
  }

  if (eventQuery.isLoading) return <PublicEventState><span className="loader" /><p>Opening the event…</p></PublicEventState>;
  if (eventQuery.isError || !eventQuery.data) {
    return <PublicEventState><div className="public-event-icon"><CalendarDays size={22} /></div><h1>This event link is unavailable.</h1><p>Ask the event host for a new QR code.</p></PublicEventState>;
  }

  return (
    <PublicEventState className="public-event-camera-page">
      <section className="capture-camera-shell" aria-label={`${eventQuery.data.name} camera`}>
        {capturedMedia ? (
          <>
            <div className="capture-camera-preview">
              {capturedMedia.type === "video"
                ? <video src={capturedMedia.url} controls autoPlay playsInline aria-label="Captured video preview" />
                : <img src={capturedMedia.url} alt="Captured photo preview" />}
            </div>
            <header className="capture-camera-topbar capture-preview-topbar">
              <span className="capture-camera-top-spacer" />
              <div className="capture-camera-event"><span>REVIEW YOUR {capturedMedia.type.toUpperCase()}</span><strong>{eventQuery.data.name}</strong></div>
              <span className="capture-camera-top-spacer" />
            </header>
            <div className="capture-review-panel">
              {uploadError && <p className="capture-camera-alert" role="alert"><PlanLimitMessage message={uploadError} /></p>}
              <div className="capture-review-actions">
                <button className="capture-review-circle capture-review-retake" type="button" disabled={uploading} onClick={() => setCapturedMedia(null)} aria-label="Retake"><RotateCcw size={19} /><span>Retake</span></button>
                <button className="capture-review-circle capture-upload-button" type="button" disabled={uploading} onClick={() => void uploadFiles([capturedMedia.file])} aria-label={uploading ? "Saving media" : "Save media"}>
                  {uploading ? <span className="loader" /> : <Check size={24} />}
                  <span>{uploading ? "Saving" : "Save"}</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={`event-camera-stage${cameraReady ? " event-camera-ready" : ""}`}>
              <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview" />
              {!cameraReady && (
                <div className="event-camera-placeholder">
                  <Camera size={28} />
                  <strong>{cameraBusy ? "Waiting for camera permission…" : "Ready when you are"}</strong>
                  <span>{cameraBusy ? "Allow camera access in your browser" : "Allow access to capture a moment"}</span>
                  {!cameraBusy && <button className="capture-permission-button" type="button" onClick={() => void startCamera()}><Camera size={16} /> Allow camera access</button>}
                </div>
              )}
            </div>
            <div className="capture-camera-shade" />
            <header className="capture-camera-topbar">
              <Link to="/" className="capture-camera-brand" aria-label="imara home"><BrandMark /></Link>
              <div className="capture-camera-event"><span>SHARED EVENT</span><strong>{eventQuery.data.name}</strong></div>
              {cameraReady ? (
                <button type="button" className="capture-camera-icon-button" aria-label="Switch camera" title="Switch camera" disabled={recording || recordingStarting} onClick={() => void switchCamera()}><SwitchCamera size={20} /></button>
              ) : <span className="capture-camera-top-spacer" />}
            </header>

            <div className="capture-camera-status" aria-live="polite">
              {cameraError && <p className="capture-camera-alert" role="alert">{cameraError}</p>}
              {uploadError && <p className="capture-camera-alert" role="alert"><PlanLimitMessage message={uploadError} /></p>}
              {uploadMessage && <p className="capture-camera-success" role="status"><Check size={15} />{uploadMessage}</p>}
              {recording
                ? <span className="capture-recording-badge"><i /> REC {`${Math.floor(recordingSeconds / 60).toString().padStart(2, "0")}:${(recordingSeconds % 60).toString().padStart(2, "0")}`}</span>
                : cameraReady && <span className="capture-live-badge">LIVE</span>}
              {uploading && <span className="capture-uploading-badge">Uploading securely…</span>}
            </div>

            <footer className="capture-camera-controls">
              {cameraReady ? (
                <>
                  <div className="capture-camera-control-row">
                    <button className="capture-camera-aux-button" type="button" disabled={uploading || recording} onClick={() => setCaptureMode((mode) => mode === "photo" ? "video" : "photo")} aria-label={`Switch to ${captureMode === "photo" ? "video" : "photo"} mode`}><span className="capture-camera-aux-circle">{captureMode === "photo" ? <Video size={20} /> : <Camera size={20} />}</span><span>{captureMode === "photo" ? "Video" : "Photo"}</span></button>
                    <div className="capture-main-control">
                      <button
                        type="button"
                        className={`capture-shutter${captureMode === "video" ? " capture-shutter-video" : ""}${recording ? " capture-shutter-recording" : ""}`}
                        disabled={uploading || recordingStarting}
                        aria-label={recording ? "Stop video recording" : captureMode === "photo" ? "Take photo" : "Start video recording"}
                        onClick={() => captureMode === "photo" ? void capturePhoto() : void toggleVideoRecording()}
                      >
                        <span />
                      </button>
                      <span className="capture-shutter-label">{recording ? "Stop recording" : captureMode === "photo" ? "Capture photo" : "Record video"}</span>
                    </div>
                    <button className="capture-camera-aux-button" type="button" disabled={uploading || recording} onClick={() => galleryInput.current?.click()} aria-label="Choose media from device"><span className="capture-camera-aux-circle"><Image size={20} /></span><span>Library</span></button>
                  </div>
                  {recordingStarting && <p className="capture-camera-hint">Preparing video…</p>}
                  {recording && <p className="capture-camera-hint">Tap the red circle to stop and review</p>}
                </>
              ) : (
                <>
                  <p className="capture-camera-hint">Photos and videos up to 25 MB</p>
                  <div className="capture-fallback-actions">
                    <button type="button" onClick={() => nativeCameraInput.current?.click()}><Video size={17} />Open device camera</button>
                    <button type="button" onClick={() => galleryInput.current?.click()}><Upload size={17} />Choose media</button>
                  </div>
                </>
              )}
              {uploadedCount > 0 && <p className="capture-camera-hint">{uploadedCount} {uploadedCount === 1 ? "memory added" : "memories added"}</p>}
            </footer>
            <input ref={nativeCameraInput} className="event-hidden-input" type="file" accept="image/*,video/*" capture="environment" onChange={(change) => {
              const file = change.target.files?.[0];
              if (file) setCapturedFile(file);
              change.target.value = "";
            }} />
            <input ref={galleryInput} className="event-hidden-input" type="file" accept="image/*,video/*" multiple onChange={(change) => void uploadFiles(Array.from(change.target.files ?? []))} />
          </>
        )}
      </section>
      {user && <Link className="event-owner-shortcut" to={`/events/${eventQuery.data.id}`}>Manage this event <ArrowRight size={14} /></Link>}
    </PublicEventState>
  );
}

function PublicEventState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`public-event-page ${className}`}><div className="public-event-wrap">{children}</div></main>;
}

export function EventGalleryPage() {
  const { token = "" } = useParams();
  const [accessToken, setAccessToken] = useState("");
  const [passcode, setPasscode] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const galleryQuery = useQuery({
    queryKey: ["public-event-gallery", token, accessToken],
    queryFn: () => apiRequest<EventMediaList>(`/events/gallery/${token}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    }),
    enabled: Boolean(token),
    retry: false,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUnlockError("");
    setUnlocking(true);
    try {
      const grant = await apiRequest<{ accessToken: string; expiresAt: string }>(`/events/gallery/${token}/unlock`, {
        method: "POST",
        body: JSON.stringify({ passcode }),
      });
      setAccessToken(grant.accessToken);
      setPasscode("");
    } catch (error) {
      setUnlockError(errorMessage(error, "Could not unlock this gallery."));
    } finally {
      setUnlocking(false);
    }
  }

  const queryError = galleryQuery.error;
  const requiresPasscode = queryError instanceof ApiError && queryError.status === 401;
  const unavailable = queryError instanceof ApiError && queryError.status === 404;

  if (galleryQuery.isLoading) return <PublicEventState><span className="loader" /><p>Loading the collection…</p></PublicEventState>;
  if (requiresPasscode && !accessToken) {
    return (
      <PublicEventState>
        <form className="gallery-unlock-card" onSubmit={(event) => void unlock(event)}>
          <div className="public-event-brand"><BrandIdentity /></div>
          <div className="public-event-icon"><LockKeyhole size={22} /></div>
          <span className="eyebrow">A PRIVATE COLLECTION</span>
          <h1>Enter the passcode.</h1>
          <p>This event’s host has protected the gallery.</p>
          <input autoFocus autoComplete="current-password" maxLength={128} minLength={8} required type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} placeholder="Gallery passcode" />
          {unlockError && <p className="form-alert" role="alert">{unlockError}</p>}
          <button className="button button-green" type="submit" disabled={unlocking}>{unlocking ? "Checking…" : "View gallery"}<ArrowRight size={15} /></button>
        </form>
      </PublicEventState>
    );
  }
  if (galleryQuery.isError || !galleryQuery.data) {
    return <PublicEventState><div className="public-event-icon"><ShieldCheck size={22} /></div><h1>{unavailable ? "This gallery is private or unavailable." : "Gallery unavailable."}</h1><p>{unavailable ? "Ask the event host for an accessible gallery link." : errorMessage(queryError, "Please try again later.")}</p></PublicEventState>;
  }

  const { event, media } = galleryQuery.data;
  return (
    <main className="public-gallery-page">
      <header className="public-gallery-header"><Link to="/" className="public-event-brand" aria-label="imara home"><BrandIdentity /></Link><span><LockKeyhole size={14} /> Shared privately</span></header>
      <section className="public-gallery-intro">
        <span className="eyebrow">A SHARED COLLECTION</span>
        <h1>{event.name}</h1>
        <p>{formatEventDate(event.date)}{event.description ? ` · ${event.description}` : ""}</p>
        <span className="public-gallery-count">{media.length} {media.length === 1 ? "memory" : "memories"}</span>
      </section>
      {media.length === 0 ? <div className="event-media-empty"><Image size={21} /><p>No photos or videos have been added yet.</p></div> : (
        <section className="event-media-grid public-gallery-grid" aria-label={`${event.name} media`}>
          {media.map((item) => <EventMediaCard key={item.id} galleryToken={token} media={item} endpoint="gallery" authorization={accessToken} />)}
        </section>
      )}
      <footer className="public-gallery-footer"><ShieldCheck size={14} /> Shared with care by IMARA</footer>
    </main>
  );
}
