"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, RequestError } from "@/lib/client-api";
import ThemeMenu from "@/components/ThemeMenu";
import Brand from "@/components/Brand";

type Person = { id: string; name: string; email?: string };
type TeamMember = Person & { role: string };
type Activity = { id: string; type: string; message: string; createdAt: string; actor: Person };
type Comment = { id: string; body: string; createdAt: string; author: Person };
type WorkItem = {
  id: string; title: string; description: string; type: string; priority: string; status: string;
  version: number; dueAt: string | null; createdAt: string; updatedAt: string; assigneeId: string | null;
  teamId: string; team: { id: string; name: string };
  assignee: Person | null; createdBy: Person; activities: Activity[];
  comments: Comment[]; teamMembers: TeamMember[];
  nextActivityCursor: string | null;
};
type User = {
  id: string; name: string; email: string;
  memberships: { role: string; team: { id: string; name: string } }[];
};

const titleFor: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In progress", AWAITING_APPROVAL: "Awaiting approval",
  RESOLVED: "Resolved", CLOSED: "Closed", INCIDENT: "Incident",
  CUSTOMER_ISSUE: "Customer issue", PAYMENT: "Payment", COMPLIANCE: "Compliance",
  TASK: "Task", LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent",
};
const transitionOptions: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS"], IN_PROGRESS: ["OPEN", "AWAITING_APPROVAL"],
  AWAITING_APPROVAL: ["IN_PROGRESS", "RESOLVED"], RESOLVED: ["IN_PROGRESS", "CLOSED"], CLOSED: [],
};
const roleScore: Record<string, number> = { VIEWER: 0, MEMBER: 1, LEAD: 2, ADMIN: 3 };
const initials = (name: string) => name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
const timestamp = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

export default function WorkItemDetail({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [item, setItem] = useState<WorkItem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editAssignee, setEditAssignee] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const current = await apiRequest<WorkItem>(`/api/items/${itemId}`);
      setItem(current);
      setEditTitle(current.title);
      setEditDescription(current.description);
      setEditPriority(current.priority);
      setEditAssignee(current.assignee?.id ?? "");
    } catch (reason) {
      if (reason instanceof RequestError && reason.status === 401) router.replace("/login");
      else setError(reason instanceof Error ? reason.message : "Could not load this work item.");
    } finally {
      setLoading(false);
    }
  }, [itemId, router]);

  useEffect(() => {
    apiRequest<User>("/api/auth/me").then(setUser).catch(() => router.replace("/login"));
    void reload();
  }, [reload, router]);

  if (loading && !item) return <main className="boot-screen"><span className="spinner" /><p>Finding the full story…</p></main>;
  if (!item) return <main className="detail-missing"><Link href="/" className="back-link">← Back to work queue</Link><h1>We couldn't open this item.</h1><p>{error || "It may have moved, or you may not have access to it."}</p></main>;

  const currentItem = item;
  const role = user?.memberships.find(({ team }) => team.id === item.teamId)?.role ?? "VIEWER";
  const canWork = (roleScore[role] ?? 0) >= roleScore.MEMBER;
  const canLead = (roleScore[role] ?? 0) >= roleScore.LEAD;
  const isActive = !["RESOLVED", "CLOSED"].includes(item.status);
  const workflowSteps = ["OPEN", "IN_PROGRESS", "AWAITING_APPROVAL", "RESOLVED", "CLOSED"];
  const workflowPosition = workflowSteps.indexOf(item.status);
  const nextAction = item.status === "OPEN" ? "Start the work" :
    item.status === "IN_PROGRESS" ? "Make progress, then request a lead review" :
      item.status === "AWAITING_APPROVAL" ? "A team lead needs to decide" :
        item.status === "RESOLVED" ? "Close the loop when you're ready" : "This item is complete";

  async function perform(action: () => Promise<unknown>, success?: (result: unknown) => void) {
    setSaving(true);
    setError("");
    try {
      const result = await action();
      if (success) success(result);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The action could not be completed.");
      if (reason instanceof RequestError && reason.status === 409) await reload();
    } finally {
      setSaving(false);
    }
  }

  async function deleteComment(commentId: string) {
    if (!window.confirm("Remove this note? This cannot be undone.")) return;
    setDeletingComment(commentId);
    await perform(() => apiRequest(`/api/items/${currentItem.id}/comments/${commentId}`, { method: "DELETE" }));
    setDeletingComment(null);
  }

  async function updateDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: Record<string, unknown> = {
      version: currentItem.version,
      title: editTitle,
      description: editDescription,
    };
    if (canLead) {
      body.priority = editPriority;
      body.assigneeId = editAssignee || null;
    }
    await perform(() => apiRequest(`/api/items/${currentItem.id}`, { method: "PATCH", body: JSON.stringify(body) }));
  }

  async function postComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) return;
    const text = comment;
    await perform(
      () => apiRequest(`/api/items/${currentItem.id}/comments`, { method: "POST", body: JSON.stringify({ body: text }) }),
      () => setComment(""),
    );
  }

  async function transition(nextStatus: string) {
    await perform(() => apiRequest(`/api/items/${currentItem.id}/transition`, {
      method: "POST",
      body: JSON.stringify({ version: currentItem.version, status: nextStatus }),
    }));
  }

  async function loadOlderActivity() {
    if (!currentItem.nextActivityCursor) return;
    setLoadingActivity(true);
    try {
      const page = await apiRequest<{ events: Activity[]; nextCursor: string | null }>(
        `/api/items/${currentItem.id}/activity?limit=30&cursor=${encodeURIComponent(currentItem.nextActivityCursor)}`,
      );
      setItem((current) => current ? {
        ...current,
        activities: [...current.activities, ...page.events],
        nextActivityCursor: page.nextCursor,
      } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load older activity.");
    } finally {
      setLoadingActivity(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar detail-sidebar">
        <Brand className="brand-sidebar" />
        <div className="workspace-label">WORKSPACE</div>
        <Link href="/" className="detail-back-nav"><span>←</span> All work</Link>
        <div className="sidebar-divider" />
        <div className="detail-context"><span className="context-type">{titleFor[item.type]}</span><h3>{item.title}</h3><span className="context-id">FN-{item.id.slice(-6).toUpperCase()}</span></div>
        <div className="sidebar-bottom"><div className="help-card"><div className="help-mark">✳</div><strong>A clearer handoff</strong><p>Before you pass work along, share what changed, what comes next, and who owns it.</p></div><Link className="user-menu" href="/profile">
          <span className="user-avatar">{user ? initials(user.name) : "?"}</span><span className="user-meta"><strong>{user?.name ?? "Your account"}</strong><small>{role.toLowerCase()} · {item.team.name}</small></span><span className="user-more">Profile ↗</span>
        </Link></div>
      </aside>
      <section className="main-panel">
        <header className="topbar"><div className="breadcrumb"><Link href="/">Operations</Link><span className="crumb-slash">/</span><Link href={`/teams/${item.team.id}`}>{item.team.name}</Link><span className="crumb-slash">/</span><strong>{item.id.slice(-6).toUpperCase()}</strong></div><div className="topbar-right"><span className="live-indicator"><span /> Changes saved live</span><ThemeMenu /></div></header>
        <div className="detail-content">
          <div className="detail-topline"><Link href="/" className="back-link">← Back to work queue</Link><span>Last updated {timestamp(item.updatedAt)}</span></div>
          {error && <div className="notice notice-error" role="alert"><span>!</span><div>{error}{error.toLowerCase().includes("changed") && <p>Your local changes were not applied. The latest version is now loaded.</p>}</div><button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}

          <div className="detail-layout">
            <div className="detail-primary">
              <div className="detail-heading">
                <div className="detail-tags"><span className={`status-pill status-${item.status.toLowerCase()}`}><span />{titleFor[item.status]}</span><span className={`priority-label priority-${item.priority.toLowerCase()}`}><span />{titleFor[item.priority]} priority</span><span className="detail-type">{titleFor[item.type]}</span></div>
                <h1>{item.title}</h1>
                <p className="detail-subtitle">Created by {item.createdBy.name} <span>·</span> {timestamp(item.createdAt)} <span>·</span> Version {item.version}</p>
              </div>

              <section className="detail-card description-card">
                <div className="section-heading"><div><p className="eyebrow">THE CONTEXT</p><h2>What’s happening</h2></div><span className="section-number">01</span></div>
                <p className="description-copy">{item.description}</p>
              </section>

              <section className="detail-card activity-card">
                <div className="section-heading"><div><p className="eyebrow">THE PAPER TRAIL</p><h2>Activity & decisions <span className="inline-count">{item.activities.length}</span></h2></div><span className="section-number">02</span></div>
                <div className="timeline">
                  {item.activities.map((activity, index) => (
                    <article className="timeline-entry" key={activity.id}>
                      <span className={`timeline-marker marker-${activity.type.toLowerCase()}`}>{activity.type === "STATUS_CHANGED" ? "↗" : activity.type === "PRIORITY_CHANGED" ? "!" : activity.type === "COMMENTED" ? "“" : activity.type === "NOTE_DELETED" ? "−" : activity.type === "CREATED" ? "＋" : "·"}</span>
                      <div className="timeline-content"><div className="timeline-message"><strong>{activity.actor.name}</strong> {activity.message}</div><time>{timestamp(activity.createdAt)}</time></div>
                      {index < item.activities.length - 1 && <span className="timeline-line" />}
                    </article>
                  ))}
                  {!item.activities.length && <p className="muted-copy">No activity recorded yet.</p>}
                </div>
                {item.nextActivityCursor && <button className="button button-secondary button-small activity-more" disabled={loadingActivity} onClick={() => void loadOlderActivity()}>{loadingActivity ? "Loading…" : "Load older activity"} <span>↓</span></button>}
              </section>

              <section className="detail-card comments-card">
                <div className="section-heading"><div><p className="eyebrow">KEEP THE HANDOFF HUMAN</p><h2>Notes & conversation <span className="inline-count">{item.comments.length}</span></h2></div><span className="section-number">03</span></div>
                <div className="comments-list">
                  {item.comments.map((entry) => {
                    const canDelete = entry.author.id === user?.id || canLead;
                    return <article className="comment-entry" key={entry.id}><span className="comment-avatar">{initials(entry.author.name)}</span><div className="comment-body"><div className="comment-meta"><strong>{entry.author.name}</strong><time>{timestamp(entry.createdAt)}</time>{canDelete && <button className="delete-note-button" title="Delete note" aria-label={`Delete note by ${entry.author.name}`} disabled={deletingComment === entry.id || saving} onClick={() => void deleteComment(entry.id)}>{deletingComment === entry.id ? "…" : "Delete"}</button>}</div><p>{entry.body}</p></div></article>;
                  })}
                  {!item.comments.length && <p className="muted-copy">No notes yet. Add context that helps the next person.</p>}
                </div>
                {canWork && <form className="comment-form" onSubmit={postComment}><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Share a useful update or handoff…" rows={3} maxLength={4000} aria-label="Write a comment" /><div><span>Visible to teammates in {item.team.name}</span><button className="button button-primary button-small" disabled={saving || !comment.trim()}>Add note <span>→</span></button></div></form>}
              </section>
            </div>

            <aside className="detail-rail">
              <section className="detail-card next-step-card">
                <p className="eyebrow">THE NEXT STEP</p>
                <h2>{item.status === "AWAITING_APPROVAL" ? "A decision is needed." : item.status === "RESOLVED" ? "Ready to close the loop." : item.status === "CLOSED" ? "This work is complete." : item.assigneeId ? "Keep the momentum." : "Who can take this forward?"}</h2>
                <p className="next-step-guidance">{item.status === "AWAITING_APPROVAL" ? "A team lead can approve the completed work or send it back so the team can continue." : item.status === "CLOSED" ? "This item stays in the history for future reference." : item.assignee ? `${item.assignee.name.split(" ")[0]} owns the next move. ${nextAction}.` : `Nobody owns this yet. A clear owner makes the next move possible. ${nextAction}.`}</p>
                <div className="workflow-progress" aria-label={`Workflow progress: ${titleFor[item.status]}`}>
                  {workflowSteps.map((step, index) => <span key={step} className={`workflow-progress-step ${index < workflowPosition ? "workflow-step-done" : ""} ${index === workflowPosition ? "workflow-step-current" : ""}`} title={titleFor[step]}><span>{index < workflowPosition ? "✓" : String(index + 1)}</span><small>{titleFor[step]}</small></span>)}
                </div>
                {item.dueAt && <div className="next-step-due"><span>Target date</span><strong className={new Date(item.dueAt) < new Date() && isActive ? "due-over" : ""}>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(item.dueAt))}</strong></div>}
                {!item.assigneeId && isActive && canWork && <button className="button button-primary button-wide" disabled={saving} onClick={() => void perform(() => apiRequest(`/api/items/${item.id}/claim`, { method: "POST", body: JSON.stringify({ version: item.version }) }))}>Take ownership <span>→</span></button>}
                {item.assigneeId === user?.id && isActive && <div className="ownership-note"><span className="status-dot green-dot" /> You’re the owner of this item.</div>}
                {!canWork && <div className="ownership-note">Read-only access for your team role.</div>}
                <div className="next-divider" />
                <label className="field-caption" htmlFor="status-action">MOVE THIS WORK</label>
                <div className="transition-list">
                  {transitionOptions[item.status].map((next) => {
                    const approvalOnly = item.status === "AWAITING_APPROVAL" || next === "CLOSED";
                    const allowed = canWork && (!approvalOnly || canLead);
                    return <button key={next} className={`transition-button ${next === "RESOLVED" || next === "CLOSED" ? "transition-positive" : ""}`} disabled={!allowed || saving} onClick={() => void transition(next)}>
                      <span>{next === "AWAITING_APPROVAL" ? "Request approval" : next === "RESOLVED" ? "Approve & resolve" : next === "CLOSED" ? "Close work item" : next === "IN_PROGRESS" ? "Start / resume work" : "Reopen work"}</span><span>→</span>
                    </button>;
                  })}
                  {!transitionOptions[item.status].length && <p className="muted-copy">No further status changes are available.</p>}
                </div>
              </section>

              <section className="detail-card properties-card">
                <div className="section-heading compact-heading"><div><p className="eyebrow">ITEM DETAILS</p><h2>Properties</h2></div><span className="section-number">↘</span></div>
                <div className="property-list">
                  <div><span className="property-label">TEAM</span><span className="property-value"><span className="team-dot team-dot-0" />{item.team.name}</span></div>
                  <div><span className="property-label">OWNER</span><span className="property-value">{item.assignee ? <><span className="owner-avatar">{initials(item.assignee.name)}</span>{item.assignee.name}</> : <span className="unassigned">Unassigned</span>}</span></div>
                  <div><span className="property-label">DUE DATE</span><span className={`property-value ${item.dueAt && new Date(item.dueAt) < new Date() && isActive ? "due-over" : ""}`}>{item.dueAt ? new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(item.dueAt)) : "Not set"}</span></div>
                  <div><span className="property-label">CREATED BY</span><span className="property-value"><span className="owner-avatar owner-avatar-soft">{initials(item.createdBy.name)}</span>{item.createdBy.name}</span></div>
                </div>
              </section>

              {canWork && <section className="detail-card edit-card">
                <div className="section-heading compact-heading"><div><p className="eyebrow">MAKE A CHANGE</p><h2>Edit details</h2></div></div>
                <form className="edit-form" onSubmit={updateDetails}>
                  <label>Title<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required minLength={3} maxLength={160} /></label>
                  <label>Description<textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} required maxLength={10000} rows={4} /></label>
                  {canLead && <>
                    <label>Priority<select value={editPriority} onChange={(event) => setEditPriority(event.target.value)}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => <option key={value} value={value}>{titleFor[value]}</option>)}</select></label>
                    <label>Assignee<select value={editAssignee} onChange={(event) => setEditAssignee(event.target.value)}><option value="">Unassigned</option>{item.teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role.toLowerCase()}</option>)}</select></label>
                  </>}
                  <button className="button button-secondary button-wide" disabled={saving || editTitle === item.title && editDescription === item.description && editPriority === item.priority && editAssignee === (item.assignee?.id ?? "")}>Save changes <span>↗</span></button>
                </form>
                <p className="edit-footnote">Updates use version {item.version} and are saved with their activity record.</p>
              </section>}
              <div className="privacy-note"><span>◇</span><p>Visible only to members of <strong>{item.team.name}</strong>. Access is checked every time.</p></div>
            </aside>
          </div>
          <footer className="page-footer"><span>OPSPILOT <span className="brand-period">·</span> BUILT FOR CLEAR HANDOFFS</span><span>Every important detail, accounted for.</span></footer>
        </div>
      </section>
    </main>
  );
}
