# Engineering decisions

## 1. Relational team membership and a compact work-item model

**Context.** Users can belong to several teams and have a different responsibility in each. Work also needs stable ownership, due dates, current state, and a large, growing history.

**Options considered.** Store team/role as a user-wide flag; put the activity log in an unstructured JSON document on the item; or model memberships, items, comments, and events as related tables.

**Choice.** PostgreSQL tables represent users, teams, per-team memberships, work items, comments, append-only activity events, idempotency keys, and outbox jobs. A work item carries a monotonic `version`; activity and comments are separate, independently indexed records.

**Trade-off.** The relational model is explicit and queryable, but needs migrations and joins. It makes team-scoped reads and a growing timeline much easier to protect and index than a single JSON blob.

## 2. Conditional writes and optimistic versions

**Context.** Two responders may claim one unassigned request, or a person may submit an edit based on a stale screen.

**Options considered.** Trust the browser, serialize every operation with a long-lived lock, or make each state-changing write conditional on the facts it observed.

**Choice.** Claims use one `UPDATE ... WHERE assigneeId IS NULL AND version = ?` and the winner increments the version. Edits and transitions include the expected version/status in the database update. A mismatch returns HTTP 409 with the latest item; the UI reloads and explains the conflict.

**Trade-off.** Users may need to review and retry a concurrent edit, but stale data cannot silently overwrite a newer decision and no application-wide lock is needed.

## 3. Resource authorization is a server concern

**Context.** A hidden button is not an access-control boundary, especially when people belong to multiple teams with different roles.

**Options considered.** Use a global role, trust the client to filter visible teams, or authorize each resource against a per-team membership.

**Choice.** Every item lookup is scoped to a team the signed-in user belongs to. Viewer, Member, Lead, and Admin roles gate reads and operations in shared server helpers; an outside-team item resolves as not found. Assignment also verifies that the target belongs to the same team.

**Trade-off.** The API pays for explicit authorization checks, and a user without membership sees 404 rather than learning that an item exists.

## 4. A small explicit workflow, with history in the same transaction

**Context.** Incidents, payments, approvals, and tasks need a visible next step; arbitrary status changes make a history hard to explain.

**Options considered.** Let clients set any status, or check a state-transition graph and approval role in the API.

**Choice.** The server enforces `Open → In progress → Awaiting approval → Resolved → Closed`, with a small, deliberate reopen path. Only Leads/Admins may approve or close. The item update and its activity event commit in one transaction.

**Trade-off.** The state graph does not try to encode every company's workflow. New statuses or exceptional paths need an explicit product decision and a migration/test update rather than being improvised in the client.

## 5. Idempotent creates and a transactional outbox

**Context.** A network retry can duplicate a request, while secondary work should not delay the main write or vanish if the process crashes.

**Options considered.** Send a notification before saving; fire-and-forget after saving; or persist a unique request key and an outbox job with the primary change.

**Choice.** A per-user idempotency key is unique in PostgreSQL. The item, initial activity event, outbox job, and key are committed together. A separate worker leases queued jobs with `FOR UPDATE SKIP LOCKED`, retries failures with bounded exponential backoff, recovers expired leases, and marks exhausted jobs failed.

**Trade-off.** Delivery is at least once, so a real downstream notification provider must deduplicate by outbox/job ID. The demo handler logs work instead of sending a real notification; the durable boundary and worker lifecycle are present without adding an unrelated provider integration.

## Search and scale assumptions

Work lists are filtered and cursor-paginated in PostgreSQL (20 items by default, 50 maximum); the browser never downloads the full queue. Team/status/priority/assignee and timeline indexes target the dashboard's common access paths. `pg_trgm` GIN indexes support the demo's substring search. At significantly larger scale, validate the query plans, add tenant-aware rate limits, consider partitioning the event table, and introduce a dedicated search service only if measurements justify it.
