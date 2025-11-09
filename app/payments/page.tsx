import Payments from '@/components/Payments'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function PaymentsPage() {
  return (
    <ProtectedRoute>
      <Payments />
    </ProtectedRoute>
  )
}

