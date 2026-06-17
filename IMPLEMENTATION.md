## Current Implementation

This prototype now uses `one real-person login per person`.

### Identity model

- No synthetic title-based manager accounts
- One person can hold multiple capabilities:
  - `employee`
  - `manager`
  - `admin`

### Confirmed removals

These people are removed from the prototype entirely:

- `Obathare Reuben Ejovwo`
- `Umaru Dogari`
- `Luka Ishaka`
- `Stephen Caleb`

### Special capability rules

- `Sandra Dunkwu`
  - capabilities: `manager`, `admin`
  - no self-appraisal
  - no employee appraisal record
- `Samuel Mbudinma`
  - capabilities: `employee`, `admin`

### Flow rules

- Self-appraisal happens first
- Manager scoring stays locked until self-appraisal is submitted
- HR/admin can see both:
  - self-appraisal content
  - manager review/final summary

### HR admin setup

HR can now resolve blocked designations from inside the app by:

- mapping the designation to an appraisal role
- copying an existing KPI pack
- or creating a custom KPI pack inline
- setting:
  - line manager / appraisal owner
  - reviewer
  - KPI owner

When saved, the app:

- updates affected employee records
- regenerates KPI assignments
- refreshes self-appraisal KPI rows
- removes that designation from unresolved setup
- recomputes employee and manager blockers

### Still unresolved in scope

These designation KPI packs still need HR/leadership setup in-app:

- `Admin/People Operation Officer`
- `Chief of Staff`
- `Facility Manager`
- `Field Operation Officer`
- `Finance Lead`
- `Finance Officer`
- `Growth Lead`
- `Quality Control (Wholesale)`

### Excluded this cycle

These designations remain intentionally excluded:

- `Director's Domestic Staff`
- `Driver`
- `Loader`
- `Nysc`
- `Security Personnel (16 A)`

### Generated outputs

The prototype regenerates:

- `src/data/seed.generated.ts`
- `src/data/credentials.generated.csv`
- `src/data/unresolved.generated.md`

### Current credential model

`credentials.generated.csv` now shows:

- primary capability
- full capability list
- username
- password
- employee id
- manager scopes

### Sharing later

Email sending is not implemented yet.
The next step for rollout is:

1. user provides final recipient list
2. credentials + link are sent from that list
3. unresolved designations are completed first for affected staff
