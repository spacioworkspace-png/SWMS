import Assignments from '@/components/Assignments'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function AssignmentsPage() {
  return (
    <ProtectedRoute>
      <Assignments />
    </ProtectedRoute>
  )
}

