export type Capability = 'employee' | 'manager' | 'admin'

export type AuthState = {
  id: string
  username: string
  displayName: string
  capabilities: Capability[]
  employeeId?: string
  managerScopes: string[]
}

export type LoginPayload = {
  username: string
  password: string
}

export type SessionResponse = {
  id: string
  username: string
  display_name: string
  capabilities: Capability[]
  employee_code: string | null
  manager_scopes: string[]
}

export type LoginResponse = {
  access_token: string
  token_type: string
  user: SessionResponse
}
