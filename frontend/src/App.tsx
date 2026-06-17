import { useEffect, useMemo, useState } from 'react'
import { generatedSeed } from './data/seed.generated'
import type {
  AppState,
  AppUser,
  AssignmentRecord,
  CustomRolePack,
  EmployeeRecord,
  FinalResultRecord,
  RoleKpiEntry,
  SelfKpiEntry,
  SelfAppraisalRecord,
  UnresolvedEmployee,
  UnresolvedManager,
} from './types'

const STORAGE_KEY = 'buybetter-appraisal-prototype/v1'

function cloneSeed(): AppState {
  return JSON.parse(
    JSON.stringify({
      users: generatedSeed.users,
      employees: generatedSeed.employees,
      assignments: generatedSeed.assignments,
      selfAppraisals: generatedSeed.selfAppraisals,
      finalResults: generatedSeed.finalResults,
      customRolePacks: generatedSeed.customRolePacks,
      unresolvedDesignations: generatedSeed.unresolvedDesignations,
      unresolvedEmployees: generatedSeed.unresolvedEmployees,
      unresolvedManagers: generatedSeed.unresolvedManagers,
      excludedDesignations: generatedSeed.excludedDesignations,
    }),
  ) as AppState
}

function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return cloneSeed()
  }

  try {
    return normalizeState(JSON.parse(raw) as Partial<AppState>)
  } catch {
    return cloneSeed()
  }
}

function normalizeState(raw: Partial<AppState>): AppState {
  const seed = cloneSeed()

  const users = (raw.users ?? seed.users).map((user) => {
    const capabilities = user.capabilities?.length ? user.capabilities : [user.kind]
    return {
      ...user,
      capabilities,
      employeeId: capabilities.includes('employee') ? user.employeeId : undefined,
      managerScopes: capabilities.includes('manager') ? user.managerScopes ?? [] : [],
    }
  })
  const employees = raw.employees ?? seed.employees
  const normalizedEmployees = employees.map((employee) => ({
    ...employee,
    excludedThisCycle: employee.excludedThisCycle ?? false,
  }))
  const assignments = raw.assignments ?? seed.assignments
  const finalResults = raw.finalResults ?? seed.finalResults
  const customRolePacks = raw.customRolePacks ?? seed.customRolePacks

  const selfAppraisals = normalizedEmployees.map((employee) => {
    const existing = raw.selfAppraisals?.find((record) => record.employeeId === employee.employeeId)
    const fallback = seed.selfAppraisals.find((record) => record.employeeId === employee.employeeId)
    const employeeAssignments = assignments.filter((assignment) => assignment.employeeId === employee.employeeId)
    const legacyExisting = (existing ?? {}) as Partial<SelfAppraisalRecord> & {
      achievements?: string
      challenges?: string
    }

    return {
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      employeeUsername: employee.employeeUsername,
      cycle: existing?.cycle ?? fallback?.cycle ?? '2026-H1',
      kpiEntries:
        existing?.kpiEntries?.length
          ? existing.kpiEntries
          : employeeAssignments.map((assignment) => ({
              assignmentId: assignment.assignmentId,
              kpiArea: assignment.kpiArea,
              kpiStatement: assignment.kpiStatement,
              selfScore: 0,
              reasonForScore: '',
              keyEvidence: '',
              challengesFaced: '',
            })),
      overallAchievements:
        existing?.overallAchievements ??
        legacyExisting.achievements ??
        fallback?.overallAchievements ??
        '',
      majorChallenges:
        existing?.majorChallenges ??
        legacyExisting.challenges ??
        fallback?.majorChallenges ??
        '',
      supportNeeded: existing?.supportNeeded ?? fallback?.supportNeeded ?? '',
      developmentFocus: existing?.developmentFocus ?? fallback?.developmentFocus ?? '',
      employeeComments: existing?.employeeComments ?? '',
      status: existing?.status ?? fallback?.status ?? 'draft',
    }
  })

  return {
    users,
    employees: normalizedEmployees,
    assignments,
    selfAppraisals,
    finalResults,
    customRolePacks,
    unresolvedDesignations: raw.unresolvedDesignations ?? seed.unresolvedDesignations,
    unresolvedEmployees: raw.unresolvedEmployees ?? seed.unresolvedEmployees,
    unresolvedManagers: raw.unresolvedManagers ?? seed.unresolvedManagers,
    excludedDesignations: raw.excludedDesignations ?? seed.excludedDesignations,
  }
}

function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function hasCapability(user: AppUser | null, capability: 'employee' | 'manager' | 'admin') {
  return Boolean(user?.capabilities?.includes(capability))
}

function dedupeRoleEntries(entries: RoleKpiEntry[]) {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = `${entry.kpiArea}__${entry.kpiStatement}__${entry.weightPercent}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildRolePackLibrary(state: AppState) {
  const library = new Map<string, RoleKpiEntry[]>()

  for (const assignment of state.assignments) {
    if (!library.has(assignment.jobTitle)) {
      library.set(assignment.jobTitle, [])
    }
    library.get(assignment.jobTitle)!.push({
      kpiArea: assignment.kpiArea,
      kpiStatement: assignment.kpiStatement,
      weightPercent: assignment.weightPercent,
    })
  }

  for (const pack of state.customRolePacks) {
    library.set(pack.roleName, pack.entries)
  }

  for (const [roleName, entries] of library.entries()) {
    library.set(roleName, dedupeRoleEntries(entries))
  }

  return library
}

function recomputeOutstandingQueues(state: AppState): Pick<AppState, 'unresolvedEmployees' | 'unresolvedManagers'> {
  const unresolvedEmployees: UnresolvedEmployee[] = state.employees
    .filter((employee) => employee.status !== 'ready' && !employee.excludedThisCycle)
    .map((employee) => ({
      employeeName: employee.employeeName,
      designation: employee.designation,
      employeeId: employee.employeeId,
      status: employee.status,
      blockers: employee.blockers,
    }))

  const unresolvedManagers: UnresolvedManager[] = state.employees
    .filter(
      (employee) =>
        !employee.excludedThisCycle &&
        (!employee.managerLabel || employee.managerLabel.includes('/') || employee.managerLabel.includes(',')),
    )
    .map((employee) => ({
      employeeName: employee.employeeName,
      designation: employee.designation,
      issue: !employee.managerLabel
        ? 'No line manager label mapped'
        : `Manager label is ambiguous: ${employee.managerLabel}`,
    }))

  return { unresolvedEmployees, unresolvedManagers }
}

function deriveFinalScore(assignments: AssignmentRecord[]) {
  const totalWeight = assignments.reduce((sum, item) => sum + item.weightPercent, 0) || 100
  const weighted = assignments.reduce((sum, item) => sum + (item.score / 5) * item.weightPercent, 0)
  return Number(((weighted / totalWeight) * 100).toFixed(1))
}

function performanceBand(score: number) {
  if (score >= 85) return 'Exceeds Expectations'
  if (score >= 70) return 'Strong Performance'
  if (score >= 55) return 'Solid Performance'
  if (score > 0) return 'Needs Improvement'
  return 'Not rated'
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => {
    const text = String(value ?? '')
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replaceAll('"', '""')}"`
    }
    return text
  }
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join(
    '\n',
  )
}

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [loginState, setLoginState] = useState({ username: '', password: '', error: '' })

  useEffect(() => {
    saveState(state)
  }, [state])

  const currentUser = useMemo(
    () => state.users.find((user) => user.id === sessionUserId) ?? null,
    [sessionUserId, state.users],
  )
  const rolePackLibrary = useMemo(() => buildRolePackLibrary(state), [state])
  const canUseEmployeeFlow = hasCapability(currentUser, 'employee')
  const canUseManagerFlow = hasCapability(currentUser, 'manager')
  const canUseAdminFlow = hasCapability(currentUser, 'admin')

  const employeeRecord = useMemo(() => {
    if (!currentUser?.employeeId) return null
    return state.employees.find((employee) => employee.employeeId === currentUser.employeeId) ?? null
  }, [currentUser, state.employees])

  const selfRecord = useMemo(() => {
    if (!employeeRecord) return null
    return state.selfAppraisals.find((record) => record.employeeId === employeeRecord.employeeId) ?? null
  }, [employeeRecord, state.selfAppraisals])

  const employeeAssignments = useMemo(() => {
    if (!employeeRecord) return []
    return state.assignments.filter((assignment) => assignment.employeeId === employeeRecord.employeeId)
  }, [employeeRecord, state.assignments])

  const finalResult = useMemo(() => {
    if (!employeeRecord) return null
    return state.finalResults.find((record) => record.employeeId === employeeRecord.employeeId) ?? null
  }, [employeeRecord, state.finalResults])

  const managedEmployees = useMemo(() => {
    if (!canUseManagerFlow) return []
    const rank = { ready: 0, tentative: 1, blocked: 2 } as const
    const scopes = new Set(currentUser?.managerScopes ?? [])
    return [...state.employees]
      .filter((employee) => scopes.has(employee.primaryOwnerLabel))
      .sort((left, right) => {
        const byStatus = rank[left.status] - rank[right.status]
        if (byStatus !== 0) return byStatus
        return left.employeeName.localeCompare(right.employeeName)
      })
  }, [canUseManagerFlow, currentUser, state.employees])

  const [selectedManagedEmployeeId, setSelectedManagedEmployeeId] = useState<string | null>(null)

  useEffect(() => {
    if (managedEmployees.length && !managedEmployees.some((employee) => employee.employeeId === selectedManagedEmployeeId)) {
      setSelectedManagedEmployeeId(managedEmployees[0].employeeId)
    }
  }, [managedEmployees, selectedManagedEmployeeId])

  const managedEmployee = useMemo(
    () => managedEmployees.find((employee) => employee.employeeId === selectedManagedEmployeeId) ?? null,
    [managedEmployees, selectedManagedEmployeeId],
  )

  const managedAssignments = useMemo(() => {
    if (!managedEmployee) return []
    return state.assignments.filter((assignment) => assignment.employeeId === managedEmployee.employeeId)
  }, [managedEmployee, state.assignments])

  const managedSelfRecord = useMemo(() => {
    if (!managedEmployee) return null
    return state.selfAppraisals.find((record) => record.employeeId === managedEmployee.employeeId) ?? null
  }, [managedEmployee, state.selfAppraisals])

  const managedFinalResult = useMemo(() => {
    if (!managedEmployee) return null
    return state.finalResults.find((record) => record.employeeId === managedEmployee.employeeId) ?? null
  }, [managedEmployee, state.finalResults])

  function handleLogin(event: React.FormEvent) {
    event.preventDefault()
    const match = state.users.find(
      (user) =>
        user.username === loginState.username.trim().toLowerCase() &&
        user.password === loginState.password,
    )
    if (!match) {
      setLoginState((current) => ({ ...current, error: 'Invalid username or password.' }))
      return
    }
    setSessionUserId(match.id)
    setLoginState({ username: '', password: '', error: '' })
  }

  function logout() {
    setSessionUserId(null)
    setSelectedManagedEmployeeId(null)
  }

  function updateSelfAppraisal(employeeId: string, patch: Partial<SelfAppraisalRecord>) {
    setState((current) => ({
      ...current,
      selfAppraisals: current.selfAppraisals.map((record) =>
        record.employeeId === employeeId ? { ...record, ...patch } : record,
      ),
      finalResults: current.finalResults.map((record) =>
        record.employeeId === employeeId && patch.overallAchievements !== undefined
          ? { ...record, selfSummary: patch.overallAchievements }
          : record,
      ),
    }))
  }

  function updateSelfKpiEntry(employeeId: string, assignmentId: string, patch: Partial<SelfKpiEntry>) {
    setState((current) => ({
      ...current,
      selfAppraisals: current.selfAppraisals.map((record) =>
        record.employeeId === employeeId
          ? {
              ...record,
              kpiEntries: record.kpiEntries.map((entry) =>
                entry.assignmentId === assignmentId ? { ...entry, ...patch } : entry,
              ),
            }
          : record,
      ),
    }))
  }

  function updateAssignment(assignmentId: string, patch: Partial<AssignmentRecord>) {
    setState((current) => {
      const assignments = current.assignments.map((assignment) =>
        assignment.assignmentId === assignmentId ? { ...assignment, ...patch } : assignment,
      )
      const changed = assignments.find((assignment) => assignment.assignmentId === assignmentId)
      const finalResults = changed
        ? current.finalResults.map((result) => {
            if (result.employeeId !== changed.employeeId) return result
            const employeeAssignments = assignments.filter((assignment) => assignment.employeeId === changed.employeeId)
            const score = deriveFinalScore(employeeAssignments)
            return {
              ...result,
              finalScore: score,
              performanceBand: performanceBand(score),
            }
          })
        : current.finalResults

      return { ...current, assignments, finalResults }
    })
  }

  function updateFinalResult(employeeId: string, patch: Partial<FinalResultRecord>) {
    setState((current) => ({
      ...current,
      finalResults: current.finalResults.map((record) =>
        record.employeeId === employeeId ? { ...record, ...patch } : record,
      ),
    }))
  }

  function resolveDesignationSetup({
    designation,
    roleName,
    sourceRoleName,
    entries,
    managerLabel,
    reviewerLabel,
    kpiOwnerLabel,
  }: {
    designation: string
    roleName: string
    sourceRoleName: string
    entries: RoleKpiEntry[]
    managerLabel: string
    reviewerLabel: string
    kpiOwnerLabel: string
  }) {
    setState((current) => {
      const library = buildRolePackLibrary(current)
      const trimmedRoleName = roleName.trim()
      const trimmedSourceRoleName = sourceRoleName.trim()
      const resolvedRoleName = trimmedRoleName || trimmedSourceRoleName
      const resolvedEntries =
        entries.length > 0
          ? dedupeRoleEntries(entries)
          : dedupeRoleEntries(library.get(trimmedSourceRoleName) ?? [])

      if (!designation || !resolvedRoleName || !resolvedEntries.length) {
        return current
      }

      const nextCustomRolePacks = [...current.customRolePacks]
      const existingPackIndex = nextCustomRolePacks.findIndex((pack) => pack.roleName === resolvedRoleName)
      const shouldPersistPack =
        entries.length > 0 || !library.has(resolvedRoleName) || trimmedSourceRoleName !== resolvedRoleName

      if (shouldPersistPack) {
        const pack: CustomRolePack = {
          roleName: resolvedRoleName,
          sourceRoleName: trimmedSourceRoleName || resolvedRoleName,
          entries: resolvedEntries,
        }
        if (existingPackIndex >= 0) {
          nextCustomRolePacks[existingPackIndex] = pack
        } else {
          nextCustomRolePacks.push(pack)
        }
      }

      const cleanedManagerLabel = managerLabel.trim()
      const cleanedReviewerLabel = reviewerLabel.trim()
      const cleanedKpiOwnerLabel = kpiOwnerLabel.trim()
      const primaryOwnerLabel = cleanedKpiOwnerLabel || cleanedManagerLabel

      const employees = current.employees.map((employee) => {
        if (employee.designation !== designation) return employee
        const blockers: string[] = []
        let status: EmployeeRecord['status'] = 'ready'
        if (!resolvedRoleName) blockers.push('No KPI role mapped yet')
        if (!resolvedEntries.length) blockers.push('No KPI pack exists for the mapped role')
        if (!cleanedManagerLabel && !cleanedKpiOwnerLabel) blockers.push('No appraisal owner / manager relationship mapped yet')
        if (blockers.length) status = 'blocked'

        return {
          ...employee,
          appraisalRole: resolvedRoleName,
          managerLabel: cleanedManagerLabel,
          reviewerLabel: cleanedReviewerLabel,
          kpiOwnerLabel: cleanedKpiOwnerLabel,
          primaryOwnerLabel,
          blockers,
          status,
          canViewFinalResult: blockers.length === 0,
        }
      })

      const resolvedEmployeeIds = new Set(
        employees.filter((employee) => employee.designation === designation).map((employee) => employee.employeeId),
      )

      const assignments = [
        ...current.assignments.filter((assignment) => !resolvedEmployeeIds.has(assignment.employeeId)),
        ...employees
          .filter((employee) => resolvedEmployeeIds.has(employee.employeeId) && employee.status !== 'blocked')
          .flatMap((employee) =>
            resolvedEntries.map((entry, index) => ({
              assignmentId: `${employee.employeeId}-KPI-${String(index + 1).padStart(2, '0')}`,
              cycle: '2026-H1',
              employeeId: employee.employeeId,
              employeeName: employee.employeeName,
              employeeUsername: employee.employeeUsername,
              jobTitle: resolvedRoleName,
              department: employee.department,
              kpiArea: entry.kpiArea,
              kpiStatement: entry.kpiStatement,
              weightPercent: entry.weightPercent,
              managerLabel: cleanedManagerLabel,
              reviewerLabel: cleanedReviewerLabel,
              kpiOwnerLabel: cleanedKpiOwnerLabel,
              primaryOwnerLabel,
              score: 0,
              managerComment: '',
              evidenceNote: '',
              developmentAction: '',
              status: 'pending' as const,
            })),
          ),
      ]

      const selfAppraisals = current.selfAppraisals.map((record) =>
        resolvedEmployeeIds.has(record.employeeId)
          ? {
              ...record,
              kpiEntries: resolvedEntries.map((entry, index) => ({
                assignmentId: `${record.employeeId}-KPI-${String(index + 1).padStart(2, '0')}`,
                kpiArea: entry.kpiArea,
                kpiStatement: entry.kpiStatement,
                selfScore: 0,
                reasonForScore: '',
                keyEvidence: '',
                challengesFaced: '',
              })),
            }
          : record,
      )

      const unresolvedDesignations = current.unresolvedDesignations.filter((item) => item.designation !== designation)

      const nextState: AppState = {
        ...current,
        employees,
        assignments,
        selfAppraisals,
        customRolePacks: nextCustomRolePacks,
        unresolvedDesignations,
      }

      return {
        ...nextState,
        ...recomputeOutstandingQueues(nextState),
      }
    })
  }

  function resetPrototype() {
    const fresh = cloneSeed()
    setState(fresh)
    setSessionUserId(null)
    setSelectedManagedEmployeeId(null)
  }

  if (!currentUser) {
    return <LoginScreen loginState={loginState} setLoginState={setLoginState} handleLogin={handleLogin} />
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h1>{canUseEmployeeFlow && employeeRecord ? `Hi 👋 ${currentUser.displayName}` : currentUser.displayName}</h1>
          {!canUseEmployeeFlow || !employeeRecord ? (
            <p className="subtle">
              Signed in as {[
                canUseAdminFlow ? 'HR Admin' : null,
                canUseManagerFlow ? 'Appraisal Owner' : null,
                canUseEmployeeFlow ? 'Employee' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>
        <div className="topbar-actions">
          <button className="button subtle-button" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {canUseEmployeeFlow && employeeRecord && selfRecord && finalResult ? (
        <EmployeeWorkspace
          employee={employeeRecord}
          selfRecord={selfRecord}
          assignments={employeeAssignments}
          finalResult={finalResult}
          onUpdateSelf={updateSelfAppraisal}
          onUpdateSelfKpiEntry={updateSelfKpiEntry}
        />
      ) : null}

      {canUseManagerFlow ? (
        <>
          <StepStrip
            mode="manager"
            employeeRecord={employeeRecord}
            finalResult={finalResult}
          />
          <ManagerWorkspace
            currentUser={currentUser}
            employees={managedEmployees}
            selectedEmployee={managedEmployee}
            assignments={managedAssignments}
            selfRecord={managedSelfRecord}
            finalResult={managedFinalResult}
            onSelectEmployee={setSelectedManagedEmployeeId}
            onUpdateAssignment={updateAssignment}
            onUpdateFinalResult={updateFinalResult}
          />
        </>
      ) : null}

      {canUseAdminFlow ? (
        <>
          <StepStrip
            mode="admin"
            employeeRecord={employeeRecord}
            finalResult={finalResult}
          />
          <AdminWorkspace
            state={state}
            rolePackLibrary={rolePackLibrary}
            onUpdateFinalResult={updateFinalResult}
            onResolveDesignationSetup={resolveDesignationSetup}
            onReset={resetPrototype}
          />
        </>
      ) : null}
    </div>
  )
}

function LoginScreen({
  loginState,
  setLoginState,
  handleLogin,
}: {
  loginState: { username: string; password: string; error: string }
  setLoginState: React.Dispatch<
    React.SetStateAction<{ username: string; password: string; error: string }>
  >
  handleLogin: (event: React.FormEvent) => void
}) {
  return (
    <div className="page-shell login-shell">
      <section className="hero-card login-card">
        <h1>BuyBetter appraisal</h1>
        <p className="lede">
          Sign in to complete self appraisal, manager review, and final appraisal release.
        </p>

        <form className="auth-form" onSubmit={handleLogin}>
          <label>
            <span>Username</span>
            <input
              value={loginState.username}
              onChange={(event) =>
                setLoginState((current) => ({ ...current, username: event.target.value, error: '' }))
              }
              placeholder="first.last"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={loginState.password}
              onChange={(event) =>
                setLoginState((current) => ({ ...current, password: event.target.value, error: '' }))
              }
              placeholder="Generated password"
            />
          </label>
          <button className="button primary login-submit" type="submit">Sign in</button>
          {loginState.error ? <p className="error-text">{loginState.error}</p> : null}
        </form>
      </section>
    </div>
  )
}

function EmployeeWorkspace({
  employee,
  selfRecord,
  assignments,
  finalResult,
  onUpdateSelf,
  onUpdateSelfKpiEntry,
}: {
  employee: EmployeeRecord
  selfRecord: SelfAppraisalRecord
  assignments: AssignmentRecord[]
  finalResult: FinalResultRecord
  onUpdateSelf: (employeeId: string, patch: Partial<SelfAppraisalRecord>) => void
  onUpdateSelfKpiEntry: (employeeId: string, assignmentId: string, patch: Partial<SelfKpiEntry>) => void
}) {
  const [selfPanelOpen, setSelfPanelOpen] = useState(false)
  return (
    <>
      <main className="employee-shell">
        <div className="employee-top-grid">
          <div className="employee-left-stack">
            <StepStrip
              mode="employee"
              employeeRecord={employee}
              finalResult={finalResult}
            />

            <section className="surface-card hero-section">
              <div className="section-head">
                <div>
                  <div className="eyebrow">My appraisal</div>
                  <h2>{employee.employeeName}</h2>
                </div>
                <StatusPill status={employee.status} />
              </div>
              <p className="subtle">
                {employee.designation} · {employee.appraisalRole || 'Role mapping pending'} · Manager:{' '}
                {employee.primaryOwnerLabel || 'Not mapped'}
              </p>
              {employee.blockers.length ? (
                <div className="warning-box">
                  <strong>Prototype blockers</strong>
                  <ul className="bullet-list compact">
                    {employee.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          </div>

          <aside className="surface-card summary-card employee-summary-card">
            <div className="summary-label">Appraisal completion</div>
            <div className="summary-figure">{selfRecord.status === 'submitted' ? 'Ready' : 'Draft'}</div>
            <div className="summary-gap" aria-hidden="true" />

            <div className="summary-metrics">
              <Metric label="KPI rows" value={`${assignments.length}`} compact />
              <Metric label="Result" value={finalResult.releasedToEmployee ? 'Live' : 'Held'} compact />
            </div>
          </aside>
        </div>

        <section className="surface-card section-card full-width-card">
          <div className="section-head">
            <div>
              <div className="eyebrow">Assigned KPIs</div>
              <h2>{assignments.length} scored areas</h2>
            </div>
            <button className="button" onClick={() => setSelfPanelOpen(true)}>
              Open self appraisal
            </button>
          </div>
          <div className="stack">
            {assignments.map((assignment) => (
              <article key={assignment.assignmentId} className="kpi-card">
                <div className="kpi-meta">
                  <strong>{assignment.kpiArea}</strong>
                  <span>{assignment.weightPercent}%</span>
                </div>
                <p>{assignment.kpiStatement}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="surface-card section-card full-width-card">
          <div className="section-head">
            <div>
              <div className="eyebrow">Final result</div>
              <h2>{finalResult.releasedToEmployee ? 'Released to you' : 'Held until release'}</h2>
            </div>
          </div>
          {finalResult.releasedToEmployee ? (
            <div className="stack">
              <TextBlock title="Manager summary" value={finalResult.managerSummary} />
              <TextBlock title="Final recommendation" value={finalResult.finalRecommendation} />
            </div>
          ) : (
            <p className="subtle">
              Your manager appraisal stays hidden until HR releases the final result.
            </p>
          )}
        </section>
      </main>

      {selfPanelOpen ? (
        <div className="drawer-backdrop" onClick={() => setSelfPanelOpen(false)}>
          <aside className="drawer-panel" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <div>
                <div className="eyebrow">Self appraisal</div>
                <h2>Score your appraisal areas</h2>
              </div>
              <button className="button subtle-button" onClick={() => setSelfPanelOpen(false)}>
                Close
              </button>
            </div>
            <div className="stack">
              <div className="employee-details-card">
                <div className="eyebrow">Employee details</div>
                <div className="detail-grid">
                  <DetailItem label="Name" value={employee.employeeName} />
                  <DetailItem label="Role / department" value={`${employee.designation} · ${employee.department}`} />
                  <DetailItem label="Review period" value={selfRecord.cycle} />
                  <DetailItem label="Manager" value={employee.primaryOwnerLabel || 'Not mapped'} />
                </div>
              </div>

              <section className="score-legend-card">
                <div className="eyebrow">Score guide</div>
                <div className="score-legend-grid">
                  <div><strong>1</strong><span>Far below expectation</span></div>
                  <div><strong>2</strong><span>Below expectation</span></div>
                  <div><strong>3</strong><span>Meets expectation</span></div>
                  <div><strong>4</strong><span>Above expectation</span></div>
                  <div><strong>5</strong><span>Exceptional</span></div>
                </div>
              </section>

              <div className="stack">
                {selfRecord.kpiEntries.map((entry, index) => (
                  <article key={entry.assignmentId} className="kpi-card self-kpi-card">
                    <div className="section-head">
                      <div>
                        <div className="eyebrow">Appraisal area {index + 1}</div>
                        <h3>{entry.kpiArea}</h3>
                      </div>
                      <label className="score-field">
                        <span>Self-score</span>
                        <select
                          value={entry.selfScore}
                          onChange={(event) =>
                            onUpdateSelfKpiEntry(employee.employeeId, entry.assignmentId, {
                              selfScore: Number(event.target.value),
                            })
                          }
                        >
                          <option value={0}>Select</option>
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                          <option value={5}>5</option>
                        </select>
                      </label>
                    </div>
                    <p>{entry.kpiStatement}</p>
                    <div className="stack tight">
                      <TextAreaField
                        label="Reason for score"
                        value={entry.reasonForScore}
                        onChange={(value) =>
                          onUpdateSelfKpiEntry(employee.employeeId, entry.assignmentId, {
                            reasonForScore: value,
                          })
                        }
                      />
                      <TextAreaField
                        label="Key achievements / evidence"
                        value={entry.keyEvidence}
                        onChange={(value) =>
                          onUpdateSelfKpiEntry(employee.employeeId, entry.assignmentId, {
                            keyEvidence: value,
                          })
                        }
                      />
                      <TextAreaField
                        label="Challenges faced"
                        value={entry.challengesFaced}
                        onChange={(value) =>
                          onUpdateSelfKpiEntry(employee.employeeId, entry.assignmentId, {
                            challengesFaced: value,
                          })
                        }
                      />
                    </div>
                  </article>
                ))}
              </div>

              <section className="overall-reflection-card">
                <div className="eyebrow">Overall reflection</div>
                <div className="stack">
                  <TextAreaField
                    label="Overall achievements"
                    value={selfRecord.overallAchievements}
                    onChange={(value) => onUpdateSelf(employee.employeeId, { overallAchievements: value })}
                  />
                  <TextAreaField
                    label="Major challenges"
                    value={selfRecord.majorChallenges}
                    onChange={(value) => onUpdateSelf(employee.employeeId, { majorChallenges: value })}
                  />
                  <TextAreaField
                    label="Support needed from manager / company"
                    value={selfRecord.supportNeeded}
                    onChange={(value) => onUpdateSelf(employee.employeeId, { supportNeeded: value })}
                  />
                  <TextAreaField
                    label="Development focus for next review period"
                    value={selfRecord.developmentFocus}
                    onChange={(value) => onUpdateSelf(employee.employeeId, { developmentFocus: value })}
                  />
                  <TextAreaField
                    label="Employee comments"
                    value={selfRecord.employeeComments}
                    onChange={(value) => onUpdateSelf(employee.employeeId, { employeeComments: value })}
                  />
                </div>
              </section>
            </div>
            <div className="button-row drawer-actions">
              <button
                className="button primary"
                onClick={() => onUpdateSelf(employee.employeeId, { status: 'submitted' })}
              >
                Mark self appraisal submitted
              </button>
              <span className="subtle">Current status: {selfRecord.status}</span>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}

function ManagerWorkspace({
  currentUser,
  employees,
  selectedEmployee,
  assignments,
  selfRecord,
  finalResult,
  onSelectEmployee,
  onUpdateAssignment,
  onUpdateFinalResult,
}: {
  currentUser: AppUser
  employees: EmployeeRecord[]
  selectedEmployee: EmployeeRecord | null
  assignments: AssignmentRecord[]
  selfRecord: SelfAppraisalRecord | null
  finalResult: FinalResultRecord | null
  onSelectEmployee: (employeeId: string) => void
  onUpdateAssignment: (assignmentId: string, patch: Partial<AssignmentRecord>) => void
  onUpdateFinalResult: (employeeId: string, patch: Partial<FinalResultRecord>) => void
}) {
  const selfSubmitted = Boolean(selfRecord?.status === 'submitted')
  return (
    <main className="calculator-shell">
      <div className="calculator-main">
        <section className="surface-card hero-section">
          <div className="section-head">
            <div>
              <div className="eyebrow">Appraisal owner</div>
              <h2>{currentUser.displayName}</h2>
            </div>
          </div>
          <p className="subtle">
            Review direct reports, score KPI rows, then prepare the final recommendation.
          </p>
        </section>

        <section className="surface-card section-card">
          <div className="section-head">
            <div>
              <div className="eyebrow">Direct reports</div>
              <h2>Select who to review</h2>
            </div>
          </div>
          <div className="stack">
            {employees.map((employee) => (
              <button
                key={employee.employeeId}
                className={`list-row ${selectedEmployee?.employeeId === employee.employeeId ? 'is-active' : ''}`}
                onClick={() => onSelectEmployee(employee.employeeId)}
              >
                <div>
                  <strong>{employee.employeeName}</strong>
                  <p>{employee.designation}</p>
                </div>
                <StatusPill status={employee.status} />
              </button>
            ))}
          </div>
        </section>

        {selectedEmployee ? (
          <>
            <section className="surface-card section-card">
              <div className="section-head">
                <div>
                  <div className="eyebrow">Employee summary</div>
                  <h2>{selectedEmployee.employeeName}</h2>
                </div>
              </div>
              <p className="subtle">
                {selectedEmployee.designation} · {selectedEmployee.appraisalRole || 'Role mapping pending'}
              </p>
              {selfRecord ? <TextBlock title="Employee self summary" value={selfRecord.overallAchievements || 'No self summary yet.'} /> : null}
              {!selfSubmitted ? (
                <div className="warning-box small">
                  <strong>Waiting on self appraisal</strong>
                  <p>Manager review unlocks only after the employee submits their self appraisal.</p>
                </div>
              ) : null}
            </section>

            <section className="surface-card section-card">
              <div className="section-head">
                <div>
                  <div className="eyebrow">Manager scoring</div>
                  <h2>{assignments.length} KPI rows</h2>
                </div>
              </div>
              <div className="stack">
                {assignments.map((assignment) => (
                  <article key={assignment.assignmentId} className="kpi-card">
                    <div className="kpi-meta">
                      <strong>{assignment.kpiArea}</strong>
                      <span>{assignment.weightPercent}%</span>
                    </div>
                    <p>{assignment.kpiStatement}</p>
                    <div className="kpi-edit-grid">
                      <label>
                        <span>Score (1-5)</span>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          value={assignment.score}
                          disabled={!selfSubmitted}
                          onChange={(event) =>
                            onUpdateAssignment(assignment.assignmentId, {
                              score: Number(event.target.value),
                              status: 'in_review',
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>Evidence note</span>
                        <input
                          value={assignment.evidenceNote}
                          disabled={!selfSubmitted}
                          onChange={(event) =>
                            onUpdateAssignment(assignment.assignmentId, {
                              evidenceNote: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      <span>Manager comment</span>
                      <textarea
                        value={assignment.managerComment}
                        disabled={!selfSubmitted}
                        onChange={(event) =>
                          onUpdateAssignment(assignment.assignmentId, {
                            managerComment: event.target.value,
                          })
                        }
                      />
                    </label>
                  </article>
                ))}
              </div>
            </section>

            {finalResult ? (
              <section className="surface-card section-card">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">Closeout</div>
                    <h2>Draft your recommendation</h2>
                  </div>
                  <span className="pill">{finalResult.performanceBand}</span>
                </div>
                <TextAreaField
                  label="Manager summary"
                  value={finalResult.managerSummary}
                  disabled={!selfSubmitted}
                  onChange={(value) => onUpdateFinalResult(selectedEmployee.employeeId, { managerSummary: value })}
                />
                <TextAreaField
                  label="Final recommendation"
                  value={finalResult.finalRecommendation}
                  disabled={!selfSubmitted}
                  onChange={(value) =>
                    onUpdateFinalResult(selectedEmployee.employeeId, { finalRecommendation: value })
                  }
                />
              </section>
            ) : null}
          </>
        ) : (
          <section className="surface-card section-card">
            <p className="subtle">No direct reports assigned to this appraisal owner account yet.</p>
          </section>
        )}
      </div>

      <aside className="summary-rail">
        <div className="section-head">
          <div>
            <div className="eyebrow">Review status</div>
            <h2>Summary rail</h2>
          </div>
        </div>
        <section className="surface-card summary-card sticky-card">
          {selectedEmployee ? (
            <>
              <div className="summary-label">Selected employee</div>
              <div className="summary-figure slim">{selectedEmployee.employeeName}</div>
              <div className="summary-subtitle">{selectedEmployee.designation}</div>
              <div className="summary-metrics">
                <Metric label="KPI rows" value={`${assignments.length}`} compact />
                <Metric label="Current score" value={`${finalResult?.finalScore ?? 0}`} compact />
                <Metric label="Band" value={finalResult?.performanceBand ?? 'Not rated'} compact />
              </div>
            </>
          ) : (
            <p className="subtle">Pick a direct report to start reviewing.</p>
          )}
        </section>
      </aside>
    </main>
  )
}

function AdminWorkspace({
  state,
  rolePackLibrary,
  onUpdateFinalResult,
  onResolveDesignationSetup,
  onReset,
}: {
  state: AppState
  rolePackLibrary: Map<string, RoleKpiEntry[]>
  onUpdateFinalResult: (employeeId: string, patch: Partial<FinalResultRecord>) => void
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
}) {
  const activeEmployees = state.employees.filter((employee) => !employee.excludedThisCycle)
  const activeUnresolvedEmployees = state.unresolvedEmployees.filter(
    (employee) => !state.employees.find((record) => record.employeeId === employee.employeeId)?.excludedThisCycle,
  )
  const [designationDrafts, setDesignationDrafts] = useState<
    Record<
      string,
      {
        roleName: string
        sourceRoleName: string
        managerLabel: string
        reviewerLabel: string
        kpiOwnerLabel: string
        customKpis: string
      }
    >
  >({})

  const readyEmployees = activeEmployees.filter((employee) => employee.status === 'ready').length
  const tentativeEmployees = activeEmployees.filter((employee) => employee.status === 'tentative').length
  const blockedEmployees = activeEmployees.filter((employee) => employee.status === 'blocked').length
  const unresolvedKpiCount = state.unresolvedDesignations.length
  const excludedCount = state.excludedDesignations.length
  const selfSubmittedCount = state.selfAppraisals.filter((record) => record.status === 'submitted').length
  const releasedCount = state.finalResults.filter((result) => result.releasedToEmployee).length
  const roleOptions = [...rolePackLibrary.keys()].sort((left, right) => left.localeCompare(right))

  const reviewPackets = activeEmployees
    .map((employee) => ({
      employee,
      selfRecord: state.selfAppraisals.find((record) => record.employeeId === employee.employeeId) ?? null,
      finalResult: state.finalResults.find((record) => record.employeeId === employee.employeeId) ?? null,
      assignments: state.assignments.filter((assignment) => assignment.employeeId === employee.employeeId),
    }))
    .filter((packet) => packet.selfRecord || packet.finalResult)
    .sort((left, right) => left.employee.employeeName.localeCompare(right.employee.employeeName))

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
    patch: Partial<{
      roleName: string
      sourceRoleName: string
      managerLabel: string
      reviewerLabel: string
      kpiOwnerLabel: string
      customKpis: string
    }>,
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
    <main className="workspace-grid admin-grid">
      <section className="surface-card alert-card">
        <div className="section-head">
          <div>
            <div className="eyebrow">HR action required</div>
            <h2>Missing KPI mappings still block part of the cycle</h2>
          </div>
          <span className="pill status-blocked">{unresolvedKpiCount} unresolved</span>
        </div>
        <p className="subtle">
          These unresolved designation-to-KPI mappings need HR or leadership decisions before those staff can be fully appraised in the prototype.
        </p>
        <div className="tag-cloud">
          {state.unresolvedDesignations.map((item) => (
            <span key={item.designation} className="pill issue-pill">
              {item.designation}
            </span>
          ))}
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <div>
            <div className="eyebrow">HR overview</div>
            <h2>Prototype status</h2>
          </div>
        </div>
        <div className="metric-grid">
          <Metric label="Employees" value={`${state.employees.length}`} />
          <Metric label="Ready" value={`${readyEmployees}`} />
          <Metric label="Tentative" value={`${tentativeEmployees}`} />
          <Metric label="Blocked" value={`${blockedEmployees}`} />
          <Metric label="Excluded" value={`${excludedCount}`} />
          <Metric label="Self submitted" value={`${selfSubmittedCount}`} />
          <Metric label="Released" value={`${releasedCount}`} />
        </div>
        <div className="button-row">
          <button
            className="button primary"
            onClick={() =>
              downloadFile(
                'appraisal-prototype-export.json',
                JSON.stringify(state, null, 2),
                'application/json',
              )
            }
          >
            Export JSON
          </button>
          <button
            className="button"
            onClick={() =>
              downloadFile(
                'appraisal-assignments.csv',
                toCsv(state.assignments as unknown as Record<string, unknown>[]),
                'text/csv',
              )
            }
          >
            Export assignments CSV
          </button>
          <button className="button subtle-button" onClick={onReset}>
            Reset prototype data
          </button>
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <div>
            <div className="eyebrow">Release control</div>
            <h2>Final result visibility</h2>
          </div>
        </div>
        <div className="stack">
          {state.finalResults.map((result) => (
            <article key={result.employeeId} className="list-row static-row">
              <div>
                <strong>{result.employeeName}</strong>
                <p>
                  {result.performanceBand} · score {result.finalScore}
                </p>
              </div>
              <button
                className={`button ${result.releasedToEmployee ? '' : 'primary'}`}
                onClick={() =>
                  onUpdateFinalResult(result.employeeId, {
                    releasedToEmployee: !result.releasedToEmployee,
                  })
                }
              >
                {result.releasedToEmployee ? 'Hide result' : 'Release result'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <div>
            <div className="eyebrow">Review packets</div>
            <h2>Self + manager review visibility</h2>
          </div>
        </div>
        <div className="stack">
          {reviewPackets.map(({ employee, selfRecord, finalResult, assignments }) => (
            <article key={employee.employeeId} className="list-row static-row packet-row">
              <div>
                <strong>{employee.employeeName}</strong>
                <p>
                  {employee.designation} · self {selfRecord?.status ?? 'not started'} · manager score{' '}
                  {finalResult?.finalScore ?? 0}
                </p>
                <p className="subtle">
                  Self summary: {selfRecord?.overallAchievements || 'No self summary yet'} · Manager summary:{' '}
                  {finalResult?.managerSummary || 'No manager summary yet'}
                </p>
              </div>
              <span className="pill">{assignments.length} KPI rows</span>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <div>
            <div className="eyebrow">Setup unresolved roles</div>
            <h2>Create KPI packs and routing from inside HR</h2>
          </div>
        </div>
        <div className="stack">
          {state.unresolvedDesignations.map((item) => {
            const draft = draftFor(item.designation, {
              role: item.suggestedAppraisalRole,
              manager: item.lineManagerLabel,
            })
            return (
              <article key={item.designation} className="warning-box small">
                <div className="section-head">
                  <div>
                    <strong>{item.designation}</strong>
                    <p className="subtle">{item.notes || 'No notes provided.'}</p>
                  </div>
                  <span className="pill issue-pill">Needs setup</span>
                </div>
                <div className="kpi-edit-grid">
                  <label>
                    <span>Mapped appraisal role</span>
                    <input
                      value={draft.roleName}
                      onChange={(event) => updateDraft(item.designation, { roleName: event.target.value })}
                      placeholder="Finance Officer"
                    />
                  </label>
                  <label>
                    <span>Copy KPI pack from</span>
                    <select
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
                    <span>Line manager / appraisal owner</span>
                    <input
                      value={draft.managerLabel}
                      onChange={(event) => updateDraft(item.designation, { managerLabel: event.target.value })}
                      placeholder="Chief of Staff"
                    />
                  </label>
                  <label>
                    <span>Reviewer</span>
                    <input
                      value={draft.reviewerLabel}
                      onChange={(event) => updateDraft(item.designation, { reviewerLabel: event.target.value })}
                      placeholder="Chief of Staff"
                    />
                  </label>
                  <label>
                    <span>KPI owner</span>
                    <input
                      value={draft.kpiOwnerLabel}
                      onChange={(event) => updateDraft(item.designation, { kpiOwnerLabel: event.target.value })}
                      placeholder="Chief of Staff"
                    />
                  </label>
                </div>
                <label>
                  <span>Custom KPI lines</span>
                  <textarea
                    value={draft.customKpis}
                    onChange={(event) => updateDraft(item.designation, { customKpis: event.target.value })}
                    placeholder="KPI Area | KPI Statement | Weight"
                  />
                </label>
                <div className="button-row">
                  <button
                    className="button primary"
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
                  <span className="subtle">
                    Use either an existing KPI pack or paste custom KPI lines in `Area | Statement | Weight` format.
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <div>
            <div className="eyebrow">Unresolved gaps</div>
            <h2>Employee and manager mapping issues</h2>
          </div>
        </div>
        <div className="split-grid">
          <article>
            <h3>Employees still waiting on setup</h3>
            <div className="stack tight">
              {activeUnresolvedEmployees.map((item) => (
                <div key={item.employeeId} className="warning-box small">
                  <strong>{item.employeeName}</strong>
                  <p>{item.designation}</p>
                  <p>{item.blockers.join(' · ')}</p>
                </div>
              ))}
            </div>
          </article>
          <article>
            <h3>Manager routing issues</h3>
            <div className="stack tight">
              {state.unresolvedManagers.map((item) => (
                <div key={`${item.employeeName}-${item.designation}`} className="warning-box small">
                  <strong>{item.employeeName}</strong>
                  <p>{item.designation}</p>
                  <p>{item.issue}</p>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <div>
            <div className="eyebrow">Excluded this cycle</div>
            <h2>Non-core roles left out on purpose</h2>
          </div>
          <span className="pill">{excludedCount}</span>
        </div>
        <div className="stack tight">
          {state.excludedDesignations.map((item) => (
            <div key={item.designation} className="text-block">
              <h3>{item.designation}</h3>
              <p>{item.notes || 'Excluded from this cycle by decision.'}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <div>
            <div className="eyebrow">Generated accounts</div>
            <h2>Prototype credentials</h2>
          </div>
        </div>
        <div className="credential-list dense">
          {state.users.map((user) => (
            <div key={user.id} className="credential-row">
              <strong>{user.displayName}</strong>
              <span>{user.username}</span>
              <code>{user.password}</code>
              <span className="pill">{user.capabilities.join(' · ')}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

function StatusPill({ status }: { status: EmployeeRecord['status'] }) {
  return <span className={`pill status-${status}`}>{status}</span>
}

function StepStrip({
  mode,
  employeeRecord,
  finalResult,
}: {
  mode: 'employee' | 'manager' | 'admin'
  employeeRecord: EmployeeRecord | null
  finalResult: FinalResultRecord | null
}) {
  const steps =
    mode === 'employee'
      ? [
          { label: 'Sign in', active: true },
          { label: 'Fill self appraisal', active: Boolean(employeeRecord?.canSelfAppraise) },
          { label: 'Manager review', active: true },
          { label: 'Final result', active: Boolean(finalResult?.releasedToEmployee) },
        ]
      : mode === 'manager'
        ? [
            { label: 'Sign in', active: true },
            { label: 'Review direct reports', active: true },
            { label: 'Score KPI rows', active: true },
            { label: 'Draft recommendation', active: true },
          ]
        : [
            { label: 'Sign in', active: true },
            { label: 'Review unresolved mappings', active: true },
            { label: 'Release results', active: true },
            { label: 'Export records', active: true },
          ]

  return (
    <section className="step-strip surface-card">
      {steps.map((step, index) => (
        <div key={step.label} className={`step-item ${step.active ? 'is-active' : ''}`}>
          <span className="step-index">{index + 1}</span>
          <span>{step.label}</span>
        </div>
      ))}
    </section>
  )
}

function TextAreaField({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <textarea disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function TextBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="text-block">
      <h3>{title}</h3>
      <p>{value || 'No entry yet.'}</p>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <article className={`metric-card ${compact ? 'compact' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

export default App
