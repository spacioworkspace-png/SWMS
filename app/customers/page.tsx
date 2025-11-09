import Customers from '@/components/Customers'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function CustomersPage() {
  return (
    <ProtectedRoute>
      <Customers />
    </ProtectedRoute>
  )
}

