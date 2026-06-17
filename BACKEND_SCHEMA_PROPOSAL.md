# Appraisal Backend Schema Proposal

## Goal

Move the appraisal prototype from browser `localStorage` into a real shared backend with:

- one source of truth
- multi-user access
- role-based visibility
- cycle-based appraisal records
- HR setup for unresolved roles/KPI packs
- auditable state transitions

## Recommended stack

- API: `FastAPI` or `Express`
- DB: `Postgres`
- Auth: email/username + password hash
- ORM:
  - Python: `SQLAlchemy`
  - Node: `Prisma` or `Drizzle`

This schema is backend-framework-agnostic.

## Design principles

1. One real person = one user account
2. A user can have multiple capabilities
3. Employee identity is separate from appraisal cycle records
4. KPI packs are reusable templates
5. Employee-cycle assignments are generated from:
   - designation mapping
   - KPI pack
   - appraisal cycle
6. Self-appraisal and manager appraisal are stored separately
7. Final release is a separate state, not implied by manager completion

## Core entities

### 1. users

Stores login identity.

Columns:
- `id` UUID PK
- `username` text unique not null
- `email` text unique null
- `password_hash` text not null
- `display_name` text not null
- `is_active` boolean not null default true
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

### 2. user_capabilities

Stores multi-role access per user.

Columns:
- `id` UUID PK
- `user_id` FK -> users.id
- `capability` text not null

Allowed values:
- `employee`
- `manager`
- `admin`

Unique:
- `(user_id, capability)`

### 3. employees

Stores roster identity and reporting metadata.

Columns:
- `id` UUID PK
- `employee_code` text unique not null
- `user_id` FK -> users.id null
- `full_name` text not null
- `designation` text not null
- `department` text null
- `level` text null
- `employment_status` text not null default `active`
- `can_self_appraise` boolean not null default true
- `excluded_this_cycle_default` boolean not null default false
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Notes:
- `Sandra` would exist here, but can have `can_self_appraise = false`
- removed people should be deactivated or omitted entirely

### 4. manager_scopes

Maps a manager user to the owner labels they can review.

Columns:
- `id` UUID PK
- `user_id` FK -> users.id
- `owner_label` text not null

Unique:
- `(user_id, owner_label)`

This preserves your current prototype model while still allowing future refactor to direct employee-manager relationships.

### 5. appraisal_cycles

Defines each review period.

Columns:
- `id` UUID PK
- `code` text unique not null
- `name` text not null
- `status` text not null
- `opens_at` timestamptz null
- `closes_at` timestamptz null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Allowed values for `status`:
- `draft`
- `open`
- `manager_review`
- `hr_review`
- `released`
- `closed`

### 6. kpi_packs

Template header for a role pack.

Columns:
- `id` UUID PK
- `role_name` text unique not null
- `department` text null
- `source_reference` text null
- `notes` text null
- `is_active` boolean not null default true
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Examples:
- `Finance Officer`
- `Finance Lead`
- `Inventory Officers & Leads`
- `Field Operation Officer`

### 7. kpi_pack_items

Individual KPI rows inside a pack.

Columns:
- `id` UUID PK
- `kpi_pack_id` FK -> kpi_packs.id
- `sort_order` integer not null
- `kpi_area` text not null
- `kpi_statement` text not null
- `weight_percent` numeric(5,2) not null
- `is_active` boolean not null default true

Constraint:
- total active `weight_percent` for a pack should equal `100`

### 8. designation_role_mappings

This is where HR resolves “what KPI pack applies to this designation?”

Columns:
- `id` UUID PK
- `designation` text unique not null
- `kpi_pack_id` FK -> kpi_packs.id null
- `department` text null
- `line_manager_label` text null
- `reviewer_label` text null
- `kpi_owner_label` text null
- `self_appraisal_required` boolean not null default true
- `needs_clarification` boolean not null default false
- `notes` text null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

This table is the live version of your current CSV mapping sheet.

### 9. employee_cycle_assignments

This is the cycle-specific assignment header per employee.

Columns:
- `id` UUID PK
- `employee_id` FK -> employees.id
- `appraisal_cycle_id` FK -> appraisal_cycles.id
- `designation_mapping_id` FK -> designation_role_mappings.id null
- `kpi_pack_id` FK -> kpi_packs.id null
- `appraisal_role_name` text null
- `line_manager_label` text null
- `reviewer_label` text null
- `kpi_owner_label` text null
- `primary_owner_label` text null
- `status` text not null
- `excluded_this_cycle` boolean not null default false
- `blockers_json` jsonb not null default `[]`
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Allowed status:
- `ready`
- `tentative`
- `blocked`

This is the cycle snapshot of the employee’s setup.

### 10. employee_kpi_assignments

Generated KPI rows per employee per cycle.

Columns:
- `id` UUID PK
- `employee_cycle_assignment_id` FK -> employee_cycle_assignments.id
- `kpi_pack_item_id` FK -> kpi_pack_items.id null
- `sort_order` integer not null
- `kpi_area` text not null
- `kpi_statement` text not null
- `weight_percent` numeric(5,2) not null
- `manager_score` integer not null default 0
- `manager_comment` text null
- `evidence_note` text null
- `development_action` text null
- `manager_status` text not null default `pending`
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Allowed `manager_status`:
- `pending`
- `in_review`
- `completed`

### 11. self_appraisals

One self-appraisal header per employee per cycle.

Columns:
- `id` UUID PK
- `employee_cycle_assignment_id` FK -> employee_cycle_assignments.id unique
- `status` text not null default `draft`
- `overall_achievements` text null
- `major_challenges` text null
- `support_needed` text null
- `development_focus` text null
- `employee_comments` text null
- `submitted_at` timestamptz null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Allowed `status`:
- `draft`
- `submitted`

### 12. self_appraisal_items

Stores the employee’s self-score per KPI row.

Columns:
- `id` UUID PK
- `self_appraisal_id` FK -> self_appraisals.id
- `employee_kpi_assignment_id` FK -> employee_kpi_assignments.id
- `self_score` integer not null default 0
- `reason_for_score` text null
- `key_evidence` text null
- `challenges_faced` text null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Unique:
- `(self_appraisal_id, employee_kpi_assignment_id)`

### 13. final_results

Stores the post-manager review summary and release control.

Columns:
- `id` UUID PK
- `employee_cycle_assignment_id` FK -> employee_cycle_assignments.id unique
- `self_summary` text null
- `manager_summary` text null
- `final_recommendation` text null
- `final_score` numeric(5,2) not null default 0
- `performance_band` text not null default `Not rated`
- `released_to_employee` boolean not null default false
- `released_at` timestamptz null
- `released_by_user_id` FK -> users.id null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

### 14. audit_events

Tracks important state changes.

Columns:
- `id` UUID PK
- `actor_user_id` FK -> users.id null
- `entity_type` text not null
- `entity_id` UUID not null
- `event_type` text not null
- `payload_json` jsonb not null default `{}`
- `created_at` timestamptz not null

Examples:
- self appraisal submitted
- manager score changed
- designation mapping resolved
- final result released

## End-to-end flow on this schema

1. HR creates/opens an appraisal cycle
2. Employees already exist in `employees`
3. HR maintains designation-to-pack mapping in `designation_role_mappings`
4. System generates `employee_cycle_assignments`
5. System generates `employee_kpi_assignments`
6. Employee completes `self_appraisal` and `self_appraisal_items`
7. Manager completes `employee_kpi_assignments` scoring
8. Final summary lands in `final_results`
9. HR releases result to employee

## Encapsulation / visibility rules

### Employee can see
- their own `employee_cycle_assignment`
- their own `self_appraisal`
- their own `self_appraisal_items`
- their own `final_result` only when `released_to_employee = true`

### Manager can see
- employee cycle assignments where:
  - `primary_owner_label` is in their allowed `manager_scopes`
- linked self-appraisal and KPI rows for those employees

### HR/Admin can see
- all records
- unresolved mappings
- audit history
- release controls

## What the current remaining unresolved roles map to

These should eventually become real `kpi_packs`:

- `Admin/People Operation Officer`
- `Growth Lead`
- `Quality Control (Wholesale)`

`Chief of Staff` should not be part of unresolved employee setup now because Sandra is manager/admin only.

## Recommendation on next implementation slice

Build in this order:

1. `users`, `user_capabilities`, `employees`
2. `kpi_packs`, `kpi_pack_items`, `designation_role_mappings`
3. `appraisal_cycles`, `employee_cycle_assignments`, `employee_kpi_assignments`
4. `self_appraisals`, `self_appraisal_items`
5. `final_results`
6. `audit_events`

## Minimal open questions

I do not need a full grilling session, but these still matter:

1. Should `manager_scopes` remain label-based long term, or do you want direct manager-to-employee links later?
2. Should `reviewer` stay optional, or do you want a real second-level approval flow?
3. For `Quality Control (Wholesale)`, do you want a temporary proxy pack or a dedicated pack immediately?
