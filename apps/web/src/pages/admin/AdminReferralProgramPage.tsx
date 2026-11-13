import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gift, Megaphone, Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api";
import {
  AdminManagementError,
  AdminManagementHeader,
  AdminManagementLoading,
} from "./AdminManagementCommon";

interface ReferralProgram {
  enabled: boolean;
  title: string;
  message: string;
  instructions: string;
  linkTemplate: string;
  updatedAt: string | null;
}

const emptyProgram: ReferralProgram = {
  enabled: false,
  title: "Share IMARA. Grow your space.",
  message: "Invite friends to join IMARA. For every five verified referrals, you’ll receive an extra 1 GB of storage.",
  instructions: "Copy your personal referral link below and share it with friends. Your reward is added automatically when each friend verifies their email.",
  linkTemplate: "https://www.useimara.space/register?ref={code}",
  updatedAt: null,
};

export function AdminReferralProgramPage() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(emptyProgram);
  const [notice, setNotice] = useState("");
  const programQuery = useQuery({
    queryKey: ["admin-referral-program"],
    queryFn: () => apiRequest<ReferralProgram>("/admin/referral-program"),
  });

  useEffect(() => {
    if (programQuery.data) {
      setValues({
        enabled: programQuery.data.enabled,
        title: programQuery.data.title,
        message: programQuery.data.message,
        instructions: programQuery.data.instructions,
        linkTemplate: programQuery.data.linkTemplate,
        updatedAt: programQuery.data.updatedAt,
      });
    }
  }, [programQuery.data]);

  const saveProgram = useMutation({
    mutationFn: (body: Omit<ReferralProgram, "updatedAt">) =>
      apiRequest<ReferralProgram>("/admin/referral-program", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async (program) => {
      setValues(program);
      setNotice("Referral campaign settings saved.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-referral-program"] }),
        queryClient.invalidateQueries({ queryKey: ["referral-promotion"] }),
      ]);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    saveProgram.mutate({
      enabled: values.enabled,
      title: values.title.trim(),
      message: values.message.trim(),
      instructions: values.instructions.trim(),
      linkTemplate: values.linkTemplate.trim(),
    });
  }

  if (programQuery.isPending) return <AdminManagementLoading label="Loading referral campaign settings…" />;
  if (programQuery.isError) {
    return <AdminManagementError title="Referral campaign settings could not load" error={programQuery.error} retry={() => void programQuery.refetch()} />;
  }

  return (
    <div className="admin-page-content">
      <AdminManagementHeader
        eyebrow="GROWTH & ENGAGEMENT"
        title="Referral programme"
        description="Manage the referral offer and the pop-up shown to signed-in users."
      />

      <section className="admin-panel referral-admin-overview">
        <div className="referral-admin-mark"><Gift size={20} /></div>
        <div>
          <span className="admin-eyebrow">REWARD RULE</span>
          <h2>5 verified referrals earn 1 GB</h2>
          <p>Rewards are credited automatically for every five people a member refers after they verify their email address.</p>
        </div>
        <span className={`referral-admin-status ${values.enabled ? "is-active" : ""}`}>
          <span />{values.enabled ? "Pop-up active" : "Pop-up paused"}
        </span>
      </section>

      <form className="admin-panel referral-admin-form" onSubmit={submit}>
        <div className="admin-panel-heading">
          <div><span className="admin-eyebrow">MEMBER ANNOUNCEMENT</span><h2>Referral pop-up content</h2></div>
          <Megaphone size={18} />
        </div>

        <label className="referral-admin-toggle">
          <input
            type="checkbox"
            checked={values.enabled}
            onChange={(event) => setValues((current) => ({ ...current, enabled: event.target.checked }))}
          />
          <span className="referral-admin-toggle-copy">
            <strong>Show the referral pop-up</strong>
            <small>When active, signed-in members see this campaign once. They can close it at any time.</small>
          </span>
          <span className={`referral-admin-toggle-track ${values.enabled ? "is-active" : ""}`} aria-hidden="true"><i /></span>
        </label>

        <label className="referral-admin-field">
          <span>Headline</span>
          <input
            value={values.title}
            maxLength={100}
            required
            onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
          />
        </label>

        <label className="referral-admin-field">
          <span>Offer description</span>
          <textarea
            value={values.message}
            maxLength={500}
            rows={3}
            required
            onChange={(event) => setValues((current) => ({ ...current, message: event.target.value }))}
          />
        </label>

        <label className="referral-admin-field">
          <span>Directions for sharing</span>
          <textarea
            value={values.instructions}
            maxLength={1000}
            rows={4}
            required
            onChange={(event) => setValues((current) => ({ ...current, instructions: event.target.value }))}
          />
          <small>The member’s unique referral link and a copy button are added automatically.</small>
        </label>

        <label className="referral-admin-field">
          <span>Referral link template</span>
          <input
            type="text"
            value={values.linkTemplate}
            maxLength={500}
            required
            spellCheck={false}
            onChange={(event) => setValues((current) => ({ ...current, linkTemplate: event.target.value }))}
          />
          <small>Include {'{code}'} where each member’s unique referral code should appear.</small>
        </label>

        {(saveProgram.isError || notice) && (
          <p className={saveProgram.isError ? "admin-form-error" : "admin-form-success"} role={saveProgram.isError ? "alert" : "status"}>
            {saveProgram.isError
              ? saveProgram.error instanceof Error ? saveProgram.error.message : "The settings could not be saved."
              : <><Check size={14} />{notice}</>}
          </p>
        )}

        <div className="admin-form-actions">
          <button className="admin-button admin-button-primary" type="submit" disabled={saveProgram.isPending}>
            <Save size={14} />{saveProgram.isPending ? "Saving…" : "Save campaign"}
          </button>
        </div>
      </form>

      <section className="admin-panel referral-admin-preview">
        <span className="admin-eyebrow">LIVE COPY PREVIEW</span>
        <h2>{values.title || "Your referral offer"}</h2>
        <p>{values.message || "Offer description will appear here."}</p>
        <div><span className="referral-preview-link">Your personal referral link</span><span className="referral-preview-copy">Copy link</span></div>
        <small>{values.instructions || "Sharing directions will appear here."}</small>
      </section>
    </div>
  );
}
