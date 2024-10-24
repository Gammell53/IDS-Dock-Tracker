'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    console.log('AuthProvider - Checking token');
    const token = localStorage.getItem('token');
    if (token) {
      console.log('AuthProvider - Token found, setting authenticated');
      setIsAuthenticated(true);
    }
  }, []);

  const login = async (token: string) => {
    console.log('AuthProvider - Login called');
    localStorage.setItem('token', token);
    setIsAuthenticated(true);
  };

  const logout = () => {
    console.log('AuthProvider - Logout called');
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    window.location.href = '/';
  };

  console.log('AuthProvider - Current auth state:', isAuthenticated);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
