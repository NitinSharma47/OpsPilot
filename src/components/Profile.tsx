"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, RequestError } from "@/lib/client-api";
import Brand, { BrandMark } from "@/components/Brand";
import ThemeMenu from "@/components/ThemeMenu";

type User = {
  id: string;
  name: string;
  email: string;
  memberships: { role: string; team: { id: string; name: string } }[];
};

const initials = (name: string) => name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    apiRequest<User>("/api/auth/me")
      .then(setUser)
      .catch((reason) => {
        if (reason instanceof RequestError && reason.status === 401) router.replace("/login");
        else setError(reason instanceof Error ? reason.message : "Unable to load your profile.");
      });
  }, [router]);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign out.");
      setSigningOut(false);
    }
  }

  if (!user) return <main className="boot-screen"><BrandMark /><p>{error || "Opening your profile…"}</p></main>;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Brand className="brand-sidebar" />
        <div className="workspace-label">WORKSPACE</div>
        <Link className="detail-back-nav" href="/"><span>←</span> Operations desk</Link>
        <div className="sidebar-divider" />
        <div className="nav-section-label">YOUR TEAMS</div>
        <nav className="team-list">{user.memberships.map(({ team, role }, index) => (
          <Link key={team.id} href={`/teams/${team.id}`} className="team-button">
            <span className={`team-dot team-dot-${index % 4}`} />{team.name}<span className="team-role">{role.toLowerCase()}</span>
          </Link>
        ))}</nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-mark">✳</div><strong>A clearer handoff</strong><p>Keep your next update grounded in:</p><ul><li>What changed?</li><li>What happens next?</li><li>Who owns it?</li></ul></div>
          <Link className="user-menu profile-user-active" href="/profile">
            <span className="user-avatar">{initials(user.name)}</span><span className="user-meta"><strong>{user.name}</strong><small>{user.email}</small></span><span className="user-more">Profile ↗</span>
          </Link>
        </div>
      </aside>
      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><Link href="/">Operations</Link><span className="crumb-slash">/</span><strong>Profile</strong></div>
          <div className="topbar-right"><span className="today-label">YOUR ACCOUNT</span><ThemeMenu /></div>
        </header>
        <div className="page-content profile-page">
          <div className="profile-hero">
            <div><p className="eyebrow">THE PERSON BEHIND THE WORK</p><h1>Profile</h1><p className="page-subtitle">A quick look at your identity and team responsibilities.</p></div>
            <span className="profile-hero-seal"><BrandMark /></span>
          </div>
          {error && <div className="notice notice-error" role="alert"><span>!</span>{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}
          <div className="profile-layout">
            <section className="detail-card profile-card">
              <div className="profile-identity">
                <span className="profile-avatar">{initials(user.name)}</span>
                <div><p className="eyebrow">SIGNED IN AS</p><h2>{user.name}</h2><p>{user.email}</p></div>
                <span className="profile-live"><span /> Active</span>
              </div>
              <div className="profile-divider" />
              <div className="profile-fields">
                <div><span>DISPLAY NAME</span><strong>{user.name}</strong></div>
                <div><span>WORK EMAIL</span><strong>{user.email}</strong></div>
                <div><span>TEAM MEMBERSHIPS</span><strong>{user.memberships.length} {user.memberships.length === 1 ? "team" : "teams"}</strong></div>
              </div>
            </section>
            <section className="detail-card profile-teams">
              <div className="section-heading"><div><p className="eyebrow">WHERE YOU COLLABORATE</p><h2>Your teams</h2></div><span className="section-number">{String(user.memberships.length).padStart(2, "0")}</span></div>
              <div className="profile-team-list">{user.memberships.map(({ team, role }, index) => (
                <Link key={team.id} href={`/teams/${team.id}`} className="profile-team-row">
                  <span className={`profile-team-icon profile-team-icon-${index % 4}`}><span className={`team-dot team-dot-${index % 4}`} /></span>
                  <span><strong>{team.name}</strong><small>Your team workspace</small></span>
                  <span className="profile-role">{role.toLowerCase()}</span>
                  <span className="profile-row-arrow">↗</span>
                </Link>
              ))}</div>
              {!user.memberships.length && <p className="muted-copy">You haven’t been added to a team yet.</p>}
            </section>
            <section className="detail-card profile-security">
              <div><p className="eyebrow">KEEP THINGS TIDY</p><h2>Session</h2><p>Sign out when you’re finished on a shared device.</p></div>
              <button className="button button-secondary" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? "Signing out…" : "Sign out"} <span>↗</span></button>
            </section>
          </div>
          <footer className="page-footer"><span>OPSPILOT <span className="brand-period">·</span> BUILT FOR CLEAR HANDOFFS</span><span>Your work, and the people behind it.</span></footer>
        </div>
      </section>
    </main>
  );
}
