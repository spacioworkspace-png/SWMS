import Spaces from '@/components/Spaces'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function SpacesPage() {
  return (
    <ProtectedRoute>
      <Spaces />
    </ProtectedRoute>
  )
}

