import { PageShell } from "../PageShell";

export function ShareFolderPage() {
  return (
    <PageShell
      eyebrow="Sharing"
      title="Share Folder"
      description="Shares a folder with another user."
    >
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: "#374151" }}>
          This page is scaffolded for the IMARA platform and ready to be connected to its API and business logic.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 999, padding: "8px 12px", fontWeight: 700, fontSize: 12 }}>Page scaffold</span>
          <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 999, padding: "8px 12px", fontWeight: 700, fontSize: 12 }}>Ready for implementation</span>
        </div>
      </div>
    </PageShell>
  );
}

export default ShareFolderPage;
