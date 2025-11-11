'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Space, SpaceType } from '@/types'
import { useAuth } from './AuthProvider'
import { canEdit, canDelete } from '@/lib/auth'
import { getBillingCycle, formatCurrency } from '@/lib/utils'

export default function Spaces() {
  const { user } = useAuth()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [filteredSpaces, setFilteredSpaces] = useState<Space[]>([])
  const [filterAvailable, setFilterAvailable] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('name_asc')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingSpace, setEditingSpace] = useState<Space | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    type: 'Desk' as SpaceType,
    capacity: '',
    price_per_day: '',
    description: '',
    is_available: true,
  })

  const spaceTypes: SpaceType[] = ['Cabin', 'Desk', 'Meeting Room', 'Virtual Office', 'Day Pass']

  useEffect(() => {
    fetchSpaces()
  }, [])

  // Filter and sort spaces
  useEffect(() => {
    let filtered = [...spaces]

    // Availability filter
    if (filterAvailable) {
      filtered = filtered.filter((s) => s.is_available)
    }

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(searchLower) ||
          s.type.toLowerCase().includes(searchLower) ||
          s.description?.toLowerCase().includes(searchLower)
      )
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter((s) => s.type === typeFilter)
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name)
        case 'name_desc':
          return b.name.localeCompare(a.name)
        case 'price_asc':
          return (a.price_per_day || 0) - (b.price_per_day || 0)
        case 'price_desc':
          return (b.price_per_day || 0) - (a.price_per_day || 0)
        case 'type_asc':
          return a.type.localeCompare(b.type)
        case 'available_first':
          if (a.is_available === b.is_available) return 0
          return a.is_available ? -1 : 1
        default:
          return 0
      }
    })

    setFilteredSpaces(filtered)
  }, [spaces, filterAvailable, searchTerm, typeFilter, sortBy])

  const fetchSpaces = async () => {
    try {
      const { data, error } = await supabase
        .from('spaces')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      const spacesData = data || []
      setSpaces(spacesData)
      setFilteredSpaces(spacesData)
    } catch (error: any) {
      alert('Error fetching spaces: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const spaceData = {
        ...formData,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        price_per_day: parseFloat(formData.price_per_day),
      }

      if (editingSpace) {
        const { error } = await supabase
          .from('spaces')
          .update(spaceData)
          .eq('id', editingSpace.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('spaces').insert([spaceData])
        if (error) throw error
      }

      setShowModal(false)
      setEditingSpace(null)
      resetForm()
      fetchSpaces()
    } catch (error: any) {
      alert('Error saving space: ' + error.message)
    }
  }

  const handleEdit = (space: Space) => {
    setEditingSpace(space)
    setFormData({
      name: space.name,
      type: space.type,
      capacity: space.capacity?.toString() || '',
      price_per_day: space.price_per_day.toString(),
      description: space.description || '',
      is_available: space.is_available,
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this space?')) return

    try {
      const { error } = await supabase.from('spaces').delete().eq('id', id)
      if (error) throw error
      fetchSpaces()
    } catch (error: any) {
      alert('Error deleting space: ' + error.message)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'Desk',
      capacity: '',
      price_per_day: '',
      description: '',
      is_available: true,
    })
  }

  if (loading) {
    return <div className="p-8 text-center animate-pulse">Loading...</div>
  }

  const availableCount = spaces.filter((s) => s.is_available).length
  const occupiedCount = spaces.length - availableCount

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-orange-700 bg-clip-text text-transparent">
            Spaces
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {availableCount} available, {occupiedCount} occupied
          </p>
        </div>
        {canEdit(user) && (
          <button
            onClick={() => {
              setEditingSpace(null)
              resetForm()
              setShowModal(true)
            }}
            className="bg-gradient-to-r from-orange-600 to-orange-700 text-white px-6 py-2 rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all duration-200 hover:scale-105 shadow-md font-semibold flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Space
          </button>
        )}
      </div>

      {/* Search, Filter, and Sort Controls */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-orange-100">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or type..."
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 placeholder:text-gray-400"
            />
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Filter by Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 font-medium"
            >
              <option value="all">All Types</option>
              {spaceTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Availability Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Availability</label>
            <button
              onClick={() => setFilterAvailable(!filterAvailable)}
              className={`w-full px-4 py-2 rounded-lg transition-all duration-200 font-medium ${
                filterAvailable
                  ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-md'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {filterAvailable ? 'Available Only' : 'Show All'}
            </button>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white text-gray-900 font-medium"
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="price_asc">Price (Low to High)</option>
              <option value="price_desc">Price (High to Low)</option>
              <option value="type_asc">Type (A-Z)</option>
              <option value="available_first">Available First</option>
            </select>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            Showing <span className="font-semibold text-blue-700">{filteredSpaces.length}</span> of{' '}
            <span className="font-semibold">{spaces.length}</span> spaces
          </p>
        </div>
      </div>

      <div className="overflow-x-auto shadow-lg rounded-lg">
        <table className="min-w-full bg-white border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Billing</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Capacity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monthly Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredSpaces.map((space) => (
              <tr key={space.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{space.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{space.type}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 capitalize">
                    {getBillingCycle(space.type)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{space.capacity || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">
                  {formatCurrency(space.price_per_day)}/month
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      space.is_available
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {space.is_available ? 'Available' : 'Occupied'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {canEdit(user) && (
                    <button
                      onClick={() => handleEdit(space)}
                      className="text-blue-600 hover:text-blue-900 mr-4 transition-colors font-semibold"
                    >
                      Edit
                    </button>
                  )}
                  {canDelete(user) && (
                    <button
                      onClick={() => handleDelete(space.id)}
                      className="text-red-600 hover:text-red-900 transition-colors font-semibold"
                    >
                      Delete
                    </button>
                  )}
                  {!canEdit(user) && !canDelete(user) && (
                    <span className="text-gray-400 text-xs">View Only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-hidden flex flex-col animate-slide-up">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">{editingSpace ? 'Edit Space' : 'Add New Space'}</h3>
                  <p className="text-blue-100 text-sm mt-1">Configure space details below</p>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false)
                    setEditingSpace(null)
                    resetForm()
                  }}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Form Content */}
            <div className="flex-1 overflow-y-auto p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700">
                      Space Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Cabin A1, Desk 5, Meeting Room 1"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700">
                      Space Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as SpaceType })}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white hover:border-gray-400 font-medium text-gray-900"
                    >
                      {spaceTypes.map((type) => (
                        <option key={type} value={type}>
                          {type} ({getBillingCycle(type)} billing)
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 p-3 bg-orange-50 rounded-lg border border-orange-200">
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Billing Cycle:</span>{' '}
                        <span className="text-orange-700 font-medium capitalize">{getBillingCycle(formData.type)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Capacity</label>
                      <input
                        type="number"
                        value={formData.capacity}
                        onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                        placeholder="Number of people"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        Monthly Price <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={formData.price_per_day}
                        onChange={(e) => setFormData({ ...formData, price_per_day: e.target.value })}
                        placeholder="0.00"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                      />
                      <p className="text-xs text-gray-500">This is the monthly rental price</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-orange-700">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Add any additional details about this space..."
                      className="w-full px-4 py-3 border-2 border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white hover:border-orange-400 resize-none text-orange-900 placeholder:text-orange-400"
                      rows={4}
                    />
                  </div>

                  <div className="flex items-center p-4 bg-orange-50 rounded-lg border-2 border-orange-200">
                    <input
                      type="checkbox"
                      id="is_available"
                      checked={formData.is_available}
                      onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                      className="w-5 h-5 text-orange-600 border-gray-300 rounded focus:ring-orange-500 cursor-pointer"
                    />
                    <label htmlFor="is_available" className="ml-3 text-sm font-semibold text-gray-700 cursor-pointer">
                      Space is currently available
                    </label>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end space-x-4 pt-6 border-t-2 border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false)
                      setEditingSpace(null)
                      resetForm()
                    }}
                    className="px-8 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 hover:scale-105 shadow-lg font-semibold flex items-center"
                  >
                    {editingSpace ? (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Update Space
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create Space
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

