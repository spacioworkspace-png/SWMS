'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Assignment, Customer, Space } from '@/types'
import { getBillingCycle, formatCurrency, formatDate } from '@/lib/utils'
import { useAuth } from './AuthProvider'
import { canEdit, canDelete } from '@/lib/auth'

export default function Assignments() {
  const { user } = useAuth()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [filteredAssignments, setFilteredAssignments] = useState<Assignment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [availableSpaces, setAvailableSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null)
  const [viewingAssignment, setViewingAssignment] = useState<Assignment | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [rentStatusFilter, setRentStatusFilter] = useState<string>('all') // New filter for rent status
  const [sortBy, setSortBy] = useState<string>('date_desc')
  const [formData, setFormData] = useState({
    customer_id: '',
    space_id: '',
    start_date: '',
    end_date: '',
    status: 'active',
    security_deposit: '',
    monthly_price: '',
    agreement_pdf_url: '',
    agreement_expiry_date: '',
    includes_gst: false,
    payment_destination: '',
    notes: '',
  })

  const destinationOptions = [
    'APPA 316',
    'APPA CANARA',
    'DADDY FEDERAL',
    'SHAN SAVINGS',
    'SPACIO CURRENT',
    'Cash',
  ]

  useEffect(() => {
    fetchData()
  }, [])

  // Filter and sort assignments
  useEffect(() => {
    let filtered = [...assignments]

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter((assignment) => {
        const customer = assignment.customer as Customer
        const space = assignment.space as Space
        const customerName = customer?.first_name && customer?.last_name
          ? `${customer.first_name} ${customer.last_name}`
          : customer?.name || ''
        const spaceName = space?.name || ''
        const searchLower = searchTerm.toLowerCase()
        return (
          customerName.toLowerCase().includes(searchLower) ||
          spaceName.toLowerCase().includes(searchLower) ||
          space?.type?.toLowerCase().includes(searchLower)
        )
      })
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((assignment) => assignment.status === statusFilter)
    }

    // Rent status filter (pending/received) - only applies to active assignments
    if (rentStatusFilter !== 'all') {
      filtered = filtered.filter((assignment: any) => {
        // Only filter active assignments by rent status
        if (assignment.status !== 'active') {
          // For non-active assignments, don't show when filtering by rent status
          return false
        }
        return assignment.rentStatus === rentStatusFilter
      })
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc':
          return new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
        case 'date_asc':
          return new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        case 'customer_asc':
          const aName = (a.customer as Customer)?.first_name && (a.customer as Customer)?.last_name
            ? `${(a.customer as Customer).first_name} ${(a.customer as Customer).last_name}`
            : (a.customer as Customer)?.name || ''
          const bName = (b.customer as Customer)?.first_name && (b.customer as Customer)?.last_name
            ? `${(b.customer as Customer).first_name} ${(b.customer as Customer).last_name}`
            : (b.customer as Customer)?.name || ''
          return aName.localeCompare(bName)
        case 'space_asc':
          const aSpace = (a.space as Space)?.name || ''
          const bSpace = (b.space as Space)?.name || ''
          return aSpace.localeCompare(bSpace)
        case 'price_desc':
          return (b.monthly_price || 0) - (a.monthly_price || 0)
        case 'price_asc':
          return (a.monthly_price || 0) - (b.monthly_price || 0)
        case 'rent_pending_first':
          // Sort by rent status: pending first, then received, then N/A
          const aRentStatus = (a as any).rentStatus || (a.status === 'active' ? 'pending' : 'na')
          const bRentStatus = (b as any).rentStatus || (b.status === 'active' ? 'pending' : 'na')
          if (aRentStatus === 'pending' && bRentStatus !== 'pending') return -1
          if (aRentStatus !== 'pending' && bRentStatus === 'pending') return 1
          if (aRentStatus === 'received' && bRentStatus === 'na') return -1
          if (aRentStatus === 'na' && bRentStatus === 'received') return 1
          return 0
        default:
          return 0
      }
    })

    setFilteredAssignments(filtered)
  }, [assignments, searchTerm, statusFilter, rentStatusFilter, sortBy])

  const fetchData = async () => {
    try {
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const startOfMonth = `${currentMonth}-01`

      // Fetch assignments with related data
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('assignments')
        .select(`
          *,
          customer:customers(*),
          space:spaces(*)
        `)
        .order('created_at', { ascending: false })

      if (assignmentsError) throw assignmentsError

      // Fetch payments for current month to check rent status
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('assignment_id, payment_for_date')
        .gte('payment_for_date', startOfMonth)
        .lt('payment_for_date', `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`)

      // Create a map of assignments with payments for current month
      const assignmentsWithPayments = new Set(
        paymentsData?.map((p) => p.assignment_id).filter((id) => id) || []
      )

      // Add rent status to assignments
      const assignmentsList = (assignmentsData || []).map((assignment) => ({
        ...assignment,
        rentStatus: assignmentsWithPayments.has(assignment.id) ? 'received' : 'pending',
      }))

      // Fetch customers and spaces for dropdowns
      const [customersResult, spacesResult] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase.from('spaces').select('*').order('name'),
      ])

      if (customersResult.error) throw customersResult.error
      if (spacesResult.error) throw spacesResult.error

      setAssignments(assignmentsList)
      setFilteredAssignments(assignmentsList)
      setCustomers(customersResult.data || [])
      setSpaces(spacesResult.data || [])
      // Filter available spaces (only when creating new assignment)
      setAvailableSpaces(spacesResult.data?.filter((s) => s.is_available) || [])
    } catch (error: any) {
      alert('Error fetching data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const calculateRenewalDate = (startDate: string): string => {
    const date = new Date(startDate)
    date.setMonth(date.getMonth() + 11)
    return date.toISOString().split('T')[0]
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const renewalDate = formData.start_date ? calculateRenewalDate(formData.start_date) : null
      
      const assignmentData = {
        customer_id: formData.customer_id,
        space_id: formData.space_id,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        status: formData.status,
        security_deposit: parseFloat(formData.security_deposit) || 0,
        monthly_price: parseFloat(formData.monthly_price) || null,
        agreement_pdf_url: formData.agreement_pdf_url || null,
        agreement_expiry_date: formData.agreement_expiry_date || null,
        includes_gst: formData.includes_gst,
        payment_destination: formData.payment_destination || null,
        renewal_date: renewalDate,
        notes: formData.notes || null,
      }

      if (editingAssignment) {
        // Check if space_id changed
        const oldSpaceId = editingAssignment.space_id
        const newSpaceId = formData.space_id
        
        const { error } = await supabase
          .from('assignments')
          .update(assignmentData)
          .eq('id', editingAssignment.id)

        if (error) throw error

        // If space changed, update availability
        if (oldSpaceId !== newSpaceId) {
          // Mark old space as available
          await supabase
            .from('spaces')
            .update({ is_available: true })
            .eq('id', oldSpaceId)

          // Mark new space as occupied if status is active
          if (formData.status === 'active') {
            await supabase
              .from('spaces')
              .update({ is_available: false })
              .eq('id', newSpaceId)
          }
        } else if (formData.status === 'active') {
          // If same space but status is active, ensure it's marked as occupied
          await supabase
            .from('spaces')
            .update({ is_available: false })
            .eq('id', newSpaceId)
        } else if (formData.status !== 'active') {
          // If status changed to inactive/completed, mark space as available
          await supabase
            .from('spaces')
            .update({ is_available: true })
            .eq('id', newSpaceId)
        }
      } else {
        const { error } = await supabase.from('assignments').insert([assignmentData])
        if (error) throw error

        // Mark space as occupied if status is active
        if (formData.status === 'active') {
          await supabase
            .from('spaces')
            .update({ is_available: false })
            .eq('id', formData.space_id)
        }
      }

      setShowModal(false)
      setEditingAssignment(null)
      resetForm()
      fetchData()
    } catch (error: any) {
      alert('Error saving assignment: ' + error.message)
    }
  }

  const handleEdit = (assignment: Assignment) => {
    setEditingAssignment(assignment)
    setFormData({
      customer_id: assignment.customer_id,
      space_id: assignment.space_id,
      start_date: assignment.start_date,
      end_date: assignment.end_date || '',
      status: assignment.status,
      security_deposit: (assignment.security_deposit || 0).toString(),
      monthly_price: (assignment.monthly_price || '').toString(),
      agreement_pdf_url: assignment.agreement_pdf_url || '',
      agreement_expiry_date: assignment.agreement_expiry_date || '',
      includes_gst: (assignment as any).includes_gst || false,
      payment_destination: (assignment as any).payment_destination || '',
      notes: assignment.notes || '',
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this assignment?')) return

    try {
      const { error } = await supabase.from('assignments').delete().eq('id', id)
      if (error) throw error
      fetchData()
    } catch (error: any) {
      alert('Error deleting assignment: ' + error.message)
    }
  }

  const resetForm = () => {
    setFormData({
      customer_id: '',
      space_id: '',
      start_date: '',
      end_date: '',
      status: 'active',
      security_deposit: '',
      monthly_price: '',
      agreement_pdf_url: '',
      agreement_expiry_date: '',
      includes_gst: false,
      payment_destination: '',
      notes: '',
    })
  }

  const calculateGST = (amount: number) => {
    return amount * 0.18
  }

  const selectedCustomer = customers.find((c) => c.id === formData.customer_id)
  const monthlyPriceNum = parseFloat(formData.monthly_price) || 0
  const gstAmount = formData.includes_gst ? calculateGST(monthlyPriceNum) : 0
  const totalWithGST = monthlyPriceNum + gstAmount

  const selectedSpace = spaces.find((s) => s.id === formData.space_id)
  const spacesToShow = editingAssignment ? spaces : availableSpaces

  // Filter and sort assignments
  useEffect(() => {
    let filtered = [...assignments]

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter((assignment) => {
        const customer = assignment.customer as Customer
        const space = assignment.space as Space
        const customerName = customer?.first_name && customer?.last_name
          ? `${customer.first_name} ${customer.last_name}`
          : customer?.name || ''
        const spaceName = space?.name || ''
        const searchLower = searchTerm.toLowerCase()
        return (
          customerName.toLowerCase().includes(searchLower) ||
          spaceName.toLowerCase().includes(searchLower) ||
          space?.type?.toLowerCase().includes(searchLower)
        )
      })
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((assignment) => assignment.status === statusFilter)
    }

    // Rent status filter (pending/received) - only applies to active assignments
    if (rentStatusFilter !== 'all') {
      filtered = filtered.filter((assignment: any) => {
        // Only filter active assignments by rent status
        if (assignment.status !== 'active') {
          // For non-active assignments, don't show when filtering by rent status
          return false
        }
        return assignment.rentStatus === rentStatusFilter
      })
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc':
          return new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
        case 'date_asc':
          return new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        case 'customer_asc':
          const aName = (a.customer as Customer)?.first_name && (a.customer as Customer)?.last_name
            ? `${(a.customer as Customer).first_name} ${(a.customer as Customer).last_name}`
            : (a.customer as Customer)?.name || ''
          const bName = (b.customer as Customer)?.first_name && (b.customer as Customer)?.last_name
            ? `${(b.customer as Customer).first_name} ${(b.customer as Customer).last_name}`
            : (b.customer as Customer)?.name || ''
          return aName.localeCompare(bName)
        case 'space_asc':
          const aSpace = (a.space as Space)?.name || ''
          const bSpace = (b.space as Space)?.name || ''
          return aSpace.localeCompare(bSpace)
        case 'price_desc':
          return (b.monthly_price || 0) - (a.monthly_price || 0)
        case 'price_asc':
          return (a.monthly_price || 0) - (b.monthly_price || 0)
        case 'rent_pending_first':
          // Sort by rent status: pending first, then received, then N/A
          const aRentStatus = (a as any).rentStatus || (a.status === 'active' ? 'pending' : 'na')
          const bRentStatus = (b as any).rentStatus || (b.status === 'active' ? 'pending' : 'na')
          if (aRentStatus === 'pending' && bRentStatus !== 'pending') return -1
          if (aRentStatus !== 'pending' && bRentStatus === 'pending') return 1
          if (aRentStatus === 'received' && bRentStatus === 'na') return -1
          if (aRentStatus === 'na' && bRentStatus === 'received') return 1
          return 0
        default:
          return 0
      }
    })

    setFilteredAssignments(filtered)
  }, [assignments, searchTerm, statusFilter, rentStatusFilter, sortBy])

  if (loading) {
    return <div className="p-8 text-center animate-pulse">Loading...</div>
  }

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-700 bg-clip-text text-transparent">
            Assignments
          </h2>
          <p className="text-sm text-gray-500 mt-1">Manage space assignments and renewals</p>
        </div>
        {canEdit(user) && (
          <button
            onClick={() => {
              setEditingAssignment(null)
            resetForm()
            setShowModal(true)
          }}
          className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-2 rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all duration-200 hover:scale-105 shadow-md font-semibold flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
            Add Assignment
          </button>
        )}
      </div>

      {/* Search, Filter, and Sort Controls */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-purple-100">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by customer or space..."
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-gray-900 placeholder:text-gray-400"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Filter by Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-gray-900 font-medium"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Rent Status Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Filter by Rent Status</label>
            <select
              value={rentStatusFilter}
              onChange={(e) => setRentStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-gray-900 font-medium"
            >
              <option value="all">All Rent Status</option>
              <option value="pending">Pending Rent</option>
              <option value="received">Rent Received</option>
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-gray-900 font-medium"
            >
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="customer_asc">Customer (A-Z)</option>
              <option value="space_asc">Space (A-Z)</option>
              <option value="price_desc">Price (High to Low)</option>
              <option value="price_asc">Price (Low to High)</option>
              <option value="rent_pending_first">Rent Pending First</option>
            </select>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            Showing <span className="font-semibold text-purple-700">{filteredAssignments.length}</span> of{' '}
            <span className="font-semibold">{assignments.length}</span> assignments
          </p>
        </div>
      </div>

      <div className="overflow-x-auto shadow-lg rounded-lg">
        <table className="min-w-full bg-white border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Space</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Billing</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Renewal Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">End Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monthly Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GST</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Security Deposit</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment Destination</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rent Status (This Month)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredAssignments.map((assignment) => {
              const customer = assignment.customer as Customer
              const space = assignment.space as Space
              const billingCycle = space ? getBillingCycle(space.type) : 'monthly'
              return (
                <tr key={assignment.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {customer?.first_name && customer?.last_name
                      ? `${customer.first_name} ${customer.last_name}`
                      : customer?.name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {space?.name || '-'} ({space?.type || '-'})
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 capitalize">
                      {billingCycle}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(assignment.start_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-700 font-semibold">
                    {(() => {
                      const renewalDate = (assignment as any).renewal_date || 
                        (assignment.start_date ? (() => {
                          const date = new Date(assignment.start_date)
                          date.setMonth(date.getMonth() + 11)
                          return date.toISOString().split('T')[0]
                        })() : null)
                      return renewalDate ? formatDate(renewalDate) : '-'
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {assignment.end_date ? formatDate(assignment.end_date) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">
                    {assignment.monthly_price ? formatCurrency(assignment.monthly_price) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(assignment as any).includes_gst ? (
                      <span className="text-green-700 font-semibold">
                        {formatCurrency(assignment.monthly_price ? assignment.monthly_price * 0.18 : 0)} (18%)
                      </span>
                    ) : (
                      <span className="text-gray-500">₹0.00</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-purple-700">
                    {assignment.monthly_price
                      ? formatCurrency(
                          assignment.monthly_price * ((assignment as any).includes_gst ? 1.18 : 1)
                        )
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatCurrency(assignment.security_deposit || 0)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                    {(assignment as any).payment_destination || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {assignment.status === 'active' ? (
                      (assignment as any).rentStatus === 'received' ? (
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          Rent Received
                        </span>
                      ) : (
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                          Rent Pending
                        </span>
                      )
                    ) : (
                      <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">
                        N/A
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        assignment.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : assignment.status === 'completed'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {assignment.status}
                    </span>
                  </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setViewingAssignment(assignment)
                          setShowDetailsModal(true)
                        }}
                        className="text-orange-600 hover:text-orange-800 mr-3 transition-colors font-semibold"
                      >
                        View
                      </button>
                      {canEdit(user) && (
                        <button
                          onClick={() => handleEdit(assignment)}
                          className="text-blue-600 hover:text-blue-900 mr-3 transition-colors font-semibold"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete(user) && (
                        <button
                          onClick={() => handleDelete(assignment.id)}
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
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[95vh] overflow-hidden flex flex-col animate-slide-up">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-8 py-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">
                    {editingAssignment ? 'Edit Assignment' : 'Add New Assignment'}
                  </h3>
                  <p className="text-purple-100 text-sm mt-1">Assign customer to space</p>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false)
                    setEditingAssignment(null)
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
                {/* Assignment Details Section */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
                    Assignment Details
                  </h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        Customer <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.customer_id}
                        onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-gray-400 text-gray-900 font-medium"
                      >
                        <option value="">Select Customer</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.first_name && customer.last_name
                              ? `${customer.first_name} ${customer.last_name}`
                              : customer.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        Space <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.space_id}
                        onChange={(e) => setFormData({ ...formData, space_id: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-gray-400 text-gray-900 font-medium"
                      >
                        <option value="">Select Space</option>
                        {spacesToShow.length === 0 ? (
                          <option disabled>No available spaces</option>
                        ) : (
                          spacesToShow.map((space) => (
                            <option key={space.id} value={space.id}>
                              {space.name} ({space.type}) - {formatCurrency(space.price_per_day)}/month
                            </option>
                          ))
                        )}
                      </select>
                      {selectedSpace && (
                        <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                          <p className="text-sm text-gray-700">
                            <span className="font-semibold">Billing Cycle:</span>{' '}
                            <span className="text-purple-700 font-medium capitalize">
                              {getBillingCycle(selectedSpace.type)}
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Monthly Price <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={formData.monthly_price}
                          onChange={(e) => setFormData({ ...formData, monthly_price: e.target.value })}
                          placeholder="0.00"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                        />
                        {selectedSpace && (
                          <p className="mt-1 text-xs text-gray-500">
                            Base: {formatCurrency(selectedSpace.price_per_day)}/month
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Security Deposit <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={formData.security_deposit}
                          onChange={(e) => setFormData({ ...formData, security_deposit: e.target.value })}
                          placeholder="0.00"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Agreement Section */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
                    Agreement Details
                  </h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        Agreement PDF URL or Upload File
                      </label>
                      <input
                        type="url"
                        value={formData.agreement_pdf_url}
                        onChange={(e) => setFormData({ ...formData, agreement_pdf_url: e.target.value })}
                        placeholder="https://example.com/agreement.pdf or paste file URL after uploading"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                      />
                      <p className="text-xs text-gray-500">
                        Upload your agreement file to a cloud storage service and paste the URL here
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Agreement Expiry Date</label>
                      <input
                        type="date"
                        value={formData.agreement_expiry_date}
                        onChange={(e) => setFormData({ ...formData, agreement_expiry_date: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-gray-400 text-gray-900"
                      />
                    </div>
                  </div>
                </div>

                {/* GST & Payment Section */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
                    GST & Payment Details
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center p-4 bg-white rounded-lg border-2 border-gray-200">
                      <input
                        type="checkbox"
                        id="includes_gst"
                        checked={formData.includes_gst}
                        onChange={(e) => setFormData({ ...formData, includes_gst: e.target.checked })}
                        className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500 cursor-pointer"
                      />
                      <label htmlFor="includes_gst" className="ml-3 text-sm font-semibold text-gray-700 cursor-pointer">
                        Include GST (18%)
                      </label>
                    </div>
                    {formData.includes_gst && monthlyPriceNum > 0 && (
                      <div className="p-4 bg-green-50 rounded-lg border-2 border-green-200 animate-fade-in">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-700">Base Amount:</span>
                            <span className="text-base font-bold text-gray-900">
                              {formatCurrency(monthlyPriceNum)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-700">GST (18%):</span>
                            <span className="text-base font-bold text-green-700">
                              {formatCurrency(gstAmount)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t-2 border-green-300">
                            <span className="text-lg font-bold text-gray-900">Total with GST:</span>
                            <span className="text-xl font-bold text-green-800">
                              {formatCurrency(totalWithGST)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Payment Destination</label>
                      <select
                        value={formData.payment_destination}
                        onChange={(e) => setFormData({ ...formData, payment_destination: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-gray-400 text-gray-900 font-medium"
                      >
                        <option value="">Select Payment Destination</option>
                        {destinationOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Dates & Status Section */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">4</span>
                    Dates & Status
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        Start Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-gray-400 text-gray-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">End Date</label>
                      <input
                        type="date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-gray-400 text-gray-900"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700">Status</label>
                      <select
                        required
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-gray-400 text-gray-900 font-medium"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Notes Section */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-gray-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">5</span>
                    Additional Notes
                  </h4>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700">Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Add any additional notes about this assignment..."
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-gray-400 resize-none text-gray-900 placeholder:text-gray-400"
                      rows={4}
                    />
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end space-x-4 pt-6 border-t-2 border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false)
                      setEditingAssignment(null)
                      resetForm()
                    }}
                    className="px-8 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all duration-200 hover:scale-105 shadow-lg font-semibold flex items-center"
                  >
                    {editingAssignment ? (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Update Assignment
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create Assignment
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Details Modal */}
      {showDetailsModal && viewingAssignment && (
        <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col animate-slide-up">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-8 py-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">Assignment Details</h3>
                  <p className="text-purple-100 text-sm mt-1">
                    {(() => {
                      const customer = viewingAssignment.customer as Customer
                      const space = viewingAssignment.space as Space
                      return `${customer?.first_name && customer?.last_name ? `${customer.first_name} ${customer.last_name}` : customer?.name || '-'} - ${space?.name || '-'}`
                    })()}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowDetailsModal(false)
                    setViewingAssignment(null)
                  }}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer & Space Information */}
                <div className="bg-gradient-to-br from-purple-50 to-white rounded-xl p-6 border-2 border-purple-100">
                  <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
                    Customer & Space
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Customer</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {(() => {
                          const customer = viewingAssignment.customer as Customer
                          return customer?.first_name && customer?.last_name
                            ? `${customer.first_name} ${customer.last_name}`
                            : customer?.name || '-'
                        })()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Space</p>
                      <p className="text-sm font-semibold text-purple-700">
                        {(() => {
                          const space = viewingAssignment.space as Space
                          return space ? `${space.name} (${space.type})` : '-'
                        })()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Billing Cycle</p>
                      <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 capitalize">
                        {(() => {
                          const space = viewingAssignment.space as Space
                          return space ? getBillingCycle(space.type) : 'monthly'
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pricing Information */}
                <div className="bg-gradient-to-br from-green-50 to-white rounded-xl p-6 border-2 border-green-100">
                  <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
                    Pricing Details
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Monthly Price</p>
                      <p className="text-base font-bold text-gray-900">
                        {viewingAssignment.monthly_price ? formatCurrency(viewingAssignment.monthly_price) : '-'}
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">Base Amount:</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {formatCurrency(viewingAssignment.monthly_price || 0)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">GST (18%):</span>
                          <span className={`text-sm font-semibold ${(viewingAssignment as any).includes_gst ? 'text-green-700' : 'text-gray-500'}`}>
                            {formatCurrency((viewingAssignment as any).includes_gst && viewingAssignment.monthly_price ? viewingAssignment.monthly_price * 0.18 : 0)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-green-300">
                          <span className="text-sm font-bold text-gray-900">Total Amount:</span>
                          <span className="text-base font-bold text-green-800">
                            {formatCurrency(
                              viewingAssignment.monthly_price
                                ? (viewingAssignment.monthly_price * ((viewingAssignment as any).includes_gst ? 1.18 : 1))
                                : 0
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Security Deposit</p>
                      <p className="text-base font-bold text-gray-900">
                        {formatCurrency(viewingAssignment.security_deposit || 0)}
                      </p>
                    </div>
                    {(viewingAssignment as any).payment_destination && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Payment Destination</p>
                        <p className="text-sm font-semibold text-green-700">
                          {(viewingAssignment as any).payment_destination}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Agreement Information */}
                {(viewingAssignment.agreement_pdf_url || viewingAssignment.agreement_expiry_date) && (
                  <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-6 border-2 border-blue-100 md:col-span-2">
                    <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
                      Agreement Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {viewingAssignment.agreement_pdf_url && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Agreement Document</p>
                          <a
                            href={viewingAssignment.agreement_pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 underline font-semibold"
                          >
                            View Agreement PDF
                          </a>
                        </div>
                      )}
                      {viewingAssignment.agreement_expiry_date && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Agreement Expiry Date</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatDate(viewingAssignment.agreement_expiry_date)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Dates & Status */}
                <div className="bg-gradient-to-br from-orange-50 to-white rounded-xl p-6 border-2 border-orange-100 md:col-span-2">
                  <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">4</span>
                    Dates & Status
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Start Date</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatDate(viewingAssignment.start_date)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Renewal Date</p>
                      <p className="text-sm font-semibold text-orange-700">
                        {(() => {
                          const renewalDate = (viewingAssignment as any).renewal_date || 
                            (viewingAssignment.start_date ? (() => {
                              const date = new Date(viewingAssignment.start_date)
                              date.setMonth(date.getMonth() + 11)
                              return date.toISOString().split('T')[0]
                            })() : null)
                          return renewalDate ? formatDate(renewalDate) : '-'
                        })()}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">(11 months from start)</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">End Date</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {viewingAssignment.end_date ? formatDate(viewingAssignment.end_date) : 'Ongoing'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Status</p>
                      <span
                        className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${
                          viewingAssignment.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : viewingAssignment.status === 'completed'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {viewingAssignment.status.charAt(0).toUpperCase() + viewingAssignment.status.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {viewingAssignment.notes && (
                  <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border-2 border-gray-100 md:col-span-2">
                    <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 bg-gray-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">5</span>
                      Additional Notes
                    </h4>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{viewingAssignment.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 border-t-2 border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => {
                  setShowDetailsModal(false)
                  setViewingAssignment(null)
                }}
                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all duration-200 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
