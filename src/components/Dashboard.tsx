"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, RequestError } from "@/lib/client-api";
import { priorities, statuses, workTypes } from "@/lib/schemas";

type User = {
  id: string; name: string; email: string;
  memberships: { role: string; team: { id: string; name: string } }[];
};
type Item = {
  id: string; title: string; description: string; type: string; priority: string; status: string;
  dueAt: string | null; createdAt: string; team: { id: string; name: string };
  assignee: { id: string; name: string } | null; createdBy: { name: string };
};
type ListResponse = { items: Item[]; nextCursor: string | null };
type Counts = { assignedToMe: number; urgentUnassigned: number; awaitingApproval: number };

const labels: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In progress", AWAITING_APPROVAL: "Awaiting approval",
  RESOLVED: "Resolved", CLOSED: "Closed", CUSTOMER_ISSUE: "Customer issue",
  INCIDENT: "Incident", PAYMENT: "Payment", COMPLIANCE: "Compliance", TASK: "Task",
  LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent",
};
const dateLabel = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [counts, setCounts] = useState<Counts>({ assignedToMe: 0, urgentUnassigned: 0, awaitingApproval: 0 });
  const [items, setItems] = useState<Item[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [view, setView] = useState("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
  }, [view, search, status, priority, teamId]);

  const loadItems = useCallback(async (append = false, pageCursor?: string | null) => {
    if (!user) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "20" });
    if (view !== "all") params.set("view", view);
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (teamId) params.set("teamId", teamId);
    if (append && pageCursor) params.set("cursor", pageCursor);
    try {
      const result = await apiRequest<ListResponse>(`/api/items?${params}`);
      setItems((previous) => append ? [...previous, ...result.items] : result.items);
      setNextCursor(result.nextCursor);
    } catch (reason) {
      if (reason instanceof RequestError && reason.status === 401) router.replace("/login");
      else setError(reason instanceof Error ? reason.message : "Could not load work items.");
    } finally {
      setLoading(false);
    }
  }, [user, view, search, status, priority, teamId, router]);

  useEffect(() => {
    apiRequest<User>("/api/auth/me")
      .then(setUser)
      .catch(() => router.replace("/login"));
  }, [router]);

  useEffect(() => {
    if (user) {
      void loadItems();
      apiRequest<Counts>("/api/dashboard").then(setCounts).catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Could not load dashboard counts.");
      });
    }
  }, [user, loadItems]);

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(form.entries());
    try {
      await apiRequest("/api/items", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          ...input,
          dueAt: input.dueAt ? new Date(String(input.dueAt)).toISOString() : null,
        }),
      });
      setShowCreate(false);
      setView("all");
      setStatus("");
      setPriority("");
      setQuery("");
      setSearch("");
      await loadItems();
      setCounts(await apiRequest<Counts>("/api/dashboard"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create this work item.");
    }
  }

  async function signOut() {
    await apiRequest("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (!user) return <main className="boot-screen"><span className="brand-mark">F</span><p>Opening your workspace…</p></main>;
  const canCreate = user.memberships.some(({ role }) => role !== "VIEWER");

  const tabs = [
    { id: "all", label: "All work" },
    { id: "assigned", label: "Assigned to me", count: counts.assignedToMe },
    { id: "urgent", label: "Unassigned urgent", count: counts.urgentUnassigned },
    ...(user.memberships.some(({ role }) => role === "LEAD" || role === "ADMIN")
      ? [{ id: "approval", label: "Awaiting my approval", count: counts.awaitingApproval }] : []),
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand brand-sidebar" href="/"><span className="brand-mark">F</span><span>fieldnote<span className="brand-period">.</span></span></a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-switch"><span className="workspace-avatar">N</span><span><strong>Newtonite</strong><small>Operations team</small></span><span className="chevron">⌄</span></div>
        <div className="nav-section-label">YOUR QUEUE</div>
        <nav className="queue-nav" aria-label="Work views">
          {tabs.map((tab, index) => (
            <button key={tab.id} className={`nav-item ${view === tab.id ? "nav-active" : ""}`} onClick={() => setView(tab.id)}>
              <span className={`nav-icon nav-icon-${index}`} aria-hidden="true">{["▤", "◎", "!", "◷"][index]}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && <span className={`nav-count ${tab.id === "urgent" && tab.count > 0 ? "count-alert" : ""}`}>{tab.count}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-section-label">YOUR TEAMS</div>
        <div className="team-list">
          {user.memberships.map(({ team, role }, index) => (
            <button key={team.id} className={`team-button ${teamId === team.id ? "team-selected" : ""}`} onClick={() => setTeamId(teamId === team.id ? "" : team.id)}>
              <span className={`team-dot team-dot-${index % 4}`} />{team.name}
              <span className="team-role">{role.toLowerCase()}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-mark">?</div><strong>Need a hand?</strong><p>Keep every handoff clear and kind.</p></div>
          <button className="user-menu" onClick={signOut}>
            <span className="user-avatar">{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
            <span className="user-meta"><strong>{user.name}</strong><small>{user.email}</small></span>
            <span className="user-more">↗</span>
          </button>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Operations</span><span className="crumb-slash">/</span><strong>Work queue</strong></div>
          <div className="topbar-right"><span className="live-indicator"><span /> All systems normal</span><div className="topbar-divider" /><span className="today-label">{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span></div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR OPERATIONS DESK</p>
              <h1>{view === "assigned" ? "Your work" : view === "urgent" ? "Urgent & unclaimed" : view === "approval" ? "Ready for your review" : "Good work, in motion."}</h1>
              <p className="page-subtitle">{view === "all" ? "A clear view of what needs care, and who is taking it forward." : "A shared, up-to-date view across your teams."}</p>
            </div>
            {canCreate && <button className="button button-primary create-button" onClick={() => setShowCreate(true)}><span className="plus-sign">＋</span> New work item</button>}
          </div>

          <div className="metrics-grid">
            <button className={`metric-card metric-blue ${view === "assigned" ? "metric-current" : ""}`} onClick={() => setView(view === "assigned" ? "all" : "assigned")}>
              <span className="metric-label">ON YOUR PLATE <span className="metric-glyph">↗</span></span><strong className="metric-number">{counts.assignedToMe.toString().padStart(2, "0")}</strong><span className="metric-foot">Active items assigned to you</span><span className="metric-art metric-art-blue">◒</span>
            </button>
            <button className={`metric-card metric-rust ${view === "urgent" ? "metric-current" : ""}`} onClick={() => setView(view === "urgent" ? "all" : "urgent")}>
              <span className="metric-label">NEEDS AN OWNER <span className="metric-glyph">↗</span></span><strong className="metric-number">{counts.urgentUnassigned.toString().padStart(2, "0")}</strong><span className="metric-foot">Urgent work, not yet claimed</span><span className="metric-art metric-art-rust">!</span>
            </button>
            <button className={`metric-card metric-green ${view === "approval" ? "metric-current" : ""}`} onClick={() => setView(view === "approval" ? "all" : "approval")}>
              <span className="metric-label">AWAITING YOUR EYE <span className="metric-glyph">↗</span></span><strong className="metric-number">{counts.awaitingApproval.toString().padStart(2, "0")}</strong><span className="metric-foot">Work waiting for a lead decision</span><span className="metric-art metric-art-green">✓</span>
            </button>
          </div>

          <div className="queue-section">
            <div className="queue-heading">
              <div><h2>Work queue <span className="queue-total">{items.length}{nextCursor ? "+" : ""}</span></h2><p>Thoughtful handoffs make all the difference.</p></div>
              <div className="queue-tools">
                <label className="search-box"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the queue…" aria-label="Search work items" /><kbd>⌘ K</kbd></label>
                <select aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Any priority</option>{priorities.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select>
                <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Any status</option>{statuses.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select>
              </div>
            </div>

            {error && <div className="notice notice-error" role="alert"><span>!</span>{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}
            <div className="table-wrap">
              <table className="work-table">
                <thead><tr><th>WORK ITEM</th><th>STATUS</th><th>PRIORITY</th><th>OWNER</th><th>TEAM</th><th>DUE</th><th /></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="item-cell"><Link href={`/items/${item.id}`} className="item-link"><span className={`type-mark type-${item.type.toLowerCase()}`}>{item.type === "INCIDENT" ? "!" : item.type === "PAYMENT" ? "$" : item.type === "COMPLIANCE" ? "✓" : item.type === "TASK" ? "↗" : "○"}</span><span className="item-title-wrap"><strong>{item.title}</strong><small>{labels[item.type]} <span>·</span> Opened {dateLabel(item.createdAt)}</small></span></Link></td>
                      <td><span className={`status-pill status-${item.status.toLowerCase()}`}><span />{labels[item.status]}</span></td>
                      <td><span className={`priority-label priority-${item.priority.toLowerCase()}`}><span />{labels[item.priority]}</span></td>
                      <td>{item.assignee ? <span className="owner-cell"><span className="owner-avatar">{item.assignee.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>{item.assignee.name.split(" ")[0]}</span> : <span className="unassigned">Unassigned</span>}</td>
                      <td><span className="table-team">{item.team.name}</span></td>
                      <td className={item.dueAt && new Date(item.dueAt) < new Date() && !["RESOLVED", "CLOSED"].includes(item.status) ? "due-over" : "due-date"}>{item.dueAt ? dateLabel(item.dueAt) : "—"}</td>
                      <td><Link className="row-arrow" href={`/items/${item.id}`} aria-label={`Open ${item.title}`}>↗</Link></td>
                    </tr>
                  ))}
                  {!items.length && !loading && <tr><td colSpan={7}><div className="empty-state"><span>✳</span><strong>A little breathing room.</strong><p>No work items match this view. Try another filter or create a new item.</p>{canCreate && <button className="button button-secondary" onClick={() => setShowCreate(true)}>Create work item</button>}</div></td></tr>}
                  {loading && !items.length && <tr><td colSpan={7}><div className="table-loading"><span className="spinner" />Finding the right work…</div></td></tr>}
                </tbody>
              </table>
            </div>
            <div className="table-footer"><span>Showing {items.length} item{items.length === 1 ? "" : "s"}{nextCursor ? " · more available" : ""}</span>{nextCursor && <button className="button button-secondary button-small" disabled={loading} onClick={() => void loadItems(true, nextCursor)}>Load more <span>↓</span></button>}</div>
          </div>
          <footer className="page-footer"><span>FIELDNOTE <span className="brand-period">·</span> BUILT FOR CLEAR HANDOFFS</span><span>Every important detail, accounted for.</span></footer>
        </div>
      </section>

      {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
        <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <div className="modal-heading"><div><p className="eyebrow">MAKE IT VISIBLE</p><h2 id="create-title">Start with the important bits.</h2></div><button className="close-button" onClick={() => setShowCreate(false)} aria-label="Close">×</button></div>
          <form className="create-form" onSubmit={createItem}>
            <label>What needs doing?<input name="title" required minLength={3} maxLength={160} placeholder="A short, useful title" autoFocus /></label>
            <label>Context for the next person<textarea name="description" required maxLength={10000} rows={4} placeholder="What happened, what have you tried, and what does good look like?" /></label>
            <div className="form-grid">
              <label>Work type<select name="type" defaultValue="TASK">{workTypes.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
              <label>Importance<select name="priority" defaultValue="MEDIUM">{priorities.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
            </div>
            <div className="form-grid">
              <label>Team<select name="teamId" required defaultValue={user.memberships.find(({ role }) => role !== "VIEWER")?.team.id}>{user.memberships.filter(({ role }) => role !== "VIEWER").map(({ team }) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              <label>Target date <span className="optional-label">optional</span><input name="dueAt" type="date" /></label>
            </div>
            <div className="modal-actions"><span>Changes are recorded in the activity trail.</span><button className="button button-primary" type="submit">Create work item <span>→</span></button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
