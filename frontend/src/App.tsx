import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CasebookEmployeeWorkspace,
  CasebookHrEmployeesWorkspace,
  CasebookHrOverviewWorkspace,
  CasebookHrReleaseWorkspace,
  CasebookManagerWorkspace,
  CasebookOverviewWorkspace,
} from './casebook/WorkspaceViews'
import { useAuth } from './domains/auth/hooks'
import { ApiError, apiClient } from './shared/api/client'
import type {
  AppState,
  AppUser,
  AssignmentRecord,
  CustomRolePack,
  EmployeeRecord,
  ExcludedDesignation,
  FinalResultRecord,
  RoleKpiEntry,
  SelfKpiEntry,
  SelfAppraisalRecord,
  UnresolvedDesignation,
  UnresolvedEmployee,
  UnresolvedManager,
} from './types'

interface BackendWorkspaceResponse {
  cycle_code: string
  cycle_closes_at: string | null
  employee: {
    employee_code: string
    full_name: string
    designation: string
    appraisal_role_name: string | null
    department: string | null
    level: string | null
    line_manager_label: string | null
    reviewer_label: string | null
    kpi_owner_label: string | null
    primary_owner_label: string | null
    can_self_appraise: boolean
    status: 'ready' | 'tentative' | 'blocked'
    blockers: string[]
  }
  assignments: Array<{
    id: string
    kpi_area: string
    kpi_statement: string
    weight_percent: number
    manager_score: number
    manager_comment: string | null
    evidence_note: string | null
    development_action: string | null
    manager_status: 'pending' | 'in_review' | 'completed'
  }>
  self_appraisal: {
    id: string
    status: 'draft' | 'submitted'
    overall_achievements: string | null
    major_challenges: string | null
    support_needed: string | null
    development_focus: string | null
    employee_comments: string | null
    submitted_at: string | null
    items: Array<{
      employee_kpi_assignment_id: string
      self_score: number
      reason_for_score: string | null
      key_evidence: string | null
      challenges_faced: string | null
    }>
  } | null
  final_result: {
    id: string
    self_summary: string | null
    manager_summary: string | null
    final_recommendation: string | null
    final_score: number
    performance_band: string
    released_to_employee: boolean
  } | null
}

interface BackendWorkspaceCollectionResponse {
  workspaces: BackendWorkspaceResponse[]
}

interface BackendUnresolvedDesignationResponse {
  designation: string
  suggested_appraisal_role: string
  line_manager_label: string
  notes: string
}

interface BackendUnresolvedEmployeeResponse {
  employee_name: string
  designation: string
  employee_id: string
  status: 'ready' | 'tentative' | 'blocked'
  blockers: string[]
}

interface BackendUnresolvedManagerResponse {
  employee_name: string
  designation: string
  issue: string
}

interface BackendExcludedDesignationResponse {
  designation: string
  notes: string
}

interface BackendAdminWorkspaceResponse extends BackendWorkspaceCollectionResponse {
  unresolved_designations: BackendUnresolvedDesignationResponse[]
  unresolved_employees: BackendUnresolvedEmployeeResponse[]
  unresolved_managers: BackendUnresolvedManagerResponse[]
  excluded_designations: BackendExcludedDesignationResponse[]
}

function createEmptyState(): AppState {
  return {
    users: [],
    employees: [],
    assignments: [],
    selfAppraisals: [],
    finalResults: [],
    customRolePacks: [],
    unresolvedDesignations: [],
    unresolvedEmployees: [],
    unresolvedManagers: [],
    excludedDesignations: [],
  }
}

function mergeEmployeeWorkspaceIntoState(
  current: AppState,
  workspace: BackendWorkspaceResponse,
  username: string,
): AppState {
  const employeeId = workspace.employee.employee_code
  const existingEmployee = current.employees.find((employee) => employee.employeeId === employeeId)
  const employeeName = workspace.employee.full_name

  const nextEmployee: EmployeeRecord = {
    employeeId,
    employeeName,
    designation: workspace.employee.designation,
    appraisalRole: workspace.employee.appraisal_role_name ?? existingEmployee?.appraisalRole ?? '',
    department: workspace.employee.department ?? existingEmployee?.department ?? 'Unassigned',
    level: workspace.employee.level ?? existingEmployee?.level ?? '',
    employeeUsername: username,
    managerLabel: workspace.employee.line_manager_label ?? workspace.employee.primary_owner_label ?? existingEmployee?.managerLabel ?? '',
    reviewerLabel: workspace.employee.reviewer_label ?? existingEmployee?.reviewerLabel ?? '',
    kpiOwnerLabel: workspace.employee.kpi_owner_label ?? existingEmployee?.kpiOwnerLabel ?? '',
    primaryOwnerLabel: workspace.employee.primary_owner_label ?? existingEmployee?.primaryOwnerLabel ?? '',
    status: workspace.employee.status,
    blockers: workspace.employee.blockers,
    excludedThisCycle: existingEmployee?.excludedThisCycle ?? false,
    canSelfAppraise: workspace.employee.can_self_appraise,
    canViewFinalResult: workspace.final_result?.released_to_employee ?? existingEmployee?.canViewFinalResult ?? false,
  }

  const assignmentsForEmployee: AssignmentRecord[] = workspace.assignments.map((assignment) => ({
    assignmentId: assignment.id,
    cycle: workspace.cycle_code,
    employeeId,
    employeeName,
    employeeUsername: username,
    jobTitle: workspace.employee.appraisal_role_name ?? existingEmployee?.appraisalRole ?? '',
    department: workspace.employee.department ?? existingEmployee?.department ?? 'Unassigned',
    kpiArea: assignment.kpi_area,
    kpiStatement: assignment.kpi_statement,
    weightPercent: assignment.weight_percent,
    managerLabel: workspace.employee.line_manager_label ?? workspace.employee.primary_owner_label ?? existingEmployee?.managerLabel ?? '',
    reviewerLabel: workspace.employee.reviewer_label ?? existingEmployee?.reviewerLabel ?? '',
    kpiOwnerLabel: workspace.employee.kpi_owner_label ?? existingEmployee?.kpiOwnerLabel ?? '',
    primaryOwnerLabel: workspace.employee.primary_owner_label ?? existingEmployee?.primaryOwnerLabel ?? '',
    score: assignment.manager_score,
    managerComment: assignment.manager_comment ?? '',
    evidenceNote: assignment.evidence_note ?? '',
    developmentAction: assignment.development_action ?? '',
    status: assignment.manager_status,
  }))

  const selfItemsByAssignment = new Map(
    (workspace.self_appraisal?.items ?? []).map((item) => [item.employee_kpi_assignment_id, item]),
  )

  const nextSelfRecord: SelfAppraisalRecord = {
    employeeId,
    employeeName,
    employeeUsername: username,
    cycle: workspace.cycle_code,
    cycleClosesAt: workspace.cycle_closes_at,
    kpiEntries: assignmentsForEmployee.map((assignment) => {
      const item = selfItemsByAssignment.get(assignment.assignmentId)
      return {
        assignmentId: assignment.assignmentId,
        kpiArea: assignment.kpiArea,
        kpiStatement: assignment.kpiStatement,
        selfScore: item?.self_score ?? 0,
        reasonForScore: item?.reason_for_score ?? '',
        keyEvidence: item?.key_evidence ?? '',
        challengesFaced: item?.challenges_faced ?? '',
      }
    }),
    overallAchievements: workspace.self_appraisal?.overall_achievements ?? '',
    majorChallenges: workspace.self_appraisal?.major_challenges ?? '',
    supportNeeded: workspace.self_appraisal?.support_needed ?? '',
    developmentFocus: workspace.self_appraisal?.development_focus ?? '',
    employeeComments: workspace.self_appraisal?.employee_comments ?? '',
    status: workspace.self_appraisal?.status ?? 'draft',
    submittedAt: workspace.self_appraisal?.submitted_at ?? null,
  }

  const existingFinal = current.finalResults.find((result) => result.employeeId === employeeId)
  const nextFinalResult: FinalResultRecord = {
    employeeId,
    employeeName,
    employeeUsername: username,
    cycle: workspace.cycle_code,
    managerSummary: workspace.final_result?.manager_summary ?? existingFinal?.managerSummary ?? '',
    selfSummary: workspace.final_result?.self_summary ?? existingFinal?.selfSummary ?? '',
    finalRecommendation: workspace.final_result?.final_recommendation ?? existingFinal?.finalRecommendation ?? '',
    finalScore: workspace.final_result?.final_score ?? existingFinal?.finalScore ?? 0,
    performanceBand: workspace.final_result?.performance_band ?? existingFinal?.performanceBand ?? 'Not rated',
    releasedToEmployee: workspace.final_result?.released_to_employee ?? existingFinal?.releasedToEmployee ?? false,
  }

  return {
    ...current,
    employees: [...current.employees.filter((employee) => employee.employeeId !== employeeId), nextEmployee],
    assignments: [
      ...current.assignments.filter((assignment) => assignment.employeeId !== employeeId),
      ...assignmentsForEmployee,
    ],
    selfAppraisals: [
      ...current.selfAppraisals.filter((record) => record.employeeId !== employeeId),
      nextSelfRecord,
    ],
    finalResults: [
      ...current.finalResults.filter((record) => record.employeeId !== employeeId),
      nextFinalResult,
    ],
  }
}

function mergeWorkspacesIntoState(current: AppState, workspaces: BackendWorkspaceResponse[]) {
  return workspaces.reduce((nextState, workspace) => {
    const existingEmployee = nextState.employees.find((employee) => employee.employeeId === workspace.employee.employee_code)
    const username =
      existingEmployee?.employeeUsername ??
      workspace.employee.full_name.trim().toLowerCase().replaceAll(/\s+/g, '.')
    return mergeEmployeeWorkspaceIntoState(nextState, workspace, username)
  }, current)
}

function mergeAdminWorkspaceIntoState(current: AppState, adminWorkspace: BackendAdminWorkspaceResponse): AppState {
  const merged = mergeWorkspacesIntoState(current, adminWorkspace.workspaces)
  const unresolvedDesignations: UnresolvedDesignation[] = adminWorkspace.unresolved_designations.map((item) => ({
    designation: item.designation,
    suggestedAppraisalRole: item.suggested_appraisal_role,
    lineManagerLabel: item.line_manager_label,
    notes: item.notes,
  }))
  const unresolvedEmployees: UnresolvedEmployee[] = adminWorkspace.unresolved_employees.map((item) => ({
    employeeName: item.employee_name,
    designation: item.designation,
    employeeId: item.employee_id,
    status: item.status,
    blockers: item.blockers,
  }))
  const unresolvedManagers: UnresolvedManager[] = adminWorkspace.unresolved_managers.map((item) => ({
    employeeName: item.employee_name,
    designation: item.designation,
    issue: item.issue,
  }))
  const excludedDesignations: ExcludedDesignation[] = adminWorkspace.excluded_designations.map((item) => ({
    designation: item.designation,
    notes: item.notes,
  }))

  return {
    ...merged,
    unresolvedDesignations,
    unresolvedEmployees,
    unresolvedManagers,
    excludedDesignations,
  }
}

function buildSelfAppraisalPayload(record: SelfAppraisalRecord, assignments: AssignmentRecord[]) {
  const assignmentIds = new Set(assignments.map((assignment) => assignment.assignmentId))
  return {
    status: record.status,
    overall_achievements: record.overallAchievements,
    major_challenges: record.majorChallenges,
    support_needed: record.supportNeeded,
    development_focus: record.developmentFocus,
    employee_comments: record.employeeComments,
    items: record.kpiEntries
      .filter((entry) => assignmentIds.has(entry.assignmentId))
      .map((entry) => ({
        employee_kpi_assignment_id: entry.assignmentId,
        self_score: entry.selfScore,
        reason_for_score: entry.reasonForScore,
        key_evidence: entry.keyEvidence,
        challenges_faced: entry.challengesFaced,
      })),
  }
}

function buildSelfPayloadFromWorkspace(workspace: BackendWorkspaceResponse) {
  return JSON.stringify({
    status: workspace.self_appraisal?.status ?? 'draft',
    overall_achievements: workspace.self_appraisal?.overall_achievements ?? '',
    major_challenges: workspace.self_appraisal?.major_challenges ?? '',
    support_needed: workspace.self_appraisal?.support_needed ?? '',
    development_focus: workspace.self_appraisal?.development_focus ?? '',
    employee_comments: workspace.self_appraisal?.employee_comments ?? '',
    items: workspace.assignments.map((assignment) => {
      const item =
        workspace.self_appraisal?.items.find(
          (entry) => entry.employee_kpi_assignment_id === assignment.id,
        ) ?? null
      return {
        employee_kpi_assignment_id: assignment.id,
        self_score: item?.self_score ?? 0,
        reason_for_score: item?.reason_for_score ?? '',
        key_evidence: item?.key_evidence ?? '',
        challenges_faced: item?.challenges_faced ?? '',
      }
    }),
  })
}

function hasCycleClosed(cycleClosesAt: string | null) {
  if (!cycleClosesAt) return false
  return new Date(cycleClosesAt).getTime() <= Date.now()
}

function isUnauthorizedApiError(error: unknown) {
  return error instanceof ApiError && error.status === 401
}

function toBackendAssignmentPatch(patch: Partial<AssignmentRecord>) {
  return {
    manager_score: patch.score,
    manager_comment: patch.managerComment,
    evidence_note: patch.evidenceNote,
    development_action: patch.developmentAction,
    manager_status: patch.status,
  }
}

function toBackendFinalResultPatch(patch: Partial<FinalResultRecord>) {
  return {
    self_summary: patch.selfSummary,
    manager_summary: patch.managerSummary,
    final_recommendation: patch.finalRecommendation,
    released_to_employee: patch.releasedToEmployee,
  }
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

function AppraisalWorkspace({
  mode,
  page,
}: {
  mode: 'employee' | 'manager' | 'admin'
  page: 'overview' | 'appraisal' | 'team' | 'release'
}) {
  const [state, setState] = useState<AppState>(createEmptyState)
  const { authState, sessionPending, logout } = useAuth()
  const [workspaceLoadState, setWorkspaceLoadState] = useState({ loading: false, error: '', ready: false })
  const [reviewLoadState, setReviewLoadState] = useState({ loading: false, error: '', ready: false })
  const [selfActionState, setSelfActionState] = useState<'idle' | 'saving' | 'submitting' | 'editing'>('idle')
  const [teamSearchQuery, setTeamSearchQuery] = useState('')
  const [teamSearchIds, setTeamSearchIds] = useState<string[] | null>(null)
  const [teamSearchLoading, setTeamSearchLoading] = useState(false)
  const [releaseSearchQuery, setReleaseSearchQuery] = useState('')
  const [releaseSearchIds, setReleaseSearchIds] = useState<string[] | null>(null)
  const [releaseSearchLoading, setReleaseSearchLoading] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const lastSyncedSelfPayloadRef = useRef<string | null>(null)
  const autosaveTimerRef = useRef<number | null>(null)

  const currentUser = useMemo<AppUser | null>(() => {
    if (!authState) return null
    return {
      id: authState.id,
      username: authState.username,
      password: '',
      displayName: authState.displayName,
      kind: authState.capabilities[0] ?? 'employee',
      capabilities: authState.capabilities,
      employeeId: authState.employeeId,
      managerScopes: authState.managerScopes,
    }
  }, [authState])

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

  const activeEmployees = useMemo(() => {
    const rank = { ready: 0, tentative: 1, blocked: 2 } as const
    return [...state.employees]
      .filter((employee) => !employee.excludedThisCycle)
      .sort((left, right) => {
        const byStatus = rank[left.status] - rank[right.status]
        if (byStatus !== 0) return byStatus
        return left.employeeName.localeCompare(right.employeeName)
      })
  }, [state.employees])

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

  const reviewEmployees = useMemo(
    () => (canUseAdminFlow ? activeEmployees : managedEmployees),
    [activeEmployees, canUseAdminFlow, managedEmployees],
  )

  const visibleReviewEmployees = useMemo(() => {
    if (!teamSearchIds) return reviewEmployees
    const allowedIds = new Set(teamSearchIds)
    return reviewEmployees.filter((employee) => allowedIds.has(employee.employeeId))
  }, [reviewEmployees, teamSearchIds])

  const visibleReleaseResults = useMemo(() => {
    if (!releaseSearchIds) return state.finalResults
    const allowedIds = new Set(releaseSearchIds)
    return state.finalResults.filter((result) => allowedIds.has(result.employeeId))
  }, [releaseSearchIds, state.finalResults])

  useEffect(() => {
    if (visibleReviewEmployees.length && !visibleReviewEmployees.some((employee) => employee.employeeId === selectedManagedEmployeeId)) {
      setSelectedManagedEmployeeId(visibleReviewEmployees[0].employeeId)
    }
  }, [visibleReviewEmployees, selectedManagedEmployeeId])

  const selectedReviewEmployee = useMemo(
    () => reviewEmployees.find((employee) => employee.employeeId === selectedManagedEmployeeId) ?? null,
    [reviewEmployees, selectedManagedEmployeeId],
  )

  const selectedReviewAssignments = useMemo(() => {
    if (!selectedReviewEmployee) return []
    return state.assignments.filter((assignment) => assignment.employeeId === selectedReviewEmployee.employeeId)
  }, [selectedReviewEmployee, state.assignments])

  const selectedReviewSelfRecord = useMemo(() => {
    if (!selectedReviewEmployee) return null
    return state.selfAppraisals.find((record) => record.employeeId === selectedReviewEmployee.employeeId) ?? null
  }, [selectedReviewEmployee, state.selfAppraisals])

  const selectedReviewFinalResult = useMemo(() => {
    if (!selectedReviewEmployee) return null
    return state.finalResults.find((record) => record.employeeId === selectedReviewEmployee.employeeId) ?? null
  }, [selectedReviewEmployee, state.finalResults])

  useEffect(() => {
    if (!currentUser || !canUseEmployeeFlow || !currentUser.employeeId) {
      setWorkspaceLoadState((current) =>
        current.loading || current.error || current.ready ? { loading: false, error: '', ready: false } : current,
      )
      lastSyncedSelfPayloadRef.current = null
      return
    }

    let cancelled = false
    setWorkspaceLoadState({ loading: true, error: '', ready: false })

    apiClient<BackendWorkspaceResponse>('/employee/me/workspace')
      .then((workspace) => {
        if (cancelled) return
        lastSyncedSelfPayloadRef.current = buildSelfPayloadFromWorkspace(workspace)
        setState((current) => mergeEmployeeWorkspaceIntoState(current, workspace, currentUser.username))
        setWorkspaceLoadState({ loading: false, error: '', ready: true })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (isUnauthorizedApiError(error)) {
          void logout()
        }
        const message = error instanceof Error ? error.message : 'Failed to load employee workspace.'
        setWorkspaceLoadState({ loading: false, error: message, ready: false })
      })

    return () => {
      cancelled = true
    }
  }, [canUseEmployeeFlow, currentUser, logout, reloadNonce])

  useEffect(() => {
    if (!currentUser) return
    if (!canUseAdminFlow && !canUseManagerFlow) {
      setReviewLoadState((current) =>
        current.loading || current.error || current.ready ? { loading: false, error: '', ready: false } : current,
      )
      return
    }

    let cancelled = false
    const endpoint = canUseAdminFlow ? '/admin/workspace' : '/manager/workspace'
    setReviewLoadState({ loading: true, error: '', ready: false })

    apiClient<BackendAdminWorkspaceResponse | BackendWorkspaceCollectionResponse>(endpoint)
      .then((payload) => {
        if (cancelled) return
        setState((current) =>
          canUseAdminFlow
            ? mergeAdminWorkspaceIntoState(current, payload as BackendAdminWorkspaceResponse)
            : mergeWorkspacesIntoState(current, (payload as BackendWorkspaceCollectionResponse).workspaces),
        )
        setReviewLoadState({ loading: false, error: '', ready: true })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (isUnauthorizedApiError(error)) {
          void logout()
        }
        const message = error instanceof Error ? error.message : 'Failed to load review workspace.'
        setReviewLoadState({ loading: false, error: message, ready: false })
      })

    return () => {
      cancelled = true
    }
  }, [canUseAdminFlow, canUseManagerFlow, currentUser, logout, reloadNonce])

  useEffect(() => {
    if (!currentUser || !canUseEmployeeFlow || !employeeRecord || !selfRecord || !workspaceLoadState.ready) {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
      return
    }
    if (selfRecord.status !== 'draft' || hasCycleClosed(selfRecord.cycleClosesAt) || selfActionState !== 'idle') {
      return
    }

    const payload = JSON.stringify(buildSelfAppraisalPayload(selfRecord, employeeAssignments))
    if (!lastSyncedSelfPayloadRef.current || payload === lastSyncedSelfPayloadRef.current) {
      return
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const workspace = await apiClient<BackendWorkspaceResponse>('/employee/me/self-appraisal', {
            method: 'PUT',
            body: payload,
          })
          lastSyncedSelfPayloadRef.current = buildSelfPayloadFromWorkspace(workspace)
          setState((current) => mergeEmployeeWorkspaceIntoState(current, workspace, currentUser.username))
          setWorkspaceLoadState((current) => ({ ...current, error: '' }))
        } catch (error: unknown) {
          if (isUnauthorizedApiError(error)) {
            void logout()
          }
          const message = error instanceof Error ? error.message : 'Failed to autosave self appraisal draft.'
          setWorkspaceLoadState((current) => ({ ...current, error: message }))
        }
      })()
    }, 800)

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [
    canUseEmployeeFlow,
    currentUser,
    employeeAssignments,
    employeeRecord,
    selfRecord,
    selfActionState,
    workspaceLoadState.ready,
  ])

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

  async function persistSelfAppraisalStatus(
    employeeId: string,
    nextStatus: 'draft' | 'submitted',
    action: 'saving' | 'submitting' | 'editing',
  ) {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    if (!currentUser || currentUser.employeeId !== employeeId || !canUseEmployeeFlow) {
      return false
    }

    const record = state.selfAppraisals.find((item) => item.employeeId === employeeId)
    if (!record) return false
    const assignmentsForEmployee = state.assignments.filter((assignment) => assignment.employeeId === employeeId)

    setSelfActionState(action)
    setWorkspaceLoadState((current) => ({ ...current, error: '' }))

    try {
      const workspace = await apiClient<BackendWorkspaceResponse>('/employee/me/self-appraisal', {
        method: 'PUT',
        body: JSON.stringify(
          buildSelfAppraisalPayload(
            {
              ...record,
              status: nextStatus,
            },
            assignmentsForEmployee,
          ),
        ),
      })
      lastSyncedSelfPayloadRef.current = buildSelfPayloadFromWorkspace(workspace)
      setState((current) => mergeEmployeeWorkspaceIntoState(current, workspace, currentUser.username))
      setWorkspaceLoadState((current) => ({ ...current, error: '', ready: true }))
      setSelfActionState('idle')
      return true
    } catch (error: unknown) {
      if (isUnauthorizedApiError(error)) {
        void logout()
      }
      const message = error instanceof Error ? error.message : 'Failed to submit self appraisal.'
      setWorkspaceLoadState((current) => ({ ...current, error: message }))
      setSelfActionState('idle')
      return false
    }
  }

  async function saveSelfAppraisalDraft(employeeId: string) {
    return persistSelfAppraisalStatus(employeeId, 'draft', 'saving')
  }

  async function submitSelfAppraisal(employeeId: string) {
    return persistSelfAppraisalStatus(employeeId, 'submitted', 'submitting')
  }

  async function editSubmittedSelfAppraisal(employeeId: string) {
    return persistSelfAppraisalStatus(employeeId, 'draft', 'editing')
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

    if (!currentUser || !canUseManagerFlow) {
      return
    }

    void (async () => {
      try {
        const workspace = await apiClient<BackendWorkspaceResponse>(`/manager/assignments/${assignmentId}`, {
          method: 'PATCH',
          body: JSON.stringify(toBackendAssignmentPatch(patch)),
        })
        setState((current) => mergeWorkspacesIntoState(current, [workspace]))
      } catch (error: unknown) {
        if (isUnauthorizedApiError(error)) {
          void logout()
        }
        // Keep optimistic local state if backend sync fails.
      }
    })()
  }

  function updateFinalResult(employeeId: string, patch: Partial<FinalResultRecord>) {
    setState((current) => ({
      ...current,
      finalResults: current.finalResults.map((record) =>
        record.employeeId === employeeId ? { ...record, ...patch } : record,
      ),
    }))

    if (!currentUser || (!canUseManagerFlow && !canUseAdminFlow)) {
      return
    }

    const endpoint = canUseAdminFlow
      ? `/admin/final-results/${employeeId}`
      : `/manager/final-results/${employeeId}`

    void (async () => {
      try {
        const workspace = await apiClient<BackendWorkspaceResponse>(endpoint, {
          method: 'PATCH',
          body: JSON.stringify(toBackendFinalResultPatch(patch)),
        })
        setState((current) => mergeWorkspacesIntoState(current, [workspace]))
      } catch (error: unknown) {
        if (isUnauthorizedApiError(error)) {
          void logout()
        }
        // Keep optimistic local state if backend sync fails.
      }
    })()
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
    if (currentUser && canUseAdminFlow) {
      void (async () => {
        try {
          const payload = await apiClient<BackendAdminWorkspaceResponse>('/admin/designation-mappings/resolve', {
            method: 'POST',
            body: JSON.stringify({
              designation,
              role_name: roleName,
              source_role_name: sourceRoleName,
              entries: entries.map((entry) => ({
                kpi_area: entry.kpiArea,
                kpi_statement: entry.kpiStatement,
                weight_percent: entry.weightPercent,
              })),
              manager_label: managerLabel,
              reviewer_label: reviewerLabel,
              kpi_owner_label: kpiOwnerLabel,
            }),
          })
          setState((current) => mergeAdminWorkspaceIntoState(current, payload))
        } catch (error: unknown) {
          if (isUnauthorizedApiError(error)) {
            void logout()
          }
          // Fall through to local-only setup if backend sync fails.
          setState((current) => current)
        }
      })()
    }

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

  function resolveSearchEndpoint(scope: 'manager' | 'admin') {
    return scope === 'admin' ? '/admin/search' : '/manager/search'
  }

  async function searchEmployeeCodes(
    query: string,
    scope: 'manager' | 'admin',
    setter: (employeeIds: string[] | null) => void,
    loadingSetter: (loading: boolean) => void,
  ) {
    const normalized = query.trim()
    if (!normalized) {
      setter(null)
      loadingSetter(false)
      return
    }

    loadingSetter(true)
    try {
      const params = new URLSearchParams({ query: normalized })
      const payload = await apiClient<{ employee_codes: string[] }>(`${resolveSearchEndpoint(scope)}?${params.toString()}`)
      setter(payload.employee_codes)
    } catch (error: unknown) {
      if (isUnauthorizedApiError(error)) {
        void logout()
      }
      setter([])
    } finally {
      loadingSetter(false)
    }
  }

  useEffect(() => {
    const scope = canUseAdminFlow ? 'admin' : 'manager'
    if (!canUseManagerFlow && !canUseAdminFlow) {
      setTeamSearchIds(null)
      setTeamSearchLoading(false)
      return
    }

    const timer = window.setTimeout(() => {
      void searchEmployeeCodes(teamSearchQuery, scope, setTeamSearchIds, setTeamSearchLoading)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [canUseAdminFlow, canUseManagerFlow, logout, teamSearchQuery])

  useEffect(() => {
    if (!canUseAdminFlow) {
      setReleaseSearchIds(null)
      setReleaseSearchLoading(false)
      return
    }

    const timer = window.setTimeout(() => {
      void searchEmployeeCodes(releaseSearchQuery, 'admin', setReleaseSearchIds, setReleaseSearchLoading)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [canUseAdminFlow, logout, releaseSearchQuery])

  if (sessionPending) {
    return (
      <section className="surface-card section-card">
        <p className="subtle">Restoring your session…</p>
      </section>
    )
  }

  if (!currentUser) {
    return null
  }

  const employeeWorkspaceReady = !canUseEmployeeFlow || workspaceLoadState.ready

  if (page === 'appraisal') {
    if (!canUseEmployeeFlow) {
      return (
        <section className="surface-card section-card">
          <p className="subtle">You do not have access to the employee appraisal workspace.</p>
        </section>
      )
    }
    if (!workspaceLoadState.ready) {
      return (
        <section className="surface-card section-card">
          <p className="subtle">{workspaceLoadState.loading ? 'Loading your appraisal workspace…' : 'Unable to load your appraisal workspace.'}</p>
          {workspaceLoadState.error ? <p className="error-text">{workspaceLoadState.error}</p> : null}
        </section>
      )
    }
    if (!employeeRecord || !selfRecord || !finalResult) {
      return (
        <section className="surface-card section-card">
          <p className="subtle">No employee appraisal workspace is available for this account.</p>
        </section>
      )
    }
    return (
      <CasebookEmployeeWorkspace
        employee={employeeRecord}
        selfRecord={selfRecord}
        assignments={employeeAssignments}
        finalResult={finalResult}
        workspaceLoading={workspaceLoadState.loading}
        workspaceError={workspaceLoadState.error}
        selfActionState={selfActionState}
        onUpdateSelf={updateSelfAppraisal}
        onUpdateSelfKpiEntry={updateSelfKpiEntry}
        onSaveSelfDraft={saveSelfAppraisalDraft}
        onSubmitSelf={submitSelfAppraisal}
        onEditSelf={editSubmittedSelfAppraisal}
      />
    )
  }

  if (page === 'overview') {
    if (mode === 'manager' && !canUseManagerFlow) {
      return (
        <section className="surface-card section-card">
          <p className="subtle">You do not have access to the overview workspace.</p>
        </section>
      )
    }

    if (mode === 'admin' && !canUseAdminFlow) {
      return (
        <section className="surface-card section-card">
          <p className="subtle">You do not have access to the overview workspace.</p>
        </section>
      )
    }

    if (!reviewLoadState.ready || !employeeWorkspaceReady) {
      const message = reviewLoadState.loading || workspaceLoadState.loading
        ? 'Loading overview…'
        : 'Unable to load overview.'
      const error = reviewLoadState.error || workspaceLoadState.error
      return (
        <section className="surface-card section-card">
          <p className="subtle">{message}</p>
          {error ? <p className="error-text">{error}</p> : null}
        </section>
      )
    }

    if (mode === 'admin') {
      return (
        <CasebookHrOverviewWorkspace
          currentUser={currentUser}
          state={state}
          rolePackLibrary={rolePackLibrary}
          onResolveDesignationSetup={resolveDesignationSetup}
        />
      )
    }

    return (
      <CasebookOverviewWorkspace
        variant="manager"
        currentUser={currentUser}
        employee={employeeRecord}
        selfRecord={selfRecord}
        assignments={employeeAssignments}
        finalResult={finalResult}
        reviewEmployees={reviewEmployees}
        state={state}
      />
    )
  }

  if (page === 'team') {
    if (mode === 'manager' && !canUseManagerFlow) {
      return (
        <section className="surface-card section-card">
          <p className="subtle">You do not have access to the team review workspace.</p>
        </section>
      )
    }

    if (mode === 'admin' && !canUseAdminFlow) {
      return (
        <section className="surface-card section-card">
          <p className="subtle">You do not have access to the team review workspace.</p>
        </section>
      )
    }

    if (!reviewLoadState.ready) {
      return (
        <section className="surface-card section-card">
          <p className="subtle">{reviewLoadState.loading ? 'Loading team review workspace…' : 'Unable to load team review workspace.'}</p>
          {reviewLoadState.error ? <p className="error-text">{reviewLoadState.error}</p> : null}
        </section>
      )
    }

    if (mode === 'manager') {
      return (
        <CasebookManagerWorkspace
          state={state}
          employees={visibleReviewEmployees}
          selectedEmployee={selectedReviewEmployee}
          assignments={selectedReviewAssignments}
          selfRecord={selectedReviewSelfRecord}
          finalResult={selectedReviewFinalResult}
          searchQuery={teamSearchQuery}
          searchLoading={teamSearchLoading}
          onSearchChange={setTeamSearchQuery}
          onSelectEmployee={setSelectedManagedEmployeeId}
          onUpdateAssignment={updateAssignment}
          onUpdateFinalResult={updateFinalResult}
        />
      )
    }

    return (
      <CasebookHrEmployeesWorkspace
        state={state}
        employees={visibleReviewEmployees}
        selectedEmployee={selectedReviewEmployee}
        assignments={selectedReviewAssignments}
        selfRecord={selectedReviewSelfRecord}
        finalResult={selectedReviewFinalResult}
        searchQuery={teamSearchQuery}
        searchLoading={teamSearchLoading}
        onSearchChange={setTeamSearchQuery}
        onSelectEmployee={setSelectedManagedEmployeeId}
        onUpdateFinalResult={updateFinalResult}
      />
    )
  }

  if (page === 'release') {
    if (!canUseAdminFlow || mode !== 'admin') {
      return (
        <section className="surface-card section-card">
          <p className="subtle">You do not have access to the release control workspace.</p>
        </section>
      )
    }

    if (!reviewLoadState.ready) {
      return (
        <section className="surface-card section-card">
          <p className="subtle">{reviewLoadState.loading ? 'Loading release control…' : 'Unable to load release control.'}</p>
          {reviewLoadState.error ? <p className="error-text">{reviewLoadState.error}</p> : null}
        </section>
      )
    }

    return (
      <CasebookHrReleaseWorkspace
        state={state}
        selectedEmployee={selectedReviewEmployee}
        assignments={selectedReviewAssignments}
        selfRecord={selectedReviewSelfRecord}
        finalResult={selectedReviewFinalResult}
        results={visibleReleaseResults}
        searchQuery={releaseSearchQuery}
        searchLoading={releaseSearchLoading}
        onSearchChange={setReleaseSearchQuery}
        onSelectEmployee={setSelectedManagedEmployeeId}
        onUpdateFinalResult={updateFinalResult}
      />
    )
  }

  return (
    <section className="surface-card section-card">
      <p className="subtle">This page is not available for your role.</p>
    </section>
  )
}

export default AppraisalWorkspace
