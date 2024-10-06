'use client';

import { useAuth } from '@/context/AuthContext'
import LoginPage from './login-page'
import DockTracker from './dock-tracker'

export default function AppContent() {
  const { isAuthenticated } = useAuth()

  return (
    <>
      {isAuthenticated ? <DockTracker /> : <LoginPage />}
    </>
  )
}