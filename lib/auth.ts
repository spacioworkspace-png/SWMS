'use client'

export type UserRole = 'shan' | 'appa'

export interface User {
  username: string
  role: UserRole
  password: string
}

export const users: User[] = [
  {
    username: 'SHAN',
    role: 'shan',
    password: 'SPACIO',
  },
  {
    username: 'APPA',
    role: 'appa',
    password: 'SPACIO', // Same password for both
  },
]

export function authenticateUser(username: string, password: string): User | null {
  const user = users.find(
    (u) => u.username.toUpperCase() === username.toUpperCase() && u.password === password
  )
  return user || null
}

export function canEdit(user: UserRole | null): boolean {
  return user === 'shan'
}

export function canDelete(user: UserRole | null): boolean {
  return user === 'shan'
}

