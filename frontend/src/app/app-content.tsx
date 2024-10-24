'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext'
import LoginPage from './login-page'
import DockTracker from './dock-tracker'

export default function AppContent() {
  const { isAuthenticated } = useAuth()
  
  useEffect(() => {
    console.log('AppContent - isAuthenticated:', isAuthenticated);
  }, [isAuthenticated]);

  return isAuthenticated ? <DockTracker /> : <LoginPage />;
}
