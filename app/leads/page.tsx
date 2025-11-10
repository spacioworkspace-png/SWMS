import ProtectedRoute from '@/components/ProtectedRoute'
import Leads from '@/components/Leads'

export default function LeadsPage() {
  return (
    <ProtectedRoute>
      <Leads />
    </ProtectedRoute>
  )
}
