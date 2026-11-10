import type { ReactNode } from "react";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

type PageShellProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  children?: ReactNode;
};

const publicLinks = [
  { href: "/features", label: "Features" },
  { href: "/docs", label: "Docs" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
];

const appPath = /^\/(dashboard|files|folders|workspace|settings|scanner|shares|billing|admin|search|recent|starred|trash|notifications)(\/|$)/;

export function PageShell({ title, description, eyebrow = "IMARA", children }: PageShellProps) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAppPage = appPath.test(pathname);
  const pageTitle = title.replace(/\s+Page$/, "");

  return (
    <div className={`page-shell${isAppPage ? " page-shell-app" : " page-shell-public"}`}>
      {!isAppPage && (
        <header className="public-header">
          <Link to="/" className="brand-lockup" aria-label="IMARA home">
            <span className="brand-mark">i</span>IMARA<span className="brand-dot">.</span>
          </Link>
          <nav className={menuOpen ? "public-nav-open" : ""} aria-label="Main navigation">
            {publicLinks.map((item) => (
              <Link key={item.href} to={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>
            ))}
          </nav>
          <div className="public-header-actions">
            <Link to="/login" className="public-login-link">Log in</Link>
            <Link to="/register" className="button button-green button-compact">Create account</Link>
          </div>
          <button
            type="button"
            className="public-menu-toggle"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>
      )}
      <main className="page-shell-main">
        <div className="page-shell-heading">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{pageTitle}</h1>
          {description && <p className="page-shell-description">{description}</p>}
        </div>
        {children && <div className="page-shell-content">{children}</div>}
      </main>
      {!isAppPage && (
        <footer className="public-footer">
          <span>© {new Date().getFullYear()} IMARA</span>
          <span>Organise work files and collect event photos and videos in shared galleries.</span>
          <div><Link to="/docs">Docs</Link><Link to="/about">About</Link><Link to="/security">Security</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/contact">Contact</Link><Link to="/admin/login">Admin sign in</Link></div>
        </footer>
      )}
    </div>
  );
}
