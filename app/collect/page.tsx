import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function CollectPage() {
  const cards = [
    {
      href: '/quick-add?tab=pending',
      title: 'Pending Rent (This Month)',
      desc: 'See who has not paid this month and collect now.',
      c1: 'from-orange-500',
      c2: 'to-orange-600',
      badge: 'Rent',
    },
    {
      href: '/payments?manual=1&type=daypass&redirect=collect',
      title: 'Day Pass Entry',
      desc: 'Open the Day Pass form directly.',
      c1: 'from-emerald-500',
      c2: 'to-emerald-600',
      badge: 'Day Pass',
    },
  ]

  return (
    <ProtectedRoute>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Collect</h1>
          <p className="text-sm text-gray-600">Two simple options.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {cards.map((c) => (
            <Link key={c.title} href={c.href} className="group">
              <div className="relative h-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className={`absolute -top-3 left-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${c.c1} ${c.c2} px-3 py-1 text-xs font-semibold text-white shadow`}>{c.badge}</div>
                <div className="mt-2">
                  <h2 className="text-lg font-bold text-gray-900 group-hover:text-orange-700 transition-colors">{c.title}</h2>
                  <p className="mt-2 text-sm text-gray-600">{c.desc}</p>
                </div>
                <div className="mt-4 inline-flex items-center text-sm font-semibold text-orange-700 group-hover:underline">
                  Go
                  <svg className="ml-1 h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 11-1.414-1.414L13.586 10H4a1 1 0 110-2h9.586l-3.293-3.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </ProtectedRoute>
  )
}
