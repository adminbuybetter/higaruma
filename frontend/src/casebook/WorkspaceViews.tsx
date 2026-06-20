import { useEffect, useState } from 'react'
import type {
  AppState,
  AppUser,
  AssignmentRecord,
  EmployeeRecord,
  FinalResultRecord,
  RoleKpiEntry,
  SelfAppraisalRecord,
  SelfKpiEntry,
} from '../types'

type OverviewProps = {
  variant: 'manager' | 'admin'
  currentUser: AppUser
  employee: EmployeeRecord | null
  selfRecord: SelfAppraisalRecord | null
  assignments: AssignmentRecord[]
  finalResult: FinalResultRecord | null
  reviewEmployees: EmployeeRecord[]
  state: AppState
}

type EmployeeProps = {
  employee: EmployeeRecord
  selfRecord: SelfAppraisalRecord
  assignments: AssignmentRecord[]
  finalResult: FinalResultRecord
  workspaceLoading: boolean
  workspaceError: string
  onUpdateSelf: (employeeId: string, patch: Partial<SelfAppraisalRecord>) => void
  onUpdateSelfKpiEntry: (employeeId: string, assignmentId: string, patch: Partial<SelfKpiEntry>) => void
  onSubmitSelf: (employeeId: string) => void
}

type ManagerProps = {
  state: AppState
  employees: EmployeeRecord[]
  selectedEmployee: EmployeeRecord | null
  assignments: AssignmentRecord[]
  selfRecord: SelfAppraisalRecord | null
  finalResult: FinalResultRecord | null
  onSelectEmployee: (employeeId: string) => void
  onUpdateAssignment: (assignmentId: string, patch: Partial<AssignmentRecord>) => void
  onUpdateFinalResult: (employeeId: string, patch: Partial<FinalResultRecord>) => void
}

type AdminProps = ManagerProps & {
  state: AppState
  rolePackLibrary: Map<string, RoleKpiEntry[]>
  onResolveDesignationSetup: (input: {
    designation: string
    roleName: string
    sourceRoleName: string
    entries: RoleKpiEntry[]
    managerLabel: string
    reviewerLabel: string
    kpiOwnerLabel: string
  }) => void
  onReset: () => void
}

type ReleaseProps = {
  state: AppState
  onUpdateFinalResult: (employeeId: string, patch: Partial<FinalResultRecord>) => void
}

const PAGE_SIZE = 100

export function CasebookOverviewWorkspace({
  variant,
  currentUser,
  employee,
  selfRecord,
  assignments,
  finalResult,
  reviewEmployees,
  state,
}: OverviewProps) {
  const [resultOpen, setResultOpen] = useState(false)
  const readyCount = reviewEmployees.filter((record) => reviewStateForEmployee(record, state) === 'ready').length
  const waitingCount = reviewEmployees.filter((record) => reviewStateForEmployee(record, state) === 'waiting').length
  const unresolvedCount = state.unresolvedDesignations.length
  const releasedCount = state.finalResults.filter((record) => record.releasedToEmployee).length
  const ownStatus = selfRecord?.status === 'submitted' ? 'ready' : 'draft'

  return (
    <>
      <section className="view active">
        <div className="topbar">
          <div>
            <h1>
              {variant === 'admin' ? `Welcome back, ${firstName(currentUser.displayName)}` : `Welcome back, ${firstName(currentUser.displayName)}`}
            </h1>
            <div className="meta">
              {employee
                ? `${employee.designation} · Reports to ${employee.primaryOwnerLabel || 'Not mapped'}`
                : 'Cycle oversight across active appraisal staff'}
            </div>
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-eyebrow">Your appraisal</div>
            <div className="card-header">
              <div>
                <div className="card-title">
                  {employee ? `${assignments.length} KPIs to self-rate` : 'No employee appraisal lane'}
                </div>
                <div className="card-sub">
                  {employee
                    ? 'Weighted across your assigned scored areas'
                    : 'This account currently has oversight access only.'}
                </div>
              </div>
              {employee ? <Stamp kind={ownStatus} label={ownStatus === 'ready' ? 'Ready' : 'Draft'} /> : null}
            </div>
            {employee ? <MiniStepper mode="employee" finalReleased={Boolean(finalResult?.releasedToEmployee)} currentStep={2} /> : null}
            {employee ? (
              <a className="btn btn--primary" href="/appraisal">
                Continue self-appraisal
              </a>
            ) : (
              <span className="card-sub">No self-appraisal data on this account.</span>
            )}
          </div>

          <div className="card">
            <div className="card-eyebrow">{variant === 'admin' ? 'Cycle oversight' : 'Your team'}</div>
            <div className="card-header">
              <div>
                <div className="card-title">
                  {variant === 'admin' ? `${reviewEmployees.length} active staff` : `${reviewEmployees.length} direct reports`}
                </div>
                <div className="card-sub">
                  {variant === 'admin'
                    ? `${readyCount} ready · ${unresolvedCount} unresolved designation packs`
                    : `${readyCount} ready to score · ${waitingCount} waiting on self-appraisal`}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {reviewEmployees.slice(0, 3).map((report) => {
                const stateLabel = reviewStateForEmployee(report, state)
                return (
                  <div key={report.employeeId} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <Stamp kind={stateLabel} label={stampLabelForReviewState(stateLabel)} />
                    {report.employeeName} — {report.designation}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn btn--secondary" href="/team">
                {variant === 'admin' ? 'Open review queue' : 'Review team'}
              </a>
              {variant === 'admin' ? (
                <a className="btn btn--ghost" href="/release">
                  Open release control
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-eyebrow">{variant === 'admin' ? 'Release control' : 'Current result'}</div>
          <div className="cycle-row" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
            <div className="info">
              <h4>
                {variant === 'admin'
                  ? `${releasedCount} released · ${state.finalResults.length - releasedCount} held`
                  : employee
                    ? `${employee.employeeName} · ${finalResult?.performanceBand ?? 'Not rated'}`
                    : 'No result packet'}
              </h4>
              <p>
                {variant === 'admin'
                  ? 'HR visibility and release status across the active cycle'
                  : finalResult?.releasedToEmployee
                    ? 'Final result has been released'
                    : 'Manager review remains hidden until release'}
              </p>
            </div>
            <Stamp
              kind={
                variant === 'admin'
                  ? releasedCount > 0
                    ? 'released'
                    : 'held'
                  : finalResult?.releasedToEmployee
                    ? 'released'
                    : 'held'
              }
              label={
                variant === 'admin'
                  ? releasedCount > 0
                    ? 'Active'
                    : 'Held'
                  : finalResult?.releasedToEmployee
                    ? 'Released'
                    : 'Held'
              }
            />
            {finalResult && employee ? (
              <button className="btn btn--ghost btn--sm" onClick={() => setResultOpen(true)}>
                View result
              </button>
            ) : variant === 'admin' ? (
              <a className="btn btn--ghost btn--sm" href="/release">
                Open release control
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {employee && selfRecord && finalResult ? (
        <ResultDrawer
          open={resultOpen}
          onClose={() => setResultOpen(false)}
          employee={employee}
          selfRecord={selfRecord}
          assignments={assignments}
          finalResult={finalResult}
        />
      ) : null}
    </>
  )
}

export function CasebookEmployeeWorkspace({
  employee,
  selfRecord,
  assignments,
  finalResult,
  workspaceLoading,
  workspaceError,
  onUpdateSelf,
  onUpdateSelfKpiEntry,
  onSubmitSelf,
}: EmployeeProps) {
  const [selfOpen, setSelfOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  return (
    <>
      <section className="view active">
        <div className="topbar">
          <div>
            <div className="title-with-stamp">
              <h1>My Appraisal</h1>
              <Stamp kind={selfRecord.status === 'submitted' ? 'ready' : 'draft'} label={selfRecord.status === 'submitted' ? 'Ready' : 'Draft'} />
            </div>
            <div className="meta">
              {selfRecord.cycle} Cycle · {assignments.length} KPIs · {employee.designation}
            </div>
          </div>
          <button className="btn btn--primary" onClick={() => setSelfOpen(true)}>
            Open self appraisal
          </button>
        </div>

        <MiniStepper mode="employee" currentStep={2} finalReleased={finalResult.releasedToEmployee} />

        <div className="section-label">Assigned KPIs</div>
        <div className="kpi-summary-list" style={{ marginBottom: 20 }}>
          {assignments.map((assignment) => (
            <div key={assignment.assignmentId} className="kpi-summary-row">
              <span className="weight-badge">{assignment.weightPercent}%</span>
              <div className="names">
                <div className="kpi-title">{assignment.kpiArea}</div>
                <div className="kpi-desc-sm">{assignment.kpiStatement}</div>
              </div>
            </div>
          ))}
        </div>

        {workspaceLoading ? <p className="card-sub">Refreshing your appraisal workspace…</p> : null}
        {workspaceError ? <p className="error-text">{workspaceError}</p> : null}

        <div className="section-label">Final result</div>
        <div className="card held-card">
          <div className="held-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="5" y="11" width="14" height="9" rx="1.5" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
          <div>
            <h3>{finalResult.releasedToEmployee ? 'Released' : 'Held until release'}</h3>
            <p>
              {finalResult.releasedToEmployee
                ? 'Your final appraisal packet is now visible.'
                : 'Your manager appraisal stays hidden until HR releases the final result.'}
            </p>
            {finalResult.releasedToEmployee ? (
              <button className="btn btn--secondary btn--sm" style={{ marginTop: 12 }} onClick={() => setResultOpen(true)}>
                View result
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <SelfDrawer
        open={selfOpen}
        onClose={() => setSelfOpen(false)}
        employee={employee}
        selfRecord={selfRecord}
        assignments={assignments}
        onUpdateSelf={onUpdateSelf}
        onUpdateSelfKpiEntry={onUpdateSelfKpiEntry}
        onSubmitSelf={(employeeId) => {
          onSubmitSelf(employeeId)
          setToast('Self-appraisal submitted')
        }}
        onSaveDraft={() => setToast('Draft saved')}
      />

      <ResultDrawer
        open={resultOpen}
        onClose={() => setResultOpen(false)}
        employee={employee}
        selfRecord={selfRecord}
        assignments={assignments}
        finalResult={finalResult}
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  )
}

export function CasebookManagerWorkspace({
  state,
  employees,
  selectedEmployee,
  assignments,
  selfRecord,
  finalResult,
  onSelectEmployee,
  onUpdateAssignment,
  onUpdateFinalResult,
}: ManagerProps) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [employeePage, setEmployeePage] = useState(1)
  const pagedEmployees = paginateRows(employees, employeePage)

  return (
    <>
      <section className="view active">
        <div className="topbar">
          <div>
            <h1>My Team</h1>
            <div className="meta">H1 2026 Cycle · Review direct reports, score KPI rows, then draft your recommendation</div>
          </div>
        </div>

        <MiniStepper mode="manager" currentStep={2} finalReleased={false} />

        <ListSectionHeader title="Review queue" total={employees.length} page={employeePage} pageSize={PAGE_SIZE} />
        <div className="team-list">
          {pagedEmployees.map((employee) => {
            const employeeSelfRecord = state.selfAppraisals.find((record) => record.employeeId === employee.employeeId) ?? null
            const isReady = employeeSelfRecord?.status === 'submitted' || false

            return (
              <div key={employee.employeeId} className="team-card">
                <div className="team-avatar">{initials(employee.employeeName)}</div>
                <div className="team-info">
                  <div className="name">{employee.employeeName}</div>
                  <div className="role">{employee.designation}</div>
                  <div className="team-meta">
                    {employee.appraisalRole || employee.designation} · {isReady ? 'Self-appraisal submitted' : 'No self-summary yet'}
                  </div>
                </div>
                <div className="right">
                  <Stamp kind={isReady ? 'ready' : 'waiting'} label={isReady ? 'Ready' : 'Waiting'} />
                  <button
                    className="btn btn--secondary btn--sm"
                    onClick={() => {
                      onSelectEmployee(employee.employeeId)
                      setReviewOpen(true)
                    }}
                  >
                    Review
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <PaginationControls page={employeePage} total={employees.length} pageSize={PAGE_SIZE} onChange={setEmployeePage} />
      </section>

      <ReviewDrawer
        open={reviewOpen && Boolean(selectedEmployee)}
        onClose={() => setReviewOpen(false)}
        employee={selectedEmployee}
        assignments={assignments}
        selfRecord={selfRecord}
        finalResult={finalResult}
        onUpdateAssignment={onUpdateAssignment}
        onUpdateFinalResult={onUpdateFinalResult}
        onSaveDraft={() => setToast('Draft saved')}
        onSubmit={() => setToast('Recommendation submitted')}
        variant="manager"
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  )
}

export function CasebookAdminWorkspace({
  state,
  rolePackLibrary,
  employees,
  selectedEmployee,
  assignments,
  selfRecord,
  finalResult,
  onSelectEmployee,
  onUpdateAssignment,
  onUpdateFinalResult,
  onResolveDesignationSetup,
  onReset,
}: AdminProps) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [employeePage, setEmployeePage] = useState(1)
  const [unresolvedPage, setUnresolvedPage] = useState(1)
  const [designationDrafts, setDesignationDrafts] = useState<
    Record<string, { roleName: string; sourceRoleName: string; managerLabel: string; reviewerLabel: string; kpiOwnerLabel: string; customKpis: string }>
  >({})

  const unresolvedCount = state.unresolvedDesignations.length
  const roleOptions = [...rolePackLibrary.keys()].sort((left, right) => left.localeCompare(right))
  const pagedEmployees = paginateRows(employees, employeePage)
  const pagedUnresolvedDesignations = paginateRows(state.unresolvedDesignations, unresolvedPage)

  function draftFor(designation: string, defaults?: { role?: string; manager?: string }) {
    return (
      designationDrafts[designation] ?? {
        roleName: defaults?.role ?? '',
        sourceRoleName: defaults?.role ?? '',
        managerLabel: defaults?.manager ?? '',
        reviewerLabel: '',
        kpiOwnerLabel: defaults?.manager ?? '',
        customKpis: '',
      }
    )
  }

  function updateDraft(
    designation: string,
    patch: Partial<{ roleName: string; sourceRoleName: string; managerLabel: string; reviewerLabel: string; kpiOwnerLabel: string; customKpis: string }>,
  ) {
    setDesignationDrafts((current) => ({
      ...current,
      [designation]: {
        ...draftFor(designation),
        ...current[designation],
        ...patch,
      },
    }))
  }

  function parseKpiLines(lines: string) {
    return lines
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [kpiArea, kpiStatement, weightRaw] = line.split('|').map((part) => part.trim())
        const weightPercent = Number(weightRaw ?? 0)
        if (!kpiArea || !kpiStatement || !weightPercent) return null
        return { kpiArea, kpiStatement, weightPercent }
      })
      .filter((entry): entry is RoleKpiEntry => Boolean(entry))
  }

  return (
    <>
      <section className="view active">
        <div className="topbar">
          <div>
            <h1>My Team</h1>
            <div className="meta">Review queue plus unresolved role setup for staff who still need appraisal mapping</div>
          </div>
        </div>

        <ListSectionHeader title="Review queue" total={employees.length} page={employeePage} pageSize={PAGE_SIZE} />
        <div className="team-list" style={{ marginBottom: 16 }}>
          {pagedEmployees.map((employee) => {
            const employeeSelfRecord = state.selfAppraisals.find((record) => record.employeeId === employee.employeeId) ?? null
            const statusLabel = employeeSelfRecord?.status === 'submitted' ? 'ready' : 'waiting'
            return (
              <div key={employee.employeeId} className="team-card">
                <div className="team-avatar">{initials(employee.employeeName)}</div>
                <div className="team-info">
                  <div className="name">{employee.employeeName}</div>
                  <div className="role">{employee.designation}</div>
                  <div className="team-meta">
                    {employee.appraisalRole || employee.designation} · {employeeSelfRecord?.status === 'submitted' ? 'Self-appraisal submitted' : 'No self-summary yet'}
                  </div>
                </div>
                <div className="right">
                  <Stamp kind={statusLabel} label={stampLabelForReviewState(statusLabel)} />
                  <button
                    className="btn btn--secondary btn--sm"
                    onClick={() => {
                      onSelectEmployee(employee.employeeId)
                      setReviewOpen(true)
                    }}
                  >
                    Review
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <PaginationControls page={employeePage} total={employees.length} pageSize={PAGE_SIZE} onChange={setEmployeePage} />

        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-eyebrow">Setup unresolved roles</div>
          <ListSectionHeader
            title="Designation setup queue"
            total={state.unresolvedDesignations.length}
            page={unresolvedPage}
            pageSize={PAGE_SIZE}
          />
          <div className="team-list">
            {pagedUnresolvedDesignations.map((item) => {
              const draft = draftFor(item.designation, {
                role: item.suggestedAppraisalRole,
                manager: item.lineManagerLabel,
              })

              return (
                <div key={item.designation} className="card" style={{ padding: 16 }}>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{item.designation}</div>
                      <div className="card-sub">{item.notes || 'No notes provided.'}</div>
                    </div>
                    <Stamp kind="held" label="Needs setup" />
                  </div>
                  <div className="kpi-grid-setup">
                    <label>
                      <span>Mapped appraisal role</span>
                      <input className="text-input" value={draft.roleName} onChange={(event) => updateDraft(item.designation, { roleName: event.target.value })} />
                    </label>
                    <label>
                      <span>Copy KPI pack from</span>
                      <select className="text-input" value={draft.sourceRoleName} onChange={(event) => updateDraft(item.designation, { sourceRoleName: event.target.value })}>
                        <option value="">Select existing role</option>
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Line manager</span>
                      <input className="text-input" value={draft.managerLabel} onChange={(event) => updateDraft(item.designation, { managerLabel: event.target.value })} />
                    </label>
                    <label>
                      <span>Reviewer</span>
                      <input className="text-input" value={draft.reviewerLabel} onChange={(event) => updateDraft(item.designation, { reviewerLabel: event.target.value })} />
                    </label>
                    <label>
                      <span>KPI owner</span>
                      <input className="text-input" value={draft.kpiOwnerLabel} onChange={(event) => updateDraft(item.designation, { kpiOwnerLabel: event.target.value })} />
                    </label>
                  </div>
                  <label style={{ marginTop: 12 }}>
                    <span>Custom KPI lines</span>
                    <textarea value={draft.customKpis} onChange={(event) => updateDraft(item.designation, { customKpis: event.target.value })} placeholder="KPI Area | KPI Statement | Weight" />
                  </label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      className="btn btn--primary btn--sm"
                      onClick={() => {
                        onResolveDesignationSetup({
                          designation: item.designation,
                          roleName: draft.roleName,
                          sourceRoleName: draft.sourceRoleName,
                          entries: parseKpiLines(draft.customKpis),
                          managerLabel: draft.managerLabel,
                          reviewerLabel: draft.reviewerLabel,
                          kpiOwnerLabel: draft.kpiOwnerLabel,
                        })
                        setToast('Role setup saved')
                      }}
                    >
                      Save setup
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <PaginationControls
            page={unresolvedPage}
            total={state.unresolvedDesignations.length}
            pageSize={PAGE_SIZE}
            onChange={setUnresolvedPage}
          />
        </div>
      </section>

      <ReviewDrawer
        open={reviewOpen && Boolean(selectedEmployee)}
        onClose={() => setReviewOpen(false)}
        employee={selectedEmployee}
        assignments={assignments}
        selfRecord={selfRecord}
        finalResult={finalResult}
        onUpdateAssignment={onUpdateAssignment}
        onUpdateFinalResult={onUpdateFinalResult}
        onSaveDraft={() => setToast('Draft saved')}
        onSubmit={() => setToast('Recommendation updated')}
        variant="admin"
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  )
}

export function CasebookReleaseWorkspace({
  state,
  onUpdateFinalResult,
}: ReleaseProps) {
  const [releasePage, setReleasePage] = useState(1)
  const pagedFinalResults = paginateRows(state.finalResults, releasePage)
  const releasedCount = state.finalResults.filter((record) => record.releasedToEmployee).length

  return (
    <section className="view active">
      <div className="topbar">
        <div>
          <h1>Release Control</h1>
          <div className="meta">Control when manager feedback and final outcomes become visible to employees</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-eyebrow">Visibility status</div>
          <div className="card-header">
            <div>
              <div className="card-title">{releasedCount} results released</div>
              <div className="card-sub">{state.finalResults.length - releasedCount} results still held from employees</div>
            </div>
            <Stamp kind={releasedCount > 0 ? 'released' : 'held'} label={releasedCount > 0 ? 'Active' : 'Held'} />
          </div>
        </div>

        <div className="card">
          <div className="card-eyebrow">Policy</div>
          <div className="card-sub">
            Release only when the manager review is complete and the appraisal packet is ready for staff consumption.
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-eyebrow">Release queue</div>
        <ListSectionHeader title="Final result visibility" total={state.finalResults.length} page={releasePage} pageSize={PAGE_SIZE} />
        <div className="team-list">
          {pagedFinalResults.map((result) => (
            <div key={result.employeeId} className="cycle-row">
              <div className="info">
                <h4>{result.employeeName}</h4>
                <p>
                  {result.performanceBand} · score {result.finalScore}
                </p>
              </div>
              <Stamp kind={result.releasedToEmployee ? 'released' : 'held'} label={result.releasedToEmployee ? 'Released' : 'Held'} />
              <button
                className="btn btn--secondary btn--sm"
                onClick={() => onUpdateFinalResult(result.employeeId, { releasedToEmployee: !result.releasedToEmployee })}
              >
                {result.releasedToEmployee ? 'Hide result' : 'Release result'}
              </button>
            </div>
          ))}
        </div>
        <PaginationControls page={releasePage} total={state.finalResults.length} pageSize={PAGE_SIZE} onChange={setReleasePage} />
      </div>
    </section>
  )
}

function paginateRows<T>(rows: T[], page: number, pageSize = PAGE_SIZE) {
  const safePage = Math.max(1, page)
  const start = (safePage - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

function ListSectionHeader({
  title,
  total,
  page,
  pageSize,
}: {
  title: string
  total: number
  page: number
  pageSize: number
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="list-section-header">
      <div>
        <div className="section-label">{title}</div>
        <div className="card-sub">
          {total === 0 ? 'No rows yet' : `Showing ${start}-${end} of ${total}`}
        </div>
      </div>
    </div>
  )
}

function PaginationControls({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number
  total: number
  pageSize: number
  onChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  return (
    <div className="pagination-bar">
      <button className="btn btn--secondary btn--sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        Previous
      </button>
      <div className="pagination-meta">
        Page {page} of {totalPages}
      </div>
      <button className="btn btn--secondary btn--sm" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
        Next
      </button>
    </div>
  )
}

function SelfDrawer({
  open,
  onClose,
  employee,
  selfRecord,
  assignments,
  onUpdateSelf,
  onUpdateSelfKpiEntry,
  onSubmitSelf,
  onSaveDraft,
}: {
  open: boolean
  onClose: () => void
  employee: EmployeeRecord
  selfRecord: SelfAppraisalRecord
  assignments: AssignmentRecord[]
  onUpdateSelf: (employeeId: string, patch: Partial<SelfAppraisalRecord>) => void
  onUpdateSelfKpiEntry: (employeeId: string, assignmentId: string, patch: Partial<SelfKpiEntry>) => void
  onSubmitSelf: (employeeId: string) => void
  onSaveDraft: () => void
}) {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({})
  const [step, setStep] = useState<'kpis' | 'reflection'>('kpis')
  const progress = selfRecord.kpiEntries.filter((entry) => entry.selfScore > 0).length
  const canAdvanceToReflection = assignments.every((assignment) => {
    const entry = selfRecord.kpiEntries.find((record) => record.assignmentId === assignment.assignmentId)
    return Boolean(entry && entry.selfScore > 0 && entry.reasonForScore.trim())
  })

  useEffect(() => {
    if (open) {
      setStep('kpis')
    }
  }, [open])

  return (
    <>
      <div className={`overlay ${open ? 'show' : ''}`} onClick={onClose} />
      <div className={`drawer ${open ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-header-top">
            <div>
              <h2>Self-Appraisal</h2>
              <div className="sub">{selfRecord.cycle} Cycle · <span>{progress} of {selfRecord.kpiEntries.length} rated</span></div>
            </div>
            <button className="close-x" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="drawer-body">
          <div className="mini-stepper" aria-label="Self appraisal steps">
            <div className={`mini-step ${step === 'reflection' ? 'done' : 'current'}`}>
              <span className="dot">{step === 'reflection' ? '✓' : '1'}</span>
              <span className="label">Rate KPIs</span>
              <span className="line" />
            </div>
            <div className={`mini-step ${step === 'reflection' ? 'current' : ''}`}>
              <span className="dot">2</span>
              <span className="label">Overall reflection</span>
            </div>
          </div>
          {step === 'kpis' ? (
            <>
              <div className="section-label">Scored areas</div>
              {assignments.map((assignment) => {
                const entry = selfRecord.kpiEntries.find((record) => record.assignmentId === assignment.assignmentId)
                if (!entry) return null
                const isOpen = openItems[assignment.assignmentId] ?? false
                return (
                  <div key={assignment.assignmentId} className={`kpi-item ${isOpen ? 'open' : ''}`}>
                    <button className="kpi-head" onClick={() => setOpenItems((current) => ({ ...current, [assignment.assignmentId]: !isOpen }))}>
                      <span className="weight-badge">{assignment.weightPercent}%</span>
                      <span className="kpi-title">{assignment.kpiArea}</span>
                      <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <div className="kpi-body">
                      <p className="kpi-desc">{assignment.kpiStatement}</p>
                      <div className="field-row">
                        <label className="field-label">Self-rating</label>
                        <ScorePicker
                          score={entry.selfScore}
                          onChange={(score) => onUpdateSelfKpiEntry(employee.employeeId, assignment.assignmentId, { selfScore: score })}
                        />
                      </div>
                      <div className="field-row">
                        <label className="field-label">Reason for score (required)</label>
                        <textarea
                          value={entry.reasonForScore}
                          onChange={(event) =>
                            onUpdateSelfKpiEntry(employee.employeeId, assignment.assignmentId, {
                              reasonForScore: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="field-row">
                        <label className="field-label">Challenges faced</label>
                        <textarea
                          value={entry.challengesFaced}
                          onChange={(event) =>
                            onUpdateSelfKpiEntry(employee.employeeId, assignment.assignmentId, {
                              challengesFaced: event.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          ) : (
            <>
              <div className="section-label">Overall reflection</div>
              <div className="field-row">
                <label className="field-label">Overall achievements</label>
                <textarea value={selfRecord.overallAchievements} onChange={(event) => onUpdateSelf(employee.employeeId, { overallAchievements: event.target.value })} />
              </div>
              <div className="field-row">
                <label className="field-label">Major challenges</label>
                <textarea value={selfRecord.majorChallenges} onChange={(event) => onUpdateSelf(employee.employeeId, { majorChallenges: event.target.value })} />
              </div>
              <div className="field-row">
                <label className="field-label">Support needed</label>
                <textarea value={selfRecord.supportNeeded} onChange={(event) => onUpdateSelf(employee.employeeId, { supportNeeded: event.target.value })} />
              </div>
              <div className="field-row">
                <label className="field-label">Development focus</label>
                <textarea value={selfRecord.developmentFocus} onChange={(event) => onUpdateSelf(employee.employeeId, { developmentFocus: event.target.value })} />
              </div>
            </>
          )}
        </div>
        <div className="drawer-footer">
          <span className="left-note">Saved drafts stay editable until you submit.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {step === 'reflection' ? (
              <button className="btn btn--secondary btn--sm" onClick={() => setStep('kpis')}>
                Back
              </button>
            ) : null}
            <button className="btn btn--secondary btn--sm" onClick={onSaveDraft}>
              Save draft
            </button>
            {step === 'kpis' ? (
              <button
                className="btn btn--primary btn--sm"
                onClick={() => setStep('reflection')}
                disabled={!canAdvanceToReflection}
              >
                Next
              </button>
            ) : (
              <button className="btn btn--primary btn--sm" onClick={() => onSubmitSelf(employee.employeeId)}>
                Submit
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function ReviewDrawer({
  open,
  onClose,
  employee,
  assignments,
  selfRecord,
  finalResult,
  onUpdateAssignment,
  onUpdateFinalResult,
  onSaveDraft,
  onSubmit,
  variant,
}: {
  open: boolean
  onClose: () => void
  employee: EmployeeRecord | null
  assignments: AssignmentRecord[]
  selfRecord: SelfAppraisalRecord | null
  finalResult: FinalResultRecord | null
  onUpdateAssignment: (assignmentId: string, patch: Partial<AssignmentRecord>) => void
  onUpdateFinalResult: (employeeId: string, patch: Partial<FinalResultRecord>) => void
  onSaveDraft: () => void
  onSubmit: () => void
  variant: 'manager' | 'admin'
}) {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({})
  if (!employee) return null
  const locked = selfRecord?.status !== 'submitted'
  const provisional = Math.round(assignments.reduce((sum, assignment) => sum + (assignment.score / 5) * assignment.weightPercent, 0))

  return (
    <>
      <div className={`overlay ${open ? 'show' : ''}`} onClick={onClose} />
      <div className={`drawer ${open ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-header-top">
            <div>
              <h2>{employee.employeeName}</h2>
              <div className="sub">
                {employee.designation} · <Stamp kind={locked ? 'waiting' : 'ready'} label={locked ? 'Waiting' : 'Ready'} />
              </div>
            </div>
            <button className="close-x" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="drawer-body">
          <div className="section-label">What they said</div>
          {locked ? (
            <div className="locked-banner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="11" width="14" height="9" rx="1.5" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              No self-summary yet. Review unlocks once {firstName(employee.employeeName)} submits a self-appraisal.
            </div>
          ) : (
            <div className="self-summary-box">
              <span className="tag">Self-summary</span>
              {selfRecord?.overallAchievements || 'No self summary yet.'}
            </div>
          )}

          <div className="section-label">Your scoring</div>
          {assignments.map((assignment) => {
            const isOpen = openItems[assignment.assignmentId] ?? false
            return (
              <div key={assignment.assignmentId} className={`kpi-item ${isOpen ? 'open' : ''} ${locked ? 'locked' : ''}`}>
                <button className="kpi-head" onClick={() => setOpenItems((current) => ({ ...current, [assignment.assignmentId]: !isOpen }))}>
                  <span className="weight-badge">{assignment.weightPercent}%</span>
                  <span className="kpi-title">{assignment.kpiArea}</span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <div className="kpi-body">
                  <p className="kpi-desc">{assignment.kpiStatement}</p>
                  <div className="field-row">
                    <label className="field-label">Score (1-5)</label>
                    <ScorePicker
                      score={assignment.score}
                      disabled={locked}
                      onChange={(score) =>
                        onUpdateAssignment(assignment.assignmentId, {
                          score,
                          status: 'in_review',
                        })
                      }
                    />
                  </div>
                  <div className="field-row">
                    <label className="field-label">Evidence note</label>
                    <input
                      className="text-input"
                      disabled={locked}
                      value={assignment.evidenceNote}
                      onChange={(event) => onUpdateAssignment(assignment.assignmentId, { evidenceNote: event.target.value })}
                    />
                  </div>
                  <div className="field-row">
                    <label className="field-label">Manager comment</label>
                    <textarea
                      disabled={locked}
                      value={assignment.managerComment}
                      onChange={(event) => onUpdateAssignment(assignment.assignmentId, { managerComment: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            )
          })}

          <div className="provisional">
            <div>
              <div className="num">{provisional}%</div>
              <div className="lbl">Provisional weighted score</div>
            </div>
          </div>

          <div className="section-label">Closeout</div>
          <div className="field-row">
            <label className="field-label">Manager summary</label>
            <textarea
              disabled={locked}
              value={finalResult?.managerSummary ?? ''}
              onChange={(event) =>
                finalResult
                  ? onUpdateFinalResult(employee.employeeId, { managerSummary: event.target.value })
                  : undefined
              }
            />
          </div>
          <div className="field-row">
            <label className="field-label">Final recommendation</label>
            <select
              className="text-input"
              disabled={locked}
              value={finalResult?.finalRecommendation ?? ''}
              onChange={(event) =>
                finalResult
                  ? onUpdateFinalResult(employee.employeeId, { finalRecommendation: event.target.value })
                  : undefined
              }
            >
              <option value="">— Select —</option>
              <option value="Exceeds Expectations">Exceeds Expectations</option>
              <option value="Meets Expectations">Meets Expectations</option>
              <option value="Partially Meets Expectations">Partially Meets Expectations</option>
              <option value="Below Expectations">Below Expectations</option>
            </select>
          </div>
        </div>
        <div className="drawer-footer">
          <span className="left-note">
            {variant === 'admin' ? 'HR controls final visibility and can override release status.' : 'Visible to the employee only after HR releases results.'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--secondary btn--sm" onClick={onSaveDraft} disabled={locked}>
              Save draft
            </button>
            <button className="btn btn--primary btn--sm" onClick={onSubmit} disabled={locked}>
              Submit
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function ResultDrawer({
  open,
  onClose,
  employee,
  selfRecord,
  assignments,
  finalResult,
}: {
  open: boolean
  onClose: () => void
  employee: EmployeeRecord
  selfRecord: SelfAppraisalRecord
  assignments: AssignmentRecord[]
  finalResult: FinalResultRecord
}) {
  const rows = assignments.map((assignment) => ({
    assignment,
    self: selfRecord.kpiEntries.find((entry) => entry.assignmentId === assignment.assignmentId)?.selfScore ?? 0,
  }))

  return (
    <>
      <div className={`overlay ${open ? 'show' : ''}`} onClick={onClose} />
      <div className={`drawer ${open ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-header-top">
            <div>
              <h2>{selfRecord.cycle} Result</h2>
              <div className="sub">{employee.employeeName} · Released by HR</div>
            </div>
            <button className="close-x" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="drawer-body">
          <div className="result-hero">
            <div className="big">{Math.round(finalResult.finalScore)}%</div>
            <div className="lbl">Final weighted score</div>
            <div className="rating">
              <Stamp kind={finalResult.releasedToEmployee ? 'released' : 'held'} label={finalResult.performanceBand} />
            </div>
          </div>

          <table className="result-table">
            <thead>
              <tr>
                <th>KPI</th>
                <th>Wt</th>
                <th>Self</th>
                <th>Manager</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ assignment, self }) => (
                <tr key={assignment.assignmentId}>
                  <td>{assignment.kpiArea}</td>
                  <td className="num">{assignment.weightPercent}%</td>
                  <td className="num mono">{self || '—'}</td>
                  <td className="num mono">{assignment.score || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="closing-quote">
            "{finalResult.managerSummary || 'No manager summary yet.'}" — {employee.primaryOwnerLabel || 'Manager'}
          </div>
        </div>
        <div className="drawer-footer">
          <span className="left-note">Read-only · released by HR</span>
          <button className="btn btn--secondary btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  )
}

function MiniStepper({
  mode,
  currentStep,
  finalReleased,
}: {
  mode: 'employee' | 'manager'
  currentStep: number
  finalReleased: boolean
}) {
  const labels =
    mode === 'employee'
      ? ['Sign in', 'Self appraisal', 'Manager review', 'Result']
      : ['Sign in', 'Review reports', 'Score KPI rows', 'Draft recommendation']

  return (
    <div className="mini-stepper" style={{ marginBottom: 22 }}>
      {labels.map((label, index) => {
        const stepIndex = index + 1
        const isDone = stepIndex < currentStep || (mode === 'employee' && stepIndex === 4 && finalReleased)
        const isCurrent = stepIndex === currentStep && !(mode === 'employee' && stepIndex === 4 && finalReleased)
        return (
          <div key={label} className={`mini-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
            <div className="dot">{isDone ? '✓' : stepIndex}</div>
            <span className="label">{label}</span>
            {index < labels.length - 1 ? <div className="line" /> : null}
          </div>
        )
      })}
    </div>
  )
}

function ScorePicker({
  score,
  disabled = false,
  onChange,
}: {
  score: number
  disabled?: boolean
  onChange: (score: number) => void
}) {
  return (
    <div className="score-picker">
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          className={score === value ? 'active' : ''}
          disabled={disabled}
          onClick={() => onChange(value)}
          type="button"
        >
          {value}
        </button>
      ))}
    </div>
  )
}

function Stamp({ kind, label }: { kind: 'draft' | 'ready' | 'waiting' | 'held' | 'released'; label: string }) {
  return <span className={`stamp stamp--${kind}`}>{label}</span>
}

function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(onDone, 2400)
    return () => window.clearTimeout(timer)
  }, [message, onDone])

  return (
    <div className="toast-container">
      {message ? <div className="toast show">{message}</div> : null}
    </div>
  )
}

function reviewStateForEmployee(employee: EmployeeRecord, state: AppState) {
  const selfRecord = state.selfAppraisals.find((record) => record.employeeId === employee.employeeId)
  return selfRecord?.status === 'submitted' ? 'ready' : 'waiting'
}

function stampLabelForReviewState(kind: 'ready' | 'waiting') {
  return kind === 'ready' ? 'Ready' : 'Waiting'
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function firstName(name: string) {
  return name.split(/\s+/)[0] ?? name
}
