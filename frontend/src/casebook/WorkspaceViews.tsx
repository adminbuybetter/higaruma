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
  selfActionState: 'idle' | 'saving' | 'submitting' | 'editing'
  onUpdateSelf: (employeeId: string, patch: Partial<SelfAppraisalRecord>) => void
  onUpdateSelfKpiEntry: (employeeId: string, assignmentId: string, patch: Partial<SelfKpiEntry>) => void
  onSaveSelfDraft: (employeeId: string) => Promise<boolean>
  onSubmitSelf: (employeeId: string) => Promise<boolean>
  onEditSelf: (employeeId: string) => Promise<boolean>
}

type ManagerProps = {
  state: AppState
  employees: EmployeeRecord[]
  selectedEmployee: EmployeeRecord | null
  assignments: AssignmentRecord[]
  selfRecord: SelfAppraisalRecord | null
  finalResult: FinalResultRecord | null
  searchQuery: string
  searchLoading: boolean
  onSearchChange: (query: string) => void
  onSelectEmployee: (employeeId: string) => void
  onUpdateAssignment: (assignmentId: string, patch: Partial<AssignmentRecord>) => void
  onUpdateFinalResult: (employeeId: string, patch: Partial<FinalResultRecord>) => void
}

type HrOverviewProps = {
  currentUser: AppUser
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
}

type HrEmployeesProps = {
  state: AppState
  employees: EmployeeRecord[]
  selectedEmployee: EmployeeRecord | null
  assignments: AssignmentRecord[]
  selfRecord: SelfAppraisalRecord | null
  finalResult: FinalResultRecord | null
  searchQuery: string
  searchLoading: boolean
  onSearchChange: (query: string) => void
  onSelectEmployee: (employeeId: string) => void
  onUpdateFinalResult: (employeeId: string, patch: Partial<FinalResultRecord>) => void
}

type HrReleaseProps = {
  state: AppState
  selectedEmployee: EmployeeRecord | null
  assignments: AssignmentRecord[]
  selfRecord: SelfAppraisalRecord | null
  finalResult: FinalResultRecord | null
  results: FinalResultRecord[]
  searchQuery: string
  searchLoading: boolean
  onSearchChange: (query: string) => void
  onSelectEmployee: (employeeId: string) => void
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

export function CasebookHrOverviewWorkspace({
  currentUser,
  state,
  rolePackLibrary,
  onResolveDesignationSetup,
}: HrOverviewProps) {
  const submittedCount = state.selfAppraisals.filter((record) => record.status === 'submitted').length
  const managerCompleteCount = state.employees.filter((employee) => managerReviewStateForEmployee(employee, state) === 'complete').length
  const releasedCount = state.finalResults.filter((record) => record.releasedToEmployee).length
  const needsAttention = state.employees
    .filter((employee) => hrWorkflowStateForEmployee(employee, state) === 'awaiting-self')
    .slice(0, 6)
  const readyToRelease = state.employees
    .filter((employee) => hrWorkflowStateForEmployee(employee, state) === 'ready-to-release')
    .slice(0, 6)

  return (
    <section className="view active">
      <div className="topbar">
        <div>
          <h1>Welcome back, {firstName(currentUser.displayName)}</h1>
          <div className="meta">H1 2026 Cycle · {state.employees.length} employees in cycle</div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard
          value={String(state.employees.length)}
          label="Employees in cycle"
          progress={100}
          progressTone="navy"
        />
        <StatCard
          value={`${submittedCount}/${state.employees.length || 0}`}
          label="Self-appraisals submitted"
          progress={percentOf(submittedCount, state.employees.length)}
          progressTone="teal"
        />
        <StatCard
          value={`${managerCompleteCount}/${state.employees.length || 0}`}
          label="Manager reviews complete"
          progress={percentOf(managerCompleteCount, state.employees.length)}
          progressTone="amber"
        />
        <StatCard
          value={`${releasedCount}/${state.employees.length || 0}`}
          label="Results released"
          progress={percentOf(releasedCount, state.employees.length)}
          progressTone="rust"
        />
      </div>

      <div className="section-label">Needs attention — self-appraisal not submitted</div>
      <div className="needs-list">
        {needsAttention.length ? (
          needsAttention.map((employee) => (
            <HrNeedsRow
              key={employee.employeeId}
              employee={employee}
              meta={employee.designation}
              stampKind="waiting"
              stampLabel="Awaiting self"
            />
          ))
        ) : (
          <div className="card-sub">Everyone has submitted a self-appraisal.</div>
        )}
      </div>

      <div className="section-label">Ready to release</div>
      <div className="needs-list">
        {readyToRelease.length ? (
          readyToRelease.map((employee) => {
            const result = state.finalResults.find((record) => record.employeeId === employee.employeeId)
            return (
              <HrNeedsRow
                key={employee.employeeId}
                employee={employee}
                meta={`${employee.primaryOwnerLabel || employee.managerLabel || 'Manager not mapped'} · ${result?.performanceBand || 'Awaiting release'}`}
                stampKind="ready"
                stampLabel="Ready to release"
              />
            )
          })
        ) : (
          <div className="card-sub">No completed appraisal packets are waiting for release right now.</div>
        )}
      </div>

      <HrSetupQueue
        state={state}
        rolePackLibrary={rolePackLibrary}
        onResolveDesignationSetup={onResolveDesignationSetup}
      />
    </section>
  )
}

export function CasebookEmployeeWorkspace({
  employee,
  selfRecord,
  assignments,
  finalResult,
  workspaceLoading,
  workspaceError,
  selfActionState,
  onUpdateSelf,
  onUpdateSelfKpiEntry,
  onSaveSelfDraft,
  onSubmitSelf,
  onEditSelf,
}: EmployeeProps) {
  const [selfOpen, setSelfOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const greeting = partOfDayGreeting()
  const dueCopy = buildEmployeeDueCopy(selfRecord.cycleClosesAt)

  return (
    <>
      <section className="view active">
        <div className="employee-hero">
          <div className="employee-hero__row">
            <div className="employee-hero__copy">
              <div className="title-with-stamp">
                <h1>
                  {greeting}, {firstName(employee.employeeName)} <span className="wave-hand" aria-hidden="true">👋</span>
                </h1>
                <Stamp kind={selfRecord.status === 'submitted' ? 'ready' : 'draft'} label={selfRecord.status === 'submitted' ? 'Ready' : 'Draft'} />
              </div>
              <div className="employee-hero__role">{employee.designation}</div>
              <p className="employee-hero__message">
                Welcome to your {selfRecord.cycle} appraisal. We really do appreciate all the work you&apos;ve done, and we&apos;d
                like to know more about the wonderful work you&apos;ve done in the past first quarter. Please ensure to fill and
                submit your form.
              </p>
              <p className="employee-hero__deadline">{dueCopy}</p>
            </div>
            <div className="employee-hero__action">
              <button className="btn btn--primary" onClick={() => setSelfOpen(true)}>
                Open self appraisal
              </button>
            </div>
          </div>

          <div className="employee-hero__divider" />

          <div className="progress-label">Your progress</div>
          <MiniStepper mode="employee" currentStep={2} finalReleased={finalResult.releasedToEmployee} />
        </div>

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
        selfActionState={selfActionState}
        onSaveDraft={async () => {
          const saved = await onSaveSelfDraft(employee.employeeId)
          if (saved) setToast({ title: 'Draft saved', description: 'Your self-appraisal draft has been updated.', tone: 'success' })
          return saved
        }}
        onSubmitSelf={async (employeeId) => {
          const submitted = await onSubmitSelf(employeeId)
          if (submitted) setToast({ title: 'Self-appraisal submitted', description: 'Your manager and HR can now review your appraisal.', tone: 'success' })
          return submitted
        }}
        onEditSelf={async (employeeId) => {
          const reopened = await onEditSelf(employeeId)
          if (reopened) setToast({ title: 'Editing re-opened', description: 'Your self-appraisal is back in draft mode.', tone: 'info' })
          return reopened
        }}
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
  searchQuery,
  searchLoading,
  onSearchChange,
  onSelectEmployee,
  onUpdateAssignment,
  onUpdateFinalResult,
}: ManagerProps) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [employeePage, setEmployeePage] = useState(1)
  const pagedEmployees = paginateRows(employees, employeePage)

  useEffect(() => {
    setEmployeePage(1)
  }, [searchQuery])

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

        <SearchToolbar
          value={searchQuery}
          loading={searchLoading}
          placeholder="Search by name, employee code, role or department"
          onChange={onSearchChange}
        />
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
        onSaveDraft={() => setToast({ title: 'Draft saved', description: 'Manager scoring changes have been saved.', tone: 'success' })}
        onSubmit={() => setToast({ title: 'Recommendation submitted', description: 'This appraisal packet is ready for HR release review.', tone: 'success' })}
        variant="manager"
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  )
}

export function CasebookHrEmployeesWorkspace({
  state,
  employees,
  selectedEmployee,
  assignments,
  selfRecord,
  finalResult,
  searchQuery,
  searchLoading,
  onSearchChange,
  onSelectEmployee,
  onUpdateFinalResult,
}: HrEmployeesProps) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [employeePage, setEmployeePage] = useState(1)
  const [filter, setFilter] = useState<'all' | 'awaiting-self' | 'awaiting-manager' | 'ready-to-release' | 'released'>('all')

  useEffect(() => {
    setEmployeePage(1)
  }, [filter, searchQuery])

  const filteredEmployees = employees.filter((employee) => {
    if (filter === 'all') return true
    return hrWorkflowStateForEmployee(employee, state) === filter
  })
  const pagedEmployees = paginateRows(filteredEmployees, employeePage)

  return (
    <>
      <section className="view active">
        <div className="topbar">
          <div>
            <h1>All Employees</h1>
            <div className="meta">Read appraisal packets, track submission states, and release only when each packet is complete.</div>
          </div>
        </div>

        <ListSectionHeader title="Employee appraisal packets" total={filteredEmployees.length} page={employeePage} pageSize={PAGE_SIZE} />

        <div className="toolbar">
          <div className="toolbar-row toolbar-row--inline">
            <div className="filter-group">
              <div className="filter-group-label">Filters</div>
              <div className="filter-pills filter-pills--compact">
              <FilterPill label={`All (${employees.length})`} active={filter === 'all'} onClick={() => setFilter('all')} />
              <FilterPill
                label={`Awaiting self (${employees.filter((employee) => hrWorkflowStateForEmployee(employee, state) === 'awaiting-self').length})`}
                active={filter === 'awaiting-self'}
                onClick={() => setFilter('awaiting-self')}
              />
              <FilterPill
                label={`Awaiting manager (${employees.filter((employee) => hrWorkflowStateForEmployee(employee, state) === 'awaiting-manager').length})`}
                active={filter === 'awaiting-manager'}
                onClick={() => setFilter('awaiting-manager')}
              />
              <FilterPill
                label={`Ready to release (${employees.filter((employee) => hrWorkflowStateForEmployee(employee, state) === 'ready-to-release').length})`}
                active={filter === 'ready-to-release'}
                onClick={() => setFilter('ready-to-release')}
              />
              <FilterPill
                label={`Released (${employees.filter((employee) => hrWorkflowStateForEmployee(employee, state) === 'released').length})`}
                active={filter === 'released'}
                onClick={() => setFilter('released')}
              />
            </div>
            </div>

            <SearchToolbar
              value={searchQuery}
              loading={searchLoading}
              placeholder="Search by name, employee code, role or department"
              onChange={onSearchChange}
              compact
            />
          </div>
        </div>
        <table className="emp-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Manager</th>
              <th>Self-appraisal</th>
              <th>Manager review</th>
              <th>Result</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pagedEmployees.length ? (
              pagedEmployees.map((employee) => {
                const stateLabel = hrWorkflowStateForEmployee(employee, state)
                return (
                  <tr key={employee.employeeId}>
                    <td>
                      <div className="who">
                        <div className="name">{employee.employeeName}</div>
                        <div className="role">{employee.designation}</div>
                      </div>
                    </td>
                    <td>{employee.primaryOwnerLabel || employee.managerLabel || 'Not mapped'}</td>
                    <td>
                      <Stamp
                        kind={selfSubmissionStateForEmployee(employee, state) === 'submitted' ? 'ready' : 'waiting'}
                        label={selfSubmissionStateForEmployee(employee, state) === 'submitted' ? 'Submitted' : 'Awaiting self'}
                      />
                    </td>
                    <td>
                      <Stamp
                        kind={managerReviewStateForEmployee(employee, state) === 'complete' ? 'ready' : 'waiting'}
                        label={managerReviewStateForEmployee(employee, state) === 'complete' ? 'Complete' : 'Awaiting manager'}
                      />
                    </td>
                    <td>
                      <Stamp kind={stampKindForHrWorkflow(stateLabel)} label={stampLabelForHrWorkflow(stateLabel)} />
                    </td>
                    <td>
                      <button
                        className="open-btn"
                        onClick={() => {
                          onSelectEmployee(employee.employeeId)
                          setDetailOpen(true)
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr className="empty-row">
                <td colSpan={6}>No employees match this search.</td>
              </tr>
            )}
          </tbody>
        </table>
        <PaginationControls page={employeePage} total={filteredEmployees.length} pageSize={PAGE_SIZE} onChange={setEmployeePage} />
      </section>

      <HrPacketDrawer
        open={detailOpen && Boolean(selectedEmployee)}
        onClose={() => setDetailOpen(false)}
        employee={selectedEmployee}
        assignments={assignments}
        selfRecord={selfRecord}
        finalResult={finalResult}
        state={state}
        onUpdateFinalResult={onUpdateFinalResult}
      />
    </>
  )
}

export function CasebookHrReleaseWorkspace({
  state,
  selectedEmployee,
  assignments,
  selfRecord,
  finalResult,
  results,
  searchQuery,
  searchLoading,
  onSearchChange,
  onSelectEmployee,
  onUpdateFinalResult,
}: HrReleaseProps) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [pendingPage, setPendingPage] = useState(1)
  const [releasedPage, setReleasedPage] = useState(1)

  useEffect(() => {
    setPendingPage(1)
    setReleasedPage(1)
  }, [searchQuery])

  const pendingResults = results.filter((result) => {
    const employee = state.employees.find((record) => record.employeeId === result.employeeId)
    return employee && hrWorkflowStateForEmployee(employee, state) === 'ready-to-release'
  })
  const releasedResults = results.filter((result) => result.releasedToEmployee)
  const pagedPendingResults = paginateRows(pendingResults, pendingPage)
  const pagedReleasedResults = paginateRows(releasedResults, releasedPage)

  return (
    <>
      <section className="view active">
        <div className="topbar">
          <div>
            <h1>Release Control</h1>
            <div className="meta">Release completed packets to employees only after both self and manager appraisal stages are complete.</div>
          </div>
        </div>

        <div className="stat-grid">
          <StatCard
            value={String(pendingResults.length)}
            label="Pending releases"
            progress={percentOf(pendingResults.length, state.employees.length)}
            progressTone="amber"
          />
          <StatCard
            value={String(releasedResults.length)}
            label="Released results"
            progress={percentOf(releasedResults.length, state.employees.length)}
            progressTone="teal"
          />
          <StatCard
            value={String(state.employees.filter((employee) => hrWorkflowStateForEmployee(employee, state) === 'awaiting-manager').length)}
            label="Awaiting manager"
            progress={percentOf(state.employees.filter((employee) => hrWorkflowStateForEmployee(employee, state) === 'awaiting-manager').length, state.employees.length)}
            progressTone="rust"
          />
          <StatCard
            value={String(state.unresolvedDesignations.length)}
            label="Needs role setup"
            progress={percentOf(state.unresolvedDesignations.length, state.employees.length || state.unresolvedDesignations.length || 1)}
            progressTone="navy"
          />
        </div>

        <SearchToolbar
          value={searchQuery}
          loading={searchLoading}
          placeholder="Search by name, employee code, role or department"
          onChange={onSearchChange}
        />

        <div className="release-table-section">
          <ListSectionHeader title="Pending releases" total={pendingResults.length} page={pendingPage} pageSize={PAGE_SIZE} />
          <table className="emp-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Manager</th>
                <th>Self-appraisal</th>
                <th>Manager review</th>
                <th>Result</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedPendingResults.length ? (
                pagedPendingResults.map((result) => {
                  const employee = state.employees.find((record) => record.employeeId === result.employeeId)
                  if (!employee) return null
                  return (
                    <tr key={result.employeeId}>
                      <td>
                        <div className="who">
                          <div className="name">{result.employeeName}</div>
                          <div className="role">{employee.designation}</div>
                        </div>
                      </td>
                      <td>{employee.primaryOwnerLabel || employee.managerLabel || 'Not mapped'}</td>
                      <td>
                        <Stamp kind="ready" label="Submitted" />
                      </td>
                      <td>
                        <Stamp kind="ready" label="Complete" />
                      </td>
                      <td>
                        <Stamp kind="ready" label="Ready to release" />
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="open-btn"
                            onClick={() => {
                              onSelectEmployee(result.employeeId)
                              setDetailOpen(true)
                            }}
                          >
                            Review
                          </button>
                          <button
                            className="btn btn--primary btn--sm"
                            onClick={() => onUpdateFinalResult(result.employeeId, { releasedToEmployee: true })}
                          >
                            Release
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr className="empty-row">
                  <td colSpan={6}>No release-ready appraisal packets match this search.</td>
                </tr>
              )}
            </tbody>
          </table>
          <PaginationControls page={pendingPage} total={pendingResults.length} pageSize={PAGE_SIZE} onChange={setPendingPage} />
        </div>

        <div className="release-table-section">
          <ListSectionHeader title="Released results" total={releasedResults.length} page={releasedPage} pageSize={PAGE_SIZE} />
          <table className="emp-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Manager</th>
                <th>Self-appraisal</th>
                <th>Manager review</th>
                <th>Result</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedReleasedResults.length ? (
                pagedReleasedResults.map((result) => {
                  const employee = state.employees.find((record) => record.employeeId === result.employeeId)
                  if (!employee) return null
                  return (
                    <tr key={result.employeeId}>
                      <td>
                        <div className="who">
                          <div className="name">{result.employeeName}</div>
                          <div className="role">{employee.designation}</div>
                        </div>
                      </td>
                      <td>{employee.primaryOwnerLabel || employee.managerLabel || 'Not mapped'}</td>
                      <td>
                        <Stamp
                          kind={selfSubmissionStateForEmployee(employee, state) === 'submitted' ? 'ready' : 'waiting'}
                          label={selfSubmissionStateForEmployee(employee, state) === 'submitted' ? 'Submitted' : 'Awaiting self'}
                        />
                      </td>
                      <td>
                        <Stamp
                          kind={managerReviewStateForEmployee(employee, state) === 'complete' ? 'ready' : 'waiting'}
                          label={managerReviewStateForEmployee(employee, state) === 'complete' ? 'Complete' : 'Awaiting manager'}
                        />
                      </td>
                      <td>
                        <div className="table-result-cell">
                          <Stamp kind="released" label="Released" />
                          <div className="table-result-meta">
                            {result.performanceBand} · score {result.finalScore}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="open-btn"
                            onClick={() => {
                              onSelectEmployee(result.employeeId)
                              setDetailOpen(true)
                            }}
                          >
                            Open
                          </button>
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => onUpdateFinalResult(result.employeeId, { releasedToEmployee: false })}
                          >
                            Hide result
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr className="empty-row">
                  <td colSpan={6}>No released appraisal packets match this search.</td>
                </tr>
              )}
            </tbody>
          </table>
          <PaginationControls page={releasedPage} total={releasedResults.length} pageSize={PAGE_SIZE} onChange={setReleasedPage} />
        </div>
      </section>

      <HrPacketDrawer
        open={detailOpen && Boolean(selectedEmployee)}
        onClose={() => setDetailOpen(false)}
        employee={selectedEmployee}
        assignments={assignments}
        selfRecord={selfRecord}
        finalResult={finalResult}
        state={state}
        onUpdateFinalResult={onUpdateFinalResult}
      />
    </>
  )
}

function HrSetupQueue({
  state,
  rolePackLibrary,
  onResolveDesignationSetup,
}: {
  state: AppState
  rolePackLibrary: Map<string, RoleKpiEntry[]>
  onResolveDesignationSetup: HrOverviewProps['onResolveDesignationSetup']
}) {
  const [unresolvedPage, setUnresolvedPage] = useState(1)
  const [designationDrafts, setDesignationDrafts] = useState<
    Record<string, { roleName: string; sourceRoleName: string; managerLabel: string; reviewerLabel: string; kpiOwnerLabel: string; customKpis: string }>
  >({})

  const roleOptions = [...rolePackLibrary.keys()].sort((left, right) => left.localeCompare(right))
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

  if (!state.unresolvedDesignations.length) {
    return null
  }

  return (
    <div className="card" style={{ marginTop: 26 }}>
      <div className="card-eyebrow">Role setup queue</div>
      <ListSectionHeader
        title="Employees blocked by missing designation mapping"
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
                  <input
                    className="text-input"
                    value={draft.roleName}
                    onChange={(event) => updateDraft(item.designation, { roleName: event.target.value })}
                  />
                </label>
                <label>
                  <span>Copy KPI pack from</span>
                  <select
                    className="text-input"
                    value={draft.sourceRoleName}
                    onChange={(event) => updateDraft(item.designation, { sourceRoleName: event.target.value })}
                  >
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
                  <input
                    className="text-input"
                    value={draft.managerLabel}
                    onChange={(event) => updateDraft(item.designation, { managerLabel: event.target.value })}
                  />
                </label>
                <label>
                  <span>Reviewer</span>
                  <input
                    className="text-input"
                    value={draft.reviewerLabel}
                    onChange={(event) => updateDraft(item.designation, { reviewerLabel: event.target.value })}
                  />
                </label>
                <label>
                  <span>KPI owner</span>
                  <input
                    className="text-input"
                    value={draft.kpiOwnerLabel}
                    onChange={(event) => updateDraft(item.designation, { kpiOwnerLabel: event.target.value })}
                  />
                </label>
              </div>
              <label style={{ marginTop: 12 }}>
                <span>Custom KPI lines</span>
                <textarea
                  value={draft.customKpis}
                  onChange={(event) => updateDraft(item.designation, { customKpis: event.target.value })}
                  placeholder="KPI Area | KPI Statement | Weight"
                />
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() =>
                    onResolveDesignationSetup({
                      designation: item.designation,
                      roleName: draft.roleName,
                      sourceRoleName: draft.sourceRoleName,
                      entries: parseKpiLines(draft.customKpis),
                      managerLabel: draft.managerLabel,
                      reviewerLabel: draft.reviewerLabel,
                      kpiOwnerLabel: draft.kpiOwnerLabel,
                    })
                  }
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
  )
}

function HrPacketDrawer({
  open,
  onClose,
  employee,
  assignments,
  selfRecord,
  finalResult,
  state,
  onUpdateFinalResult,
}: {
  open: boolean
  onClose: () => void
  employee: EmployeeRecord | null
  assignments: AssignmentRecord[]
  selfRecord: SelfAppraisalRecord | null
  finalResult: FinalResultRecord | null
  state: AppState
  onUpdateFinalResult: (employeeId: string, patch: Partial<FinalResultRecord>) => void
}) {
  if (!employee) return null

  const workflowState = hrWorkflowStateForEmployee(employee, state)
  const managerComplete = managerReviewStateForEmployee(employee, state) === 'complete'
  const rows = assignments.map((assignment) => ({
    assignment,
    self: selfRecord?.kpiEntries.find((entry) => entry.assignmentId === assignment.assignmentId)?.selfScore ?? 0,
  }))

  return (
    <>
      <div className={`overlay ${open ? 'show' : ''}`} onClick={onClose} />
      <div className={`drawer ${open ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-header-top">
            <div>
              <h2>{employee.employeeName}</h2>
              <div className="sub">
                {employee.designation} · <Stamp kind={stampKindForHrWorkflow(workflowState)} label={stampLabelForHrWorkflow(workflowState)} />
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
          <div className="score-pair">
            <div className="box">
              <div className="num">{selfRecord?.status === 'submitted' ? 'Yes' : 'No'}</div>
              <div className="lbl">Self appraisal submitted</div>
            </div>
            <div className="box">
              <div className="num">{managerComplete ? 'Yes' : 'No'}</div>
              <div className="lbl">Manager review complete</div>
            </div>
          </div>

          <div className="section-label">Employee reflection</div>
          {selfRecord?.status === 'submitted' ? (
            <div className="self-summary-box">
              <span className="tag">Self summary</span>
              {buildSelfSummary(selfRecord)}
            </div>
          ) : (
            <div className="locked-banner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="11" width="14" height="9" rx="1.5" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              Self-appraisal has not been submitted yet.
            </div>
          )}

          <div className="section-label">Manager review</div>
          {managerComplete ? (
            <div className="manager-summary-box">
              <span className="tag">Manager summary</span>
              {finalResult?.managerSummary || 'Manager review is complete but summary is still blank.'}
            </div>
          ) : (
            <div className="locked-banner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="11" width="14" height="9" rx="1.5" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              Manager appraisal is still in progress. HR can view the packet but cannot score it here.
            </div>
          )}

          <div className="section-label">KPI breakdown</div>
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

          <div className="section-label">Result</div>
          <div className="card" style={{ padding: 16 }}>
            <div className="card-header">
              <div>
                <div className="card-title">{finalResult?.performanceBand || 'Awaiting result'}</div>
                <div className="card-sub">
                  Final score {finalResult?.finalScore ?? 0} · Recommendation {finalResult?.finalRecommendation || 'Not set'}
                </div>
              </div>
              <Stamp kind={stampKindForHrWorkflow(workflowState)} label={stampLabelForHrWorkflow(workflowState)} />
            </div>
          </div>
        </div>
        <div className="drawer-footer">
          <span className="left-note">Read-only packet for HR. Manager scoring remains in the manager workspace.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {workflowState === 'ready-to-release' ? (
              <button className="btn btn--primary btn--sm" onClick={() => onUpdateFinalResult(employee.employeeId, { releasedToEmployee: true })}>
                Release result
              </button>
            ) : null}
            {workflowState === 'released' ? (
              <button className="btn btn--ghost btn--sm" onClick={() => onUpdateFinalResult(employee.employeeId, { releasedToEmployee: false })}>
                Hide result
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}

function StatCard({
  value,
  label,
  progress,
  progressTone,
}: {
  value: string
  label: string
  progress: number
  progressTone: 'navy' | 'teal' | 'amber' | 'rust'
}) {
  return (
    <div className="stat-card">
      <div className="num">{value}</div>
      <div className="lbl">{label}</div>
      <div className="stat-bar">
        <span className={`stat-fill stat-fill--${progressTone}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

function HrNeedsRow({
  employee,
  meta,
  stampKind,
  stampLabel,
}: {
  employee: EmployeeRecord
  meta: string
  stampKind: 'ready' | 'waiting' | 'held' | 'released'
  stampLabel: string
}) {
  return (
    <div className="needs-row">
      <div className="av">{initials(employee.employeeName)}</div>
      <div className="who">
        <div className="name">{employee.employeeName}</div>
        <div className="role">{meta}</div>
      </div>
      <Stamp kind={stampKind} label={stampLabel} />
    </div>
  )
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button className={`pill${active ? ' active' : ''}`} type="button" onClick={onClick}>
      {label}
    </button>
  )
}

function SearchToolbar({
  value,
  loading,
  placeholder,
  onChange,
  compact = false,
}: {
  value: string
  loading: boolean
  placeholder: string
  onChange: (query: string) => void
  compact?: boolean
}) {
  return (
    <div className={`search-toolbar${compact ? ' search-toolbar--compact' : ''}`}>
      <div className="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          className="text-input search-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </div>
      {loading ? <span className="search-status">Searching...</span> : null}
    </div>
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
  selfActionState,
  onUpdateSelf,
  onUpdateSelfKpiEntry,
  onSubmitSelf,
  onSaveDraft,
  onEditSelf,
}: {
  open: boolean
  onClose: () => void
  employee: EmployeeRecord
  selfRecord: SelfAppraisalRecord
  assignments: AssignmentRecord[]
  selfActionState: 'idle' | 'saving' | 'submitting' | 'editing'
  onUpdateSelf: (employeeId: string, patch: Partial<SelfAppraisalRecord>) => void
  onUpdateSelfKpiEntry: (employeeId: string, assignmentId: string, patch: Partial<SelfKpiEntry>) => void
  onSubmitSelf: (employeeId: string) => Promise<boolean>
  onSaveDraft: () => Promise<boolean>
  onEditSelf: (employeeId: string) => Promise<boolean>
}) {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({})
  const [step, setStep] = useState<'kpis' | 'reflection'>('kpis')
  const progress = selfRecord.kpiEntries.filter((entry) => entry.selfScore > 0).length
  const deadlineClosed = hasCycleClosed(selfRecord.cycleClosesAt)
  const submitted = selfRecord.status === 'submitted'
  const pending = selfActionState !== 'idle'
  const showEditAction = submitted && !deadlineClosed
  const locked = deadlineClosed || submitted || pending
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
            {step === 'reflection' && !locked ? (
              <button className="drawer-nav-back" type="button" onClick={() => setStep('kpis')} aria-label="Back to scored areas">
                <span aria-hidden="true">&lt;</span>
              </button>
            ) : null}
            <div>
              <h2>Self-Appraisal</h2>
              <div className="sub">
                {selfRecord.cycle} Cycle · <span>{progress} of {selfRecord.kpiEntries.length} rated</span> · Deadline {formatDeadline(selfRecord.cycleClosesAt)}
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
          <div className={`drawer-status ${deadlineClosed ? 'locked' : submitted ? 'submitted' : 'draft'}`}>
            {deadlineClosed
              ? `Editing closed on ${formatDeadline(selfRecord.cycleClosesAt)}.`
              : submitted
                ? `Submitted${selfRecord.submittedAt ? ` on ${formatSubmittedAt(selfRecord.submittedAt)}` : ''}.`
                : `Draft mode. You can edit until ${formatDeadline(selfRecord.cycleClosesAt)}.`}
          </div>
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
                          disabled={locked}
                          onChange={(score) => onUpdateSelfKpiEntry(employee.employeeId, assignment.assignmentId, { selfScore: score })}
                        />
                      </div>
                      <div className="field-row">
                        <label className="field-label">Reason for score (required)</label>
                        <textarea
                          disabled={locked}
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
                          disabled={locked}
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
                <textarea disabled={locked} value={selfRecord.overallAchievements} onChange={(event) => onUpdateSelf(employee.employeeId, { overallAchievements: event.target.value })} />
              </div>
              <div className="field-row">
                <label className="field-label">Major challenges</label>
                <textarea disabled={locked} value={selfRecord.majorChallenges} onChange={(event) => onUpdateSelf(employee.employeeId, { majorChallenges: event.target.value })} />
              </div>
              <div className="field-row">
                <label className="field-label">Support needed</label>
                <textarea disabled={locked} value={selfRecord.supportNeeded} onChange={(event) => onUpdateSelf(employee.employeeId, { supportNeeded: event.target.value })} />
              </div>
              <div className="field-row">
                <label className="field-label">Development focus</label>
                <textarea disabled={locked} value={selfRecord.developmentFocus} onChange={(event) => onUpdateSelf(employee.employeeId, { developmentFocus: event.target.value })} />
              </div>
            </>
          )}
        </div>
        <div className="drawer-footer">
          <span className="left-note">
            {deadlineClosed
              ? 'Editing is closed for this cycle.'
              : submitted
                ? 'Submitted appraisals stay locked unless you tap Edit before the deadline.'
                : 'Saved drafts stay editable until you submit.'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {!submitted && !deadlineClosed ? (
              <button className="btn btn--secondary btn--sm" onClick={onSaveDraft} disabled={pending}>
                {selfActionState === 'saving' ? 'Saving...' : 'Save draft'}
              </button>
            ) : null}
            {!locked && step === 'kpis' ? (
              <button
                className="btn btn--primary btn--sm"
                onClick={() => setStep('reflection')}
                disabled={!canAdvanceToReflection}
              >
                Next
              </button>
            ) : null}
            {!submitted && !deadlineClosed && step === 'reflection' ? (
              <button className="btn btn--primary btn--sm" onClick={() => onSubmitSelf(employee.employeeId)} disabled={pending}>
                {selfActionState === 'submitting' ? 'Submitting...' : 'Submit'}
              </button>
            ) : null}
            {showEditAction ? (
              <button className="btn btn--secondary btn--sm" onClick={() => onEditSelf(employee.employeeId)} disabled={pending}>
                {selfActionState === 'editing' ? 'Re-opening...' : 'Edit'}
              </button>
            ) : null}
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

type ToastMessage = {
  title: string
  description?: string
  tone?: 'success' | 'error' | 'warning' | 'info'
}

function Toast({ message, onDone }: { message: ToastMessage | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(onDone, 2400)
    return () => window.clearTimeout(timer)
  }, [message, onDone])

  return (
    <div className="toast-container">
      {message ? (
        <div className={`toast show toast--${message.tone ?? 'info'}`}>
          <div className="toast-icon" aria-hidden="true">
            {message.tone === 'success' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : message.tone === 'error' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5" />
                <path d="M12 16h.01" />
              </svg>
            ) : message.tone === 'warning' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3l9 16H3L12 3z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 10v6" />
                <path d="M12 7h.01" />
              </svg>
            )}
          </div>
          <div className="toast-copy">
            <div className="toast-title">{message.title}</div>
            {message.description ? <div className="toast-description">{message.description}</div> : null}
          </div>
          <button className="toast-close" type="button" onClick={onDone} aria-label="Close notification">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  )
}

function reviewStateForEmployee(employee: EmployeeRecord, state: AppState) {
  const selfRecord = state.selfAppraisals.find((record) => record.employeeId === employee.employeeId)
  return selfRecord?.status === 'submitted' ? 'ready' : 'waiting'
}

function selfSubmissionStateForEmployee(employee: EmployeeRecord, state: AppState) {
  const selfRecord = state.selfAppraisals.find((record) => record.employeeId === employee.employeeId)
  return selfRecord?.status === 'submitted' ? 'submitted' : 'awaiting-self'
}

function managerReviewStateForEmployee(employee: EmployeeRecord, state: AppState) {
  const employeeAssignments = state.assignments.filter((assignment) => assignment.employeeId === employee.employeeId)
  const finalResult = state.finalResults.find((record) => record.employeeId === employee.employeeId)
  const allAssignmentsScored = employeeAssignments.length > 0 && employeeAssignments.every((assignment) => assignment.score > 0)
  const closeoutComplete = Boolean(finalResult?.managerSummary?.trim() && finalResult?.finalRecommendation?.trim())
  return allAssignmentsScored && closeoutComplete ? 'complete' : 'awaiting-manager'
}

function hrWorkflowStateForEmployee(employee: EmployeeRecord, state: AppState) {
  const finalResult = state.finalResults.find((record) => record.employeeId === employee.employeeId)
  if (finalResult?.releasedToEmployee) return 'released'
  if (selfSubmissionStateForEmployee(employee, state) !== 'submitted') return 'awaiting-self'
  if (managerReviewStateForEmployee(employee, state) !== 'complete') return 'awaiting-manager'
  return 'ready-to-release'
}

function stampKindForHrWorkflow(
  state: 'awaiting-self' | 'awaiting-manager' | 'ready-to-release' | 'released',
): 'waiting' | 'held' | 'ready' | 'released' {
  if (state === 'awaiting-self') return 'waiting'
  if (state === 'awaiting-manager') return 'held'
  if (state === 'ready-to-release') return 'ready'
  return 'released'
}

function stampLabelForHrWorkflow(state: 'awaiting-self' | 'awaiting-manager' | 'ready-to-release' | 'released') {
  if (state === 'awaiting-self') return 'Awaiting self'
  if (state === 'awaiting-manager') return 'Awaiting manager'
  if (state === 'ready-to-release') return 'Ready to release'
  return 'Released'
}

function stampLabelForReviewState(kind: 'ready' | 'waiting') {
  return kind === 'ready' ? 'Ready' : 'Waiting'
}

function buildSelfSummary(selfRecord: SelfAppraisalRecord) {
  const parts = [
    selfRecord.overallAchievements.trim(),
    selfRecord.majorChallenges.trim(),
    selfRecord.supportNeeded.trim(),
    selfRecord.developmentFocus.trim(),
  ].filter(Boolean)
  return parts.join(' · ') || 'No overall reflection provided.'
}

function percentOf(value: number, total: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function hasCycleClosed(cycleClosesAt: string | null) {
  if (!cycleClosesAt) return false
  return new Date(cycleClosesAt).getTime() <= Date.now()
}

function formatDeadline(cycleClosesAt: string | null) {
  if (!cycleClosesAt) return 'Not set'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(cycleClosesAt))
}

function formatSubmittedAt(submittedAt: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(submittedAt))
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

function partOfDayGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function daysLeftUntil(cycleClosesAt: string | null) {
  if (!cycleClosesAt) return null
  const close = new Date(cycleClosesAt)
  const now = new Date()
  const msPerDay = 1000 * 60 * 60 * 24
  const diff = close.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / msPerDay))
}

function buildEmployeeDueCopy(cycleClosesAt: string | null) {
  if (!cycleClosesAt) return 'Your submission deadline will be shared shortly.'
  if (hasCycleClosed(cycleClosesAt)) {
    return `Your submission window closed on ${formatDeadline(cycleClosesAt)}.`
  }
  const daysLeft = daysLeftUntil(cycleClosesAt)
  if (daysLeft === 0) {
    return `You have less than 1 day left and your submission is due by ${formatDeadline(cycleClosesAt)}.`
  }
  return `You have ${daysLeft} day${daysLeft === 1 ? '' : 's'} left and your submission is due by ${formatDeadline(cycleClosesAt)}.`
}
