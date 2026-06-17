export type UserKind = 'employee' | 'manager' | 'admin'

export interface AppUser {
  id: string
  username: string
  password: string
  displayName: string
  kind: UserKind
  capabilities: UserKind[]
  employeeId?: string
  managerScopes?: string[]
}

export interface EmployeeRecord {
  employeeId: string
  employeeName: string
  designation: string
  appraisalRole: string
  department: string
  level: string
  employeeUsername: string
  managerLabel: string
  reviewerLabel: string
  kpiOwnerLabel: string
  primaryOwnerLabel: string
  status: 'ready' | 'tentative' | 'blocked'
  blockers: string[]
  excludedThisCycle: boolean
  canSelfAppraise: boolean
  canViewFinalResult: boolean
}

export interface AssignmentRecord {
  assignmentId: string
  cycle: string
  employeeId: string
  employeeName: string
  employeeUsername: string
  jobTitle: string
  department: string
  kpiArea: string
  kpiStatement: string
  weightPercent: number
  managerLabel: string
  reviewerLabel: string
  kpiOwnerLabel: string
  primaryOwnerLabel: string
  score: number
  managerComment: string
  evidenceNote: string
  developmentAction: string
  status: 'pending' | 'in_review' | 'completed'
}

export interface SelfAppraisalRecord {
  employeeId: string
  employeeName: string
  employeeUsername: string
  cycle: string
  kpiEntries: SelfKpiEntry[]
  overallAchievements: string
  majorChallenges: string
  supportNeeded: string
  developmentFocus: string
  employeeComments: string
  status: 'draft' | 'submitted'
}

export interface SelfKpiEntry {
  assignmentId: string
  kpiArea: string
  kpiStatement: string
  selfScore: number
  reasonForScore: string
  keyEvidence: string
  challengesFaced: string
}

export interface FinalResultRecord {
  employeeId: string
  employeeName: string
  employeeUsername: string
  cycle: string
  managerSummary: string
  selfSummary: string
  finalRecommendation: string
  finalScore: number
  performanceBand: string
  releasedToEmployee: boolean
}

export interface UnresolvedDesignation {
  designation: string
  suggestedAppraisalRole: string
  lineManagerLabel: string
  notes: string
}

export interface UnresolvedEmployee {
  employeeName: string
  designation: string
  employeeId: string
  status: string
  blockers: string[]
}

export interface UnresolvedManager {
  employeeName: string
  designation: string
  issue: string
}

export interface ExcludedDesignation {
  designation: string
  notes: string
}

export interface AppState {
  users: AppUser[]
  employees: EmployeeRecord[]
  assignments: AssignmentRecord[]
  selfAppraisals: SelfAppraisalRecord[]
  finalResults: FinalResultRecord[]
  customRolePacks: CustomRolePack[]
  unresolvedDesignations: UnresolvedDesignation[]
  unresolvedEmployees: UnresolvedEmployee[]
  unresolvedManagers: UnresolvedManager[]
  excludedDesignations: ExcludedDesignation[]
}

export interface RoleKpiEntry {
  kpiArea: string
  kpiStatement: string
  weightPercent: number
}

export interface CustomRolePack {
  roleName: string
  sourceRoleName: string
  entries: RoleKpiEntry[]
}
