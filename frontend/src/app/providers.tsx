import type { PropsWithChildren } from 'react'
import { BrowserAuthProvider } from '../domains/auth/provider'

export function AppProviders({ children }: PropsWithChildren) {
  return <BrowserAuthProvider>{children}</BrowserAuthProvider>
}
