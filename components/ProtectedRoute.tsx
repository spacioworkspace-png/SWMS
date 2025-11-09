'use client'

import { useEffect } from 'react'
import { useAuth } from './AuthProvider'
import { useRouter } from 'next/navigation'
import Login from './Login'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const router = useRouter()

  if (!isAuthenticated) {
    return <Login />
  }

  return <>{children}</>
}

