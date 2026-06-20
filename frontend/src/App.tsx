import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CasebookAdminWorkspace,
  CasebookEmployeeWorkspace,
  CasebookManagerWorkspace,
  CasebookOverviewWorkspace,
} from './casebook/WorkspaceViews'
import { useAuth } from './domains/auth/hooks'
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

function resolveApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (configured) {
    return configured.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://127.0.0.1:8000'
    }
  }

  return 'https://appraisal-backend-staging.up.railway.app'
}

const API_BASE_URL = resolveApiBaseUrl()

interface BackendWorkspaceResponse {
  cycle_code: string
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
  page: 'overview' | 'appraisal' | 'team'
}) {
  const [state, setState] = useState<AppState>(createEmptyState)
  const { authState, sessionPending, logout } = useAuth()
  const [workspaceLoadState, setWorkspaceLoadState] = useState({ loading: false, error: '', ready: false })
  const [reviewLoadState, setReviewLoadState] = useState({ loading: false, error: '', ready: false })
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

  useEffect(() => {
    if (reviewEmployees.length && !reviewEmployees.some((employee) => employee.employeeId === selectedManagedEmployeeId)) {
      setSelectedManagedEmployeeId(reviewEmployees[0].employeeId)
    }
  }, [reviewEmployees, selectedManagedEmployeeId])

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

    fetch(`${API_BASE_URL}/employee/me/workspace`, {
      credentials: 'include',
    })
      .then(async (response) => {
        if (response.status === 401) {
          void logout()
          throw new Error('Session expired.')
        }
        if (!response.ok) {
          throw new Error('Failed to load employee workspace.')
        }
        return (await response.json()) as BackendWorkspaceResponse
      })
      .then((workspace) => {
        if (cancelled) return
        lastSyncedSelfPayloadRef.current = buildSelfPayloadFromWorkspace(workspace)
        setState((current) => mergeEmployeeWorkspaceIntoState(current, workspace, currentUser.username))
        setWorkspaceLoadState({ loading: false, error: '', ready: true })
      })
      .catch((error: unknown) => {
        if (cancelled) return
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

    fetch(`${API_BASE_URL}${endpoint}`, {
      credentials: 'include',
    })
      .then(async (response) => {
        if (response.status === 401) {
          void logout()
          throw new Error('Session expired.')
        }
        if (!response.ok) {
          throw new Error('Failed to load review workspace.')
        }
        return canUseAdminFlow
          ? ((await response.json()) as BackendAdminWorkspaceResponse)
          : ((await response.json()) as BackendWorkspaceCollectionResponse)
      })
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
    if (selfRecord.status !== 'draft') {
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
          const response = await fetch(`${API_BASE_URL}/employee/me/self-appraisal`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: payload,
          })
          if (response.status === 401) {
            void logout()
            throw new Error('Session expired.')
          }
          if (!response.ok) {
            throw new Error('Failed to autosave self appraisal draft.')
          }
          const workspace = (await response.json()) as BackendWorkspaceResponse
          lastSyncedSelfPayloadRef.current = buildSelfPayloadFromWorkspace(workspace)
          setState((current) => mergeEmployeeWorkspaceIntoState(current, workspace, currentUser.username))
          setWorkspaceLoadState((current) => ({ ...current, error: '' }))
        } catch (error: unknown) {
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

  async function submitSelfAppraisal(employeeId: string) {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    updateSelfAppraisal(employeeId, { status: 'submitted' })
    if (!currentUser || currentUser.employeeId !== employeeId || !canUseEmployeeFlow) {
      return
    }

    const record = state.selfAppraisals.find((item) => item.employeeId === employeeId)
    if (!record) return
    const assignmentsForEmployee = state.assignments.filter((assignment) => assignment.employeeId === employeeId)

    setWorkspaceLoadState((current) => ({ ...current, loading: true, error: '' }))

    try {
      const response = await fetch(`${API_BASE_URL}/employee/me/self-appraisal`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(
          buildSelfAppraisalPayload(
            {
              ...record,
              status: 'submitted',
            },
            assignmentsForEmployee,
          ),
        ),
      })
      if (response.status === 401) {
        void logout()
        throw new Error('Session expired.')
      }
      if (!response.ok) {
        throw new Error('Failed to submit self appraisal.')
      }
      const workspace = (await response.json()) as BackendWorkspaceResponse
      lastSyncedSelfPayloadRef.current = buildSelfPayloadFromWorkspace(workspace)
      setState((current) => mergeEmployeeWorkspaceIntoState(current, workspace, currentUser.username))
      setWorkspaceLoadState({ loading: false, error: '', ready: true })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to submit self appraisal.'
      setWorkspaceLoadState((current) => ({ ...current, error: message }))
    }
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
        const response = await fetch(`${API_BASE_URL}/manager/assignments/${assignmentId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(toBackendAssignmentPatch(patch)),
        })
        if (response.status === 401) {
          void logout()
          throw new Error('Session expired.')
        }
        if (!response.ok) {
          throw new Error('Failed to save manager review update.')
        }
        const workspace = (await response.json()) as BackendWorkspaceResponse
        setState((current) => mergeWorkspacesIntoState(current, [workspace]))
      } catch {
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
      ? `${API_BASE_URL}/admin/final-results/${employeeId}`
      : `${API_BASE_URL}/manager/final-results/${employeeId}`

    void (async () => {
      try {
        const response = await fetch(endpoint, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(toBackendFinalResultPatch(patch)),
        })
        if (response.status === 401) {
          void logout()
          throw new Error('Session expired.')
        }
        if (!response.ok) {
          throw new Error('Failed to save final result update.')
        }
        const workspace = (await response.json()) as BackendWorkspaceResponse
        setState((current) => mergeWorkspacesIntoState(current, [workspace]))
      } catch {
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
          const response = await fetch(`${API_BASE_URL}/admin/designation-mappings/resolve`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
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
          if (response.status === 401) {
            void logout()
            throw new Error('Session expired.')
          }
          if (!response.ok) {
            throw new Error('Failed to save designation setup.')
          }
          const payload = (await response.json()) as BackendAdminWorkspaceResponse
          setState((current) => mergeAdminWorkspaceIntoState(current, payload))
        } catch {
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

  function resetAppraisalData() {
    lastSyncedSelfPayloadRef.current = null
    setState(createEmptyState())
    setSelectedManagedEmployeeId(null)
    setWorkspaceLoadState({ loading: false, error: '', ready: false })
    setReviewLoadState({ loading: false, error: '', ready: false })
    setReloadNonce((current) => current + 1)
  }

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
        onUpdateSelf={updateSelfAppraisal}
        onUpdateSelfKpiEntry={updateSelfKpiEntry}
        onSubmitSelf={submitSelfAppraisal}
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

    return (
      <CasebookOverviewWorkspace
        variant={mode as 'manager' | 'admin'}
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
          employees={reviewEmployees}
          selectedEmployee={selectedReviewEmployee}
          assignments={selectedReviewAssignments}
          selfRecord={selectedReviewSelfRecord}
          finalResult={selectedReviewFinalResult}
          onSelectEmployee={setSelectedManagedEmployeeId}
          onUpdateAssignment={updateAssignment}
          onUpdateFinalResult={updateFinalResult}
        />
      )
    }

    return (
      <CasebookAdminWorkspace
        state={state}
        rolePackLibrary={rolePackLibrary}
        employees={reviewEmployees}
        selectedEmployee={selectedReviewEmployee}
        assignments={selectedReviewAssignments}
        selfRecord={selectedReviewSelfRecord}
        finalResult={selectedReviewFinalResult}
        onSelectEmployee={setSelectedManagedEmployeeId}
        onUpdateAssignment={updateAssignment}
        onUpdateFinalResult={updateFinalResult}
        onResolveDesignationSetup={resolveDesignationSetup}
        onReset={resetAppraisalData}
      />
    )
  }

  return (
    <section className="surface-card section-card">
      <p className="subtle">This page is not available for your role.</p>
    </section>
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
        <div className="login-layout">
          <div className="login-copy">
            <span className="eyebrow">Performance reviews</span>
            <h1>BuyBetter appraisal</h1>
            <p className="lede">
              Sign in to complete self appraisal, manager review, and final result release.
            </p>
            <div className="login-note">
              <strong>What you can do here</strong>
              <p>
                Employees complete self-appraisal first, appraisal owners review next, and HR controls final release.
              </p>
            </div>
          </div>

          <form className="auth-form login-form-panel" onSubmit={handleLogin}>
            <div className="login-form-intro">
              <span className="eyebrow">Secure sign in</span>
              <p className="subtle">Use the username and password assigned to you for this review cycle.</p>
            </div>
            <label className="auth-field">
              <span>Username</span>
              <input
                value={loginState.username}
                onChange={(event) =>
                  setLoginState((current) => ({ ...current, username: event.target.value, error: '' }))
                }
                placeholder="first.last"
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <input
                type="password"
                value={loginState.password}
                onChange={(event) =>
                  setLoginState((current) => ({ ...current, password: event.target.value, error: '' }))
                }
                placeholder="Assigned password"
              />
            </label>
            <button className="button primary login-submit" type="submit">Sign in</button>
            {loginState.error ? <p className="error-text">{loginState.error}</p> : null}
          </form>
        </div>
      </section>
    </div>
  )
}

function EmployeeWorkspace({
  employee,
  selfRecord,
  assignments,
  finalResult,
  workspaceLoading,
  workspaceError,
  onUpdateSelf,
  onUpdateSelfKpiEntry,
  onSubmitSelf,
}: {
  employee: EmployeeRecord
  selfRecord: SelfAppraisalRecord
  assignments: AssignmentRecord[]
  finalResult: FinalResultRecord
  workspaceLoading: boolean
  workspaceError: string
  onUpdateSelf: (employeeId: string, patch: Partial<SelfAppraisalRecord>) => void
  onUpdateSelfKpiEntry: (employeeId: string, assignmentId: string, patch: Partial<SelfKpiEntry>) => void
  onSubmitSelf: (employeeId: string) => void
}) {
  const [selfPanelOpen, setSelfPanelOpen] = useState(false)
  const [currentSelfStep, setCurrentSelfStep] = useState(0)
  const totalSelfSteps = selfRecord.kpiEntries.length + 1
  const currentEntry =
    currentSelfStep < selfRecord.kpiEntries.length ? selfRecord.kpiEntries[currentSelfStep] : null
  const isOverallStep = currentSelfStep === selfRecord.kpiEntries.length

  useEffect(() => {
    if (!selfPanelOpen) return
    setCurrentSelfStep((current) => Math.min(current, totalSelfSteps - 1))
  }, [selfPanelOpen, totalSelfSteps])

  function openSelfPanel() {
    setCurrentSelfStep(0)
    setSelfPanelOpen(true)
  }

  function closeSelfPanel() {
    setSelfPanelOpen(false)
  }

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
                  <strong>Appraisal blockers</strong>
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
            <button className="button" onClick={openSelfPanel}>
              Open self appraisal
            </button>
          </div>
          {workspaceLoading ? <p className="subtle">Refreshing your appraisal workspace…</p> : null}
          {workspaceError ? <p className="error-text">{workspaceError}</p> : null}
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
        <div className="drawer-backdrop" onClick={closeSelfPanel}>
          <aside className="drawer-panel" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <div>
                <div className="eyebrow">Self appraisal</div>
                <h2>{isOverallStep ? 'Complete your overall reflection' : 'Score one appraisal area at a time'}</h2>
              </div>
              <button className="button subtle-button" onClick={closeSelfPanel}>
                Close
              </button>
            </div>
            <div className="stack">
              <div className="employee-details-card">
                <div className="detail-grid compact">
                  <DetailItem label="Name" value={employee.employeeName} />
                  <DetailItem label="Role / department" value={`${employee.designation} · ${employee.department}`} />
                  <DetailItem label="Review period" value={selfRecord.cycle} />
                  <DetailItem label="Manager" value={employee.primaryOwnerLabel || 'Not mapped'} />
                </div>
              </div>

              <section className="score-legend-card">
                <div className="eyebrow">Score guide</div>
                <div className="score-legend-grid">
                  <div className="score-legend-item"><strong>1</strong><span>Far below expectation</span></div>
                  <div className="score-legend-item"><strong>2</strong><span>Below expectation</span></div>
                  <div className="score-legend-item"><strong>3</strong><span>Meets expectation</span></div>
                  <div className="score-legend-item"><strong>4</strong><span>Above expectation</span></div>
                  <div className="score-legend-item"><strong>5</strong><span>Exceptional</span></div>
                </div>
              </section>

              {!isOverallStep && currentEntry ? (
                <article className="kpi-card self-kpi-card self-kpi-focus-card">
                  <div className="self-kpi-prompt">
                    <div>
                      <div className="self-step-meta">
                        <span className="step-count">Step {currentSelfStep + 1} of {totalSelfSteps}</span>
                        <span className="step-type">Scored area</span>
                      </div>
                      <h3>{currentEntry.kpiArea}</h3>
                    </div>
                    <label className="score-field score-field-highlight">
                      <span>Self-score</span>
                      <select
                        value={currentEntry.selfScore}
                        onChange={(event) =>
                          onUpdateSelfKpiEntry(employee.employeeId, currentEntry.assignmentId, {
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
                  <div className="question-card">
                    <div className="eyebrow">Question</div>
                    <p>{currentEntry.kpiStatement}</p>
                  </div>
                  <div className="stack tight">
                    <TextAreaField
                      label="Reason for score"
                      value={currentEntry.reasonForScore}
                      onChange={(value) =>
                        onUpdateSelfKpiEntry(employee.employeeId, currentEntry.assignmentId, {
                          reasonForScore: value,
                        })
                      }
                    />
                    <TextAreaField
                      label="Key achievements / evidence"
                      value={currentEntry.keyEvidence}
                      onChange={(value) =>
                        onUpdateSelfKpiEntry(employee.employeeId, currentEntry.assignmentId, {
                          keyEvidence: value,
                        })
                      }
                    />
                    <TextAreaField
                      label="Challenges faced"
                      value={currentEntry.challengesFaced}
                      onChange={(value) =>
                        onUpdateSelfKpiEntry(employee.employeeId, currentEntry.assignmentId, {
                          challengesFaced: value,
                        })
                      }
                    />
                  </div>
                </article>
              ) : (
                <section className="overall-reflection-card">
                  <div className="self-step-meta">
                    <span className="step-count">Step {totalSelfSteps} of {totalSelfSteps}</span>
                    <span className="step-type">Overall reflection</span>
                  </div>
                  <h3>Overall reflection</h3>
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
              )}
            </div>
            <div className="button-row drawer-actions drawer-actions-split">
              <div className="button-row">
                <button
                  className="button"
                  onClick={() => setCurrentSelfStep((current) => Math.max(0, current - 1))}
                  disabled={currentSelfStep === 0}
                >
                  Back
                </button>
                {!isOverallStep ? (
                  <button
                    className="button primary"
                    onClick={() => setCurrentSelfStep((current) => Math.min(totalSelfSteps - 1, current + 1))}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    className="button primary"
                    onClick={() => onSubmitSelf(employee.employeeId)}
                  >
                    Mark self appraisal submitted
                  </button>
                )}
              </div>
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
  const reviewedReports = employees.filter((employee) => employee.status === 'ready').length

  return (
    <main className="employee-shell">
      <div className="employee-top-grid">
        <div className="employee-left-stack">
          <StepStrip mode="manager" employeeRecord={selectedEmployee} finalResult={finalResult} />

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
        </div>

        <aside className="surface-card summary-card employee-summary-card dashboard-summary-card">
          <div className="summary-label">Review overview</div>
          <div className="summary-figure slim">
            {selectedEmployee ? selectedEmployee.employeeName : `${employees.length} reports`}
          </div>
          <div className="summary-subtitle">
            {selectedEmployee ? selectedEmployee.designation : 'Select a direct report to start reviewing.'}
          </div>
          <div className="summary-gap" aria-hidden="true" />
          <div className="summary-metrics">
            <Metric label="Reports" value={`${employees.length}`} compact />
            <Metric label="Ready" value={`${reviewedReports}`} compact />
            <Metric label="KPI rows" value={`${assignments.length}`} compact />
            <Metric label="Band" value={finalResult?.performanceBand ?? 'Not rated'} compact />
          </div>
        </aside>
      </div>

      <section className="surface-card section-card full-width-card">
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
          <section className="surface-card section-card full-width-card">
            <div className="section-head">
              <div>
                <div className="eyebrow">Employee summary</div>
                <h2>{selectedEmployee.employeeName}</h2>
              </div>
            </div>
            <p className="subtle">
              {selectedEmployee.designation} · {selectedEmployee.appraisalRole || 'Role mapping pending'}
            </p>
            {selfRecord ? (
              <TextBlock
                title="Employee self summary"
                value={selfRecord.overallAchievements || 'No self summary yet.'}
              />
            ) : null}
            {!selfSubmitted ? (
              <div className="warning-box small">
                <strong>Waiting on self appraisal</strong>
                <p>Manager review unlocks only after the employee submits their self appraisal.</p>
              </div>
            ) : null}
          </section>

          <section className="surface-card section-card full-width-card">
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
            <section className="surface-card section-card full-width-card">
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
        <section className="surface-card section-card full-width-card">
          <p className="subtle">No direct reports assigned to this appraisal owner account yet.</p>
        </section>
      )}
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
    <main className="employee-shell">
      <div className="employee-top-grid">
        <div className="employee-left-stack">
          <StepStrip mode="admin" employeeRecord={null} finalResult={null} />

          <section className="surface-card hero-section">
            <div className="section-head">
              <div>
                <div className="eyebrow">HR console</div>
                <h2>Appraisal control centre</h2>
              </div>
            </div>
            <p className="subtle">
              Resolve designation gaps, monitor self and manager review progress, then control final result release.
            </p>
          </section>
        </div>

        <aside className="surface-card summary-card employee-summary-card dashboard-summary-card">
          <div className="summary-label">Cycle overview</div>
          <div className="summary-figure slim">{activeEmployees.length} staff</div>
          <div className="summary-subtitle">Only active employees in this appraisal cycle are included here.</div>
          <div className="summary-gap" aria-hidden="true" />
          <div className="summary-metrics">
            <Metric label="Unresolved" value={`${unresolvedKpiCount}`} compact />
            <Metric label="Blocked" value={`${blockedEmployees}`} compact />
            <Metric label="Submitted" value={`${selfSubmittedCount}`} compact />
            <Metric label="Released" value={`${releasedCount}`} compact />
          </div>
        </aside>
      </div>

      <section className={`surface-card section-card full-width-card ${unresolvedKpiCount ? 'alert-card' : ''}`}>
        <div className="section-head">
          <div>
            <div className="eyebrow">HR action required</div>
            <h2>Missing KPI mappings still block part of the cycle</h2>
          </div>
          <span className="pill status-blocked">{unresolvedKpiCount} unresolved</span>
        </div>
        <p className="subtle">
          These unresolved designation-to-KPI mappings need HR or leadership decisions before those staff can be fully appraised.
        </p>
        <div className="tag-cloud">
          {state.unresolvedDesignations.map((item) => (
            <span key={item.designation} className="pill issue-pill">
              {item.designation}
            </span>
          ))}
        </div>
      </section>

      <section className="surface-card section-card full-width-card">
        <div className="section-head">
          <div>
            <div className="eyebrow">HR overview</div>
            <h2>Appraisal status</h2>
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
                'appraisal-export.json',
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
            Reset appraisal data
          </button>
        </div>
      </section>

      <section className="surface-card section-card full-width-card">
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

      <section className="surface-card section-card full-width-card">
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

      <section className="surface-card section-card full-width-card">
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

      <section className="surface-card section-card full-width-card">
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

      <section className="surface-card section-card full-width-card">
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

export default AppraisalWorkspace
