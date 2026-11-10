import { ArrowRight, Building2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import "./workspace-setup-prompt.css";

interface WorkspaceSetupPromptProps {
  title: string;
  description: string;
  actionTo?: string;
}

export function WorkspaceSetupPrompt({
  title,
  description,
  actionTo = "/workspace/team",
}: WorkspaceSetupPromptProps) {
  return (
    <section className="workspace-setup-prompt">
      <div className="workspace-setup-art" aria-hidden="true">
        <span className="workspace-setup-orbit workspace-setup-orbit-one" />
        <span className="workspace-setup-orbit workspace-setup-orbit-two" />
        <span className="workspace-setup-building"><Building2 size={32} strokeWidth={1.4} /></span>
        <span className="workspace-setup-art-caption">A SHARED SPACE<br />FOR GOOD WORK</span>
      </div>
      <div className="workspace-setup-copy">
        <span className="eyebrow">YOUR BUSINESS WORKSPACE</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="workspace-setup-actions">
          <Link className="workspace-setup-cta" to={actionTo}>
            Set up workspace <ArrowRight size={16} />
          </Link>
          <span><Users size={15} /> Invite your team when you’re ready</span>
        </div>
      </div>
    </section>
  );
}