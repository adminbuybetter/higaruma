from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    display_name: str
    designation: str | None
    capabilities: list[str]
    employee_code: str | None
    manager_scopes: list[str]


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class EmployeeSummary(BaseModel):
    employee_code: str
    full_name: str
    designation: str
    appraisal_role_name: str | None
    department: str | None
    level: str | None
    line_manager_label: str | None
    reviewer_label: str | None
    kpi_owner_label: str | None
    primary_owner_label: str | None
    can_self_appraise: bool
    status: str
    blockers: list[str]


class AssignmentResponse(BaseModel):
    id: str
    kpi_area: str
    kpi_statement: str
    weight_percent: float
    manager_score: int
    manager_comment: str | None
    evidence_note: str | None
    development_action: str | None
    manager_status: str


class SelfAppraisalItemResponse(BaseModel):
    employee_kpi_assignment_id: str
    self_score: int
    reason_for_score: str | None
    key_evidence: str | None
    challenges_faced: str | None


class SelfAppraisalResponse(BaseModel):
    id: str
    status: str
    overall_achievements: str | None
    major_challenges: str | None
    support_needed: str | None
    development_focus: str | None
    employee_comments: str | None
    submitted_at: str | None
    items: list[SelfAppraisalItemResponse]


class FinalResultResponse(BaseModel):
    id: str
    self_summary: str | None
    manager_summary: str | None
    final_recommendation: str | None
    final_score: float
    performance_band: str
    released_to_employee: bool


class EmployeeWorkspaceResponse(BaseModel):
    cycle_code: str
    cycle_closes_at: str | None
    self_opens_at: str | None
    self_closes_at: str | None
    self_phase_state: str
    manager_opens_at: str | None
    manager_closes_at: str | None
    manager_phase_state: str
    employee: EmployeeSummary
    assignments: list[AssignmentResponse]
    self_appraisal: SelfAppraisalResponse | None
    final_result: FinalResultResponse | None


class WorkspaceCollectionResponse(BaseModel):
    workspaces: list[EmployeeWorkspaceResponse]


class SearchEmployeeCodesResponse(BaseModel):
    employee_codes: list[str]


class RoleKpiEntryRequest(BaseModel):
    kpi_area: str
    kpi_statement: str
    weight_percent: float = Field(ge=0)


class UnresolvedDesignationResponse(BaseModel):
    designation: str
    suggested_appraisal_role: str
    line_manager_label: str
    notes: str


class UnresolvedEmployeeResponse(BaseModel):
    employee_name: str
    designation: str
    employee_id: str
    status: str
    blockers: list[str]


class UnresolvedManagerResponse(BaseModel):
    employee_name: str
    designation: str
    issue: str


class ExcludedDesignationResponse(BaseModel):
    designation: str
    notes: str


class AdminWorkspaceResponse(BaseModel):
    workspaces: list[EmployeeWorkspaceResponse]
    unresolved_designations: list[UnresolvedDesignationResponse]
    unresolved_employees: list[UnresolvedEmployeeResponse]
    unresolved_managers: list[UnresolvedManagerResponse]
    excluded_designations: list[ExcludedDesignationResponse]


class SelfAppraisalItemUpdateRequest(BaseModel):
    employee_kpi_assignment_id: str
    self_score: int = Field(ge=0, le=5)
    reason_for_score: str | None = None
    key_evidence: str | None = None
    challenges_faced: str | None = None


class SelfAppraisalUpdateRequest(BaseModel):
    status: str
    overall_achievements: str | None = None
    major_challenges: str | None = None
    support_needed: str | None = None
    development_focus: str | None = None
    employee_comments: str | None = None
    items: list[SelfAppraisalItemUpdateRequest]


class ManagerAssignmentUpdateRequest(BaseModel):
    manager_score: int | None = Field(default=None, ge=0, le=5)
    manager_comment: str | None = None
    evidence_note: str | None = None
    development_action: str | None = None
    manager_status: str | None = None


class FinalResultUpdateRequest(BaseModel):
    self_summary: str | None = None
    manager_summary: str | None = None
    final_recommendation: str | None = None
    released_to_employee: bool | None = None


class ResolveDesignationSetupRequest(BaseModel):
    designation: str
    role_name: str
    source_role_name: str = ""
    entries: list[RoleKpiEntryRequest] = Field(default_factory=list)
    manager_label: str = ""
    reviewer_label: str = ""
    kpi_owner_label: str = ""
