import Reports from '@/components/Reports'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function ReportsPage() {
  return (
    <ProtectedRoute>
      <Reports />
    </ProtectedRoute>
  )
}



