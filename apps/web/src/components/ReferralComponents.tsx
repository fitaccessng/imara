import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Gift, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";

interface ReferralSummary {
  active: boolean;
  referralCode: string;
  referralLink: string | null;
  verifiedReferrals: number;
  nextRewardAt: number;
  rewardedMilestones: number;
  bonusStorageBytes: string;
}

interface ReferralPromotion {
  enabled: boolean;
  title: string;
  message: string;
  instructions: string;
  updatedAt: string | null;
}

function useReferralSummary(enabled = true) {
  return useQuery({
    queryKey: ["referral-account"],
    queryFn: () => apiRequest<ReferralSummary>("/referrals/me"),
    enabled,
  });
}

function CopyReferralLink({ link, compact = false, inputId }: { link: string; compact?: boolean; inputId?: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function copyLink() {
    setCopied(false);
    setError("");
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Could not copy automatically. Select and copy the link above.");
    }
  }

  return (
    <div className={`referral-copy-wrap${compact ? " is-compact" : ""}`}>
      <div className="referral-link-field">
        <input id={inputId} aria-label="Your personal referral link" value={link} readOnly onFocus={(event) => event.currentTarget.select()} />
        <button type="button" onClick={() => void copyLink()} aria-label={copied ? "Referral link copied" : "Copy referral link"}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          <span>{copied ? "Copied" : "Copy link"}</span>
        </button>
      </div>
      {error && <p className="referral-copy-error" role="alert">{error}</p>}
      {copied && <p className="referral-copy-success" role="status">Referral link copied to clipboard.</p>}
    </div>
  );
}

export function ReferralSettingsCard() {
  const referral = useReferralSummary();

  if (referral.isPending) {
    return <section className="referral-settings-card"><span className="loader" />Loading your referral details…</section>;
  }
  if (referral.isError) {
    return (
      <section className="referral-settings-card referral-settings-error" role="alert">
        <Gift size={20} />
        <div><strong>Referral details couldn’t load</strong><p>{referral.error instanceof Error ? referral.error.message : "Please try again."}</p></div>
        <button type="button" onClick={() => void referral.refetch()}>Try again</button>
      </section>
    );
  }

  const data = referral.data;
  const referralsToNextReward = Math.max(0, data.nextRewardAt - data.verifiedReferrals);
  const progress = Math.max(0, 5 - referralsToNextReward);

  return (
    <section className="referral-settings-card">
      <div className="referral-settings-heading">
        <span className="referral-settings-icon"><Gift size={20} /></span>
        <div><span className="referral-kicker">GIVE A FRIEND MORE ROOM</span><h2>Share IMARA, earn storage</h2></div>
        <span className="referral-reward-chip">+1 GB <small>every 5</small></span>
      </div>
      <p className="referral-settings-intro">Invite friends with your personal link. When five people you invite verify their email, we add 1 GB to your storage. There’s no limit to the rewards you can earn.</p>

      <div className="referral-progress">
        <div className="referral-progress-label"><span><Users size={15} /> Verified referrals</span><strong>{data.verifiedReferrals}</strong></div>
        <div className="referral-progress-track" role="progressbar" aria-label="Progress toward your next storage reward" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={5}>
          <span style={{ width: `${(progress / 5) * 100}%` }} />
        </div>
        <p>{progress === 0 && data.verifiedReferrals > 0 ? "You’ve reached a reward milestone. Keep inviting friends for your next 1 GB." : `${referralsToNextReward} more verified ${referralsToNextReward === 1 ? "referral" : "referrals"} until your next 1 GB.`}</p>
      </div>

      <div className="referral-earned">
        <span><strong>{data.rewardedMilestones}</strong><small>rewards earned</small></span>
        <span className="referral-earned-divider" />
        <span><strong>{(Number(data.bonusStorageBytes) / (1024 ** 3)).toFixed(0)} GB</strong><small>bonus storage</small></span>
      </div>

      <div className="referral-share">
        <label htmlFor="account-referral-link">YOUR PERSONAL LINK</label>
        {data.referralLink
          ? <CopyReferralLink link={data.referralLink} inputId="account-referral-link" />
          : <p className="referral-copy-error" role="alert">Your referral link is not available right now.</p>}
      </div>
      <p className="referral-settings-footnote">Only new accounts that verify their email count toward your rewards.</p>
    </section>
  );
}

export function ReferralPromotionModal({ userId, suppressed = false }: { userId: string; suppressed?: boolean }) {
  const promotion = useQuery({
    queryKey: ["referral-promotion"],
    queryFn: () => apiRequest<ReferralPromotion>("/referrals/promotion"),
    staleTime: 60_000,
  });
  const referral = useReferralSummary(promotion.data?.enabled === true);
  const version = promotion.data?.updatedAt ?? "default";
  const dismissalKey = `imara-referral-promo-dismissed:${userId}:${version}`;
  const [dismissed, setDismissed] = useState(false);
  const [dismissalLoaded, setDismissalLoaded] = useState(false);
  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissalKey, "true");
    } catch {
      // The dialog still closes for this visit if storage is unavailable.
    }
  }, [dismissalKey]);

  useEffect(() => {
    if (!promotion.data || !userId) return;
    try {
      setDismissed(window.localStorage.getItem(dismissalKey) === "true");
    } catch {
      setDismissed(false);
    }
    setDismissalLoaded(true);
  }, [dismissalKey, promotion.data, userId]);

  useEffect(() => {
    if (!promotion.data?.enabled || dismissed || !dismissalLoaded || !referral.data?.referralLink) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dismiss, dismissalLoaded, dismissed, promotion.data?.enabled, referral.data?.referralLink]);

  if (suppressed || !promotion.data?.enabled || !dismissalLoaded || dismissed || !referral.data?.referralLink) return null;

  return (
    <div className="referral-promo-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section className="referral-promo-dialog" role="dialog" aria-modal="true" aria-labelledby="referral-promo-title">
        <button className="referral-promo-close" type="button" aria-label="Close referral offer" onClick={dismiss}><X size={19} /></button>
        <div className="referral-promo-art" aria-hidden="true"><span><Gift size={25} /></span><i /><i /><i /></div>
        <span className="referral-kicker">A LITTLE MORE ROOM TO GROW</span>
        <h2 id="referral-promo-title">{promotion.data.title}</h2>
        <p className="referral-promo-message">{promotion.data.message}</p>
        <div className="referral-promo-steps">
          <span className="referral-step-number">01</span>
          <p>{promotion.data.instructions}</p>
        </div>
        <CopyReferralLink link={referral.data.referralLink} />
        <div className="referral-promo-reward"><Gift size={15} /><span><strong>1 GB extra storage</strong> for every 5 friends who verify</span></div>
      </section>
    </div>
  );
}
