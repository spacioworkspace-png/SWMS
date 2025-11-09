'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { UserRole, authenticateUser } from '@/lib/auth'

interface AuthContextType {
  user: UserRole | null
  login: (username: string, password: string) => boolean
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRole | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    // Check if user is logged in from localStorage
    const savedUser = localStorage.getItem('spacio_user')
    if (savedUser) {
      setUser(savedUser as UserRole)
      setIsAuthenticated(true)
    }
  }, [])

  const login = (username: string, password: string): boolean => {
    const authenticatedUser = authenticateUser(username, password)
    if (authenticatedUser) {
      setUser(authenticatedUser.role)
      setIsAuthenticated(true)
      localStorage.setItem('spacio_user', authenticatedUser.role)
      return true
    }
    return false
  }

  const logout = () => {
    setUser(null)
    setIsAuthenticated(false)
    localStorage.removeItem('spacio_user')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

