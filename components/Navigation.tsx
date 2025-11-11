'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'

export default function Navigation() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  const navItems = [
    { href: '/', label: 'Dashboard' },
    { href: '/spaces', label: 'Spaces' },
    { href: '/customers', label: 'Customers' },
    { href: '/assignments', label: 'Assignments' },
    { href: '/payments', label: 'Payments' },
    { href: '/leads', label: 'Leads' },
  ]

  return (
    <nav className="bg-gradient-to-r from-orange-50 to-white shadow-md border-b border-orange-100 sticky top-0 z-50" role="navigation" aria-label="Primary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left: brand and desktop nav */}
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-md">
                  <span className="text-white font-bold text-lg">S</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-orange-600 to-orange-700 bg-clip-text text-transparent">
                    Spacio Workspace
                  </h1>
                  <p className="text-xs text-gray-500">Management System</p>
                </div>
              </div>
            </div>
            {/* Desktop nav */}
            <div className="hidden sm:ml-8 sm:flex sm:space-x-6">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    pathname === item.href
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md'
                      : 'text-gray-600 hover:bg-orange-50 hover:text-orange-600'
                  }`}
                  aria-current={pathname === item.href ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          {/* Right: user actions */}
          <div className="flex items-center space-x-4">
            {user && (
              <div className="flex items-center space-x-3">
                <span className="text-sm font-semibold text-gray-700">
                  {user.toUpperCase()}
                </span>
                <button
                  onClick={logout}
                  className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 text-sm font-semibold"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Mobile tabs below header */}
        <div className="sm:hidden -mx-4 px-4 overflow-x-auto">
          <div className="flex space-x-2 py-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap inline-flex items-center px-4 py-3 rounded-md text-sm font-semibold border ${
                  pathname === item.href
                    ? 'bg-orange-600 border-orange-600 text-white shadow'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                }`}
                aria-current={pathname === item.href ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}
