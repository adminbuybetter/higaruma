# Deadline Window Refactor Plan

## Goal

Replace the single appraisal deadline with explicit phase windows so the system can:

- open self-appraisal at the right time
- lock self-appraisal automatically at self close
- open manager review automatically after the self window
- lock manager review automatically at manager close
- show the correct deadline to the correct user
- send role-specific emails with the correct timing and deadline language

This matches the real process better than one shared cycle close date.

## Recommended Data Model

Use proper datetime/timestamp columns on the appraisal cycle.

Add:

- `self_opens_at`
- `self_closes_at`
- `manager_opens_at`
- `manager_closes_at`

Optional later:

- `release_opens_at`
- `release_closes_at`

## Why This Model

This is better than only adding `employee_due_at` and `manager_due_at` because the workflow is not just about deadlines. It is about windows:

- a stage can be `upcoming`
- a stage can be `open`
- a stage can be `closed`

That stage state should be computed from timestamps, not entered manually.

## Backend Behavior Rules

### Self-Appraisal Rules

Employee self-appraisal is:

- `upcoming` if `now < self_opens_at`
- `open` if `self_opens_at <= now <= self_closes_at`
- `closed` if `now > self_closes_at`

Allow:

- save draft only while self window is open
- submit only while self window is open
- edit submitted appraisal only while self window is open, if edit/reopen is allowed

Block:

- all self-appraisal writes before self open
- all self-appraisal writes after self close

### Manager Review Rules

Manager review is:

- `upcoming` if `now < manager_opens_at`
- `open` if `manager_opens_at <= now <= manager_closes_at`
- `closed` if `now > manager_closes_at`

Allow:

- manager KPI scoring only while manager window is open
- manager recommendation/final manager summary only while manager window is open

Block:

- all manager scoring before manager open
- all manager scoring after manager close

### HR Rules

HR can still:

- view all packets across all phases
- see both deadline windows
- release results after manager review is complete

Decision:

- keep HR release independent for Phase 1
- do not block HR release with a separate release window yet unless operations explicitly need it

## Frontend Behavior Rules

### Employee UI

Show only:

- self-appraisal deadline
- self phase status

Examples:

- `Self-appraisal opens on 24 June 2026`
- `You have 5 days left to submit your self-appraisal`
- `Self-appraisal closed on 30 June 2026`

Employee CTA behavior:

- before open: button disabled or replaced with `Opens soon`
- during open: normal edit/submit flow
- after close: read-only, no edits

### Manager UI

Show only:

- manager review deadline
- manager phase status

Examples:

- `Manager review opens on 1 July 2026`
- `You have 3 days left to complete team reviews`
- `Manager review closed on 7 July 2026`

Manager CTA behavior:

- before open: review drawer read-only, scoring disabled
- during open: scoring enabled
- after close: read-only, no score changes

### HR UI

Show:

- self window
- manager window
- current phase state

HR should be able to tell immediately:

- which staff still need to submit before self close
- which managers still need to complete reviews before manager close

## Email Behavior Rules

### Employee Emails

Employee intro and login emails should reference:

- the self-appraisal window
- the self-appraisal deadline

Not the manager deadline.

Example:

- `Your self-appraisal is now open`
- `Your submission deadline is 30 June 2026`

### Manager Emails

Managers should get a separate manager-facing email that references:

- the manager review open date
- the manager review close date
- the fact that they are reviewing after employee submission

Example:

- `Your team review window opens on 1 July 2026`
- `Please complete all manager appraisals by 7 July 2026`

### Existing Email Refactor Impact

Current employee sender logic can stay, but the template inputs need to change from one generic deadline to role-specific deadlines.

Add template fields like:

- `self_deadline`
- `manager_deadline`
- `self_open_date`
- `manager_open_date`

Only use the fields relevant to the recipient.

## Schema Change

### Current

Current cycle model effectively depends on one shared close date.

### Proposed

Update `appraisal_cycles` to include:

- `self_opens_at TIMESTAMP`
- `self_closes_at TIMESTAMP`
- `manager_opens_at TIMESTAMP`
- `manager_closes_at TIMESTAMP`

Keep the old generic `closes_at` only temporarily during migration if needed.

Recommended end state:

- remove dependence on generic `closes_at`
- treat stage windows as canonical

## API Refactor Impact

### Employee Workspace Response

Add phase-specific fields, for example:

- `self_opens_at`
- `self_closes_at`
- `self_phase_state`

### Manager Workspace Response

Add:

- `manager_opens_at`
- `manager_closes_at`
- `manager_phase_state`

### Admin Workspace Response

Include both windows so HR can reason about stage timing.

## Migration / Refactor Plan

### Step 1

Add the new cycle columns in the database migration.

### Step 2

Backfill the current active cycle with temporary values.

Recommended temporary backfill:

- `self_opens_at = opens_at`
- `self_closes_at = closes_at`
- `manager_opens_at = closes_at`
- `manager_closes_at = closes_at + chosen review duration`

This is only to avoid breaking existing rows while the UI catches up.

### Step 3

Update seed generation to emit:

- `selfOpensAt`
- `selfClosesAt`
- `managerOpensAt`
- `managerClosesAt`

### Step 4

Update backend rules:

- self write endpoints use self window
- manager write endpoints use manager window

### Step 5

Update employee frontend:

- replace generic deadline usage with self deadline
- lock UI from self window state

### Step 6

Update manager frontend:

- show manager deadline
- lock scoring from manager window state

### Step 7

Update email rendering:

- employee emails use self deadline/window
- manager emails use manager deadline/window

### Step 8

Update HR/release pages to display both phases clearly.

### Step 9

Remove any remaining dependency on the old generic cycle close field from runtime logic.

## Testing Plan

Add tests for:

- employee cannot submit before self open
- employee cannot submit after self close
- manager cannot score before manager open
- manager cannot score after manager close
- employee workspace shows self deadline only
- manager workspace shows manager deadline only
- email templates render the correct deadline per role

## Recommendation

Implement this as a phase-window refactor, not as a simple “two deadline fields” patch.

That gives:

- cleaner logic
- better automation
- more truthful UX
- safer locking behavior
- correct role-based email communication

This is still a manageable surgical refactor if done in the migration order above.
