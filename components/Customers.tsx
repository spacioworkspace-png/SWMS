'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Customer, RegistrationType, Assignment, Payment, Space } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAuth } from './AuthProvider'
import { canEdit, canDelete } from '@/lib/auth'

export default function Customers() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([])
  const [activeAssignments, setActiveAssignments] = useState<Map<string, Assignment>>(new Map())
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('name_asc')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null)
  const [viewingAssignment, setViewingAssignment] = useState<Assignment | null>(null)
  const [viewingPayments, setViewingPayments] = useState<Payment[]>([])
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    mobile_number: '',
    aadhaar_card_url: '',
    street_address: '',
    street_address_line2: '',
    city: '',
    state_province: '',
    postal_code: '',
    country: '',
    registration_type: 'individual' as RegistrationType,
    company_name: '',
    company_gstin: '',
    nature_of_business: '',
    company_registration_doc_url: '',
  })

  useEffect(() => {
    fetchCustomers()
    fetchActiveAssignments()
  }, [])

  const fetchActiveAssignments = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('assignments')
        .select(`
          *,
          space:spaces(*)
        `)
        .eq('status', 'active')
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('created_at', { ascending: false })

      if (error) throw error

      const assignmentsMap = new Map<string, Assignment>()
      data?.forEach((assignment: any) => {
        assignmentsMap.set(assignment.customer_id, assignment)
      })
      setActiveAssignments(assignmentsMap)
    } catch (error: any) {
      console.error('Error fetching active assignments:', error.message)
    }
  }

  const importAllFromSheet = async () => {
    if (!confirm('Import all new customers from Google Sheet into the database?')) return
    try {
      const res = await fetch('/api/customers/sheets-import', {
        method: 'POST',
      })
      if (!res.ok) {
        const msg = (await res.json()).error || 'Import failed'
        throw new Error(msg)
      }
      const { inserted, skipped, totalRows } = await res.json()
      alert(`Import complete. Inserted: ${inserted}, Skipped (existing): ${skipped}, Sheet rows: ${totalRows}`)
      await fetchCustomers()
      await fetchActiveAssignments()
    } catch (err: any) {
      alert(`Import error: ${err.message || err}`)
    }
  }

  // Filter and sort customers
  useEffect(() => {
    let filtered = [...customers]

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter((c) => {
        const name = c.first_name && c.last_name
          ? `${c.first_name} ${c.last_name}`
          : c.name || ''
        return (
          name.toLowerCase().includes(searchLower) ||
          c.email?.toLowerCase().includes(searchLower) ||
          c.mobile_number?.toLowerCase().includes(searchLower) ||
          c.company?.toLowerCase().includes(searchLower)
        )
      })
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter((c) => c.registration_type === typeFilter)
    }

    // GST logic removed from customers; handled at assignment level

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          const aName = a.first_name && a.last_name ? `${a.first_name} ${a.last_name}` : a.name || ''
          const bName = b.first_name && b.last_name ? `${b.first_name} ${b.last_name}` : b.name || ''
          return aName.localeCompare(bName)
        case 'name_desc':
          const aNameDesc = a.first_name && a.last_name ? `${a.first_name} ${a.last_name}` : a.name || ''
          const bNameDesc = b.first_name && b.last_name ? `${b.first_name} ${b.last_name}` : b.name || ''
          return bNameDesc.localeCompare(aNameDesc)
        case 'date_desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'date_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'company_asc':
          return (a.company || '').localeCompare(b.company || '')
        default:
          return 0
      }
    })

    setFilteredCustomers(filtered)
  }, [customers, searchTerm, typeFilter, sortBy])

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      const customersData = data || []
      setCustomers(customersData)
      setFilteredCustomers(customersData)
    } catch (error: any) {
      alert('Error fetching customers: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const customerData = {
        name: `${formData.first_name} ${formData.last_name}`.trim(),
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        email: formData.email || null,
        mobile_number: formData.mobile_number || null,
        phone: formData.mobile_number || null,
        aadhaar_card_url: formData.aadhaar_card_url || null,
        street_address: formData.street_address || null,
        street_address_line2: formData.street_address_line2 || null,
        city: formData.city || null,
        state_province: formData.state_province || null,
        postal_code: formData.postal_code || null,
        country: formData.country || null,
        registration_type: formData.registration_type || null,
        company: formData.registration_type === 'company' ? formData.company_name : null,
        company_gstin: formData.company_gstin || null,
        nature_of_business: formData.nature_of_business || null,
        company_registration_doc_url: formData.company_registration_doc_url || null,
        tax_id: formData.company_gstin || null,
      }

      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update(customerData)
          .eq('id', editingCustomer.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('customers').insert([customerData])
        if (error) throw error
      }

      setShowModal(false)
      setEditingCustomer(null)
      resetForm()
      fetchCustomers()
      fetchActiveAssignments()
    } catch (error: any) {
      alert('Error saving customer: ' + error.message)
    }
  }

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setFormData({
      first_name: customer.first_name || '',
      last_name: customer.last_name || '',
      email: customer.email || '',
      mobile_number: customer.mobile_number || customer.phone || '',
      aadhaar_card_url: customer.aadhaar_card_url || '',
      street_address: customer.street_address || '',
      street_address_line2: customer.street_address_line2 || '',
      city: customer.city || '',
      state_province: customer.state_province || '',
      postal_code: customer.postal_code || '',
      country: customer.country || '',
      registration_type: (customer.registration_type as RegistrationType) || 'individual',
      company_name: customer.company || '',
      company_gstin: customer.company_gstin || customer.tax_id || '',
      nature_of_business: customer.nature_of_business || '',
      company_registration_doc_url: customer.company_registration_doc_url || '',
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return

    try {
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) throw error
      fetchCustomers()
      fetchActiveAssignments()
    } catch (error: any) {
      alert('Error deleting customer: ' + error.message)
    }
  }

  const fetchCustomerDetails = async (customerId: string) => {
    try {
      // Fetch active assignment for this customer
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select(`
          *,
          space:spaces(*)
        `)
        .eq('customer_id', customerId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (assignmentError && assignmentError.code !== 'PGRST116') {
        // PGRST116 is "no rows returned", which is fine
        console.error('Error fetching assignment:', assignmentError)
      }

      if (assignmentData) {
        setViewingAssignment(assignmentData as Assignment)
      } else {
        setViewingAssignment(null)
      }

      // Fetch all payments for this customer
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          *,
          assignment:assignments(
            id,
            space_id,
            space:spaces(name, type)
          )
        `)
        .eq('customer_id', customerId)
        .order('payment_date', { ascending: false })

      if (paymentsError) {
        console.error('Error fetching payments:', paymentsError)
        setViewingPayments([])
      } else {
        setViewingPayments((paymentsData as Payment[]) || [])
      }
    } catch (error: any) {
      console.error('Error fetching customer details:', error.message)
      setViewingAssignment(null)
      setViewingPayments([])
    }
  }

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      mobile_number: '',
      aadhaar_card_url: '',
      street_address: '',
      street_address_line2: '',
      city: '',
      state_province: '',
      postal_code: '',
      country: '',
      registration_type: 'individual',
      company_name: '',
      company_gstin: '',
      nature_of_business: '',
      company_registration_doc_url: '',
    })
  }

  const autoPopulateFromSheet = async () => {
    try {
      const email = formData.email?.trim().toLowerCase()
      const phone = formData.mobile_number?.replace(/\s+/g, '')
      if (!email && !phone) {
        alert('Enter email or mobile number first to look up in the sheet.')
        return
      }

      const params = new URLSearchParams()
      if (email) params.set('email', email)
      if (phone) params.set('phone', phone)

      const res = await fetch(`/api/customers/sheets-lookup?${params.toString()}`)
      if (!res.ok) {
        const msg = (await res.json()).error || 'Lookup failed'
        throw new Error(msg)
      }
      const data = await res.json()
      const candidate = data.match || (data.matches && data.matches[0])
      if (!candidate) {
        alert('No matching entry found in the Google Sheet.')
        return
      }

      setFormData((prev) => {
        const updated: any = { ...prev }
        Object.entries(candidate).forEach(([k, v]) => {
          if (v !== '' && v !== null && v !== undefined) {
            // Only overwrite when the sheet has a non-empty value
            // registration_type must remain a valid value
            if (k === 'registration_type' && (v === 'individual' || v === 'company')) {
              updated[k] = v
            } else if (k !== 'registration_type') {
              // Types in formData keys match candidate mapping from API
              // @ts-ignore
              updated[k] = v
            }
          }
        })
        return updated
      })

      if (data.matches && data.matches.length > 1) {
        alert(`Multiple matches found (${data.matches.length}). The first match was applied.`)
      }
    } catch (err: any) {
      alert(`Auto-populate error: ${err.message || err}`)
    }
  }

  if (loading) {
    return <div className="p-8 text-center animate-pulse">Loading...</div>
  }

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-orange-700 bg-clip-text text-transparent">
            Customers
          </h2>
          <p className="text-sm text-gray-500 mt-1">Manage customer information and details</p>
        </div>
        {canEdit(user) && (
          <div className="flex gap-3">
            <button
              onClick={() => {
                setEditingCustomer(null)
                resetForm()
                setShowModal(true)
              }}
              className="bg-gradient-to-r from-orange-600 to-orange-700 text-white px-6 py-2 rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all duration-200 hover:scale-105 shadow-md font-semibold flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Customer
            </button>
            <button
              onClick={importAllFromSheet}
              className="px-6 py-2 rounded-lg border-2 border-orange-600 text-orange-700 hover:bg-orange-50 transition-all duration-200 font-semibold"
            >
              Import new from Google Sheet
            </button>
          </div>
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
              placeholder="Search by name, email, or company..."
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 placeholder:text-gray-400"
            />
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Registration Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 font-medium"
            >
              <option value="all">All Types</option>
              <option value="individual">Individual</option>
              <option value="company">Company</option>
            </select>
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
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="company_asc">Company (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            Showing <span className="font-semibold text-blue-700">{filteredCustomers.length}</span> of{' '}
            <span className="font-semibold">{customers.length}</span> customers
          </p>
        </div>
      </div>

      <div className="overflow-x-auto shadow-lg rounded-lg">
        <table className="min-w-full bg-white border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredCustomers.map((customer) => (
              <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {customer.first_name && customer.last_name
                    ? `${customer.first_name} ${customer.last_name}`
                    : customer.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.email || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {customer.mobile_number || customer.phone || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                    {customer.registration_type === 'company' ? 'Company' : 'Individual'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.company || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {activeAssignments.has(customer.id) ? (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 animate-pulse">
                      Active Customer
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
                      Inactive
                    </span>
                  )}
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={async () => {
                      setViewingCustomer(customer)
                      // Fetch assignment and payments for this customer
                      await fetchCustomerDetails(customer.id)
                      setShowDetailsModal(true)
                    }}
                    className="text-orange-600 hover:text-orange-800 mr-3 transition-colors font-semibold"
                  >
                    View
                  </button>
                  {canEdit(user) && (
                    <button
                      onClick={() => handleEdit(customer)}
                      className="text-blue-600 hover:text-blue-900 mr-3 transition-colors font-semibold"
                    >
                      Edit
                    </button>
                  )}
                  {canDelete(user) && (
                    <button
                      onClick={() => handleDelete(customer.id)}
                      className="text-red-600 hover:text-red-900 transition-colors font-semibold"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col animate-slide-up">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h3>
                  <p className="text-blue-100 text-sm mt-1">Fill in the customer details below</p>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false)
                    setEditingCustomer(null)
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
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Personal Information Section */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
                    Personal Information
                  </h4>
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={autoPopulateFromSheet}
                      className="text-sm px-3 py-2 rounded-md border-2 border-blue-500 text-blue-600 hover:bg-blue-50 transition-colors font-semibold"
                    >
                      Auto-populate from Google Sheet
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.first_name}
                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                        placeholder="Enter first name"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.last_name}
                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                        placeholder="Enter last name"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Email Address</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="example@email.com"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        Mobile Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.mobile_number}
                        onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
                        placeholder="+91 1234567890"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700">Aadhaar Card URL</label>
                      <input
                        type="url"
                        value={formData.aadhaar_card_url}
                        onChange={(e) => setFormData({ ...formData, aadhaar_card_url: e.target.value })}
                        placeholder="https://example.com/aadhaar-card.pdf"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Address Information Section */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
                    Address Information
                  </h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Street Address</label>
                      <input
                        type="text"
                        value={formData.street_address}
                        onChange={(e) => setFormData({ ...formData, street_address: e.target.value })}
                        placeholder="House/Flat No., Building Name"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Street Address Line 2</label>
                      <input
                        type="text"
                        value={formData.street_address_line2}
                        onChange={(e) => setFormData({ ...formData, street_address_line2: e.target.value })}
                        placeholder="Area, Locality"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">City</label>
                        <input
                          type="text"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          placeholder="City"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">State/Province</label>
                        <input
                          type="text"
                          value={formData.state_province}
                          onChange={(e) => setFormData({ ...formData, state_province: e.target.value })}
                          placeholder="State"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Postal/Zip Code</label>
                        <input
                          type="text"
                          value={formData.postal_code}
                          onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                          placeholder="PIN Code"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Country</label>
                      <input
                        type="text"
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        placeholder="Country"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Registration Type Section */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
                    Registration Type
                  </h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        Are you registering as an individual or a company? <span className="text-red-500">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, registration_type: 'individual' })}
                          className={`p-4 rounded-xl border-2 transition-all ${
                            formData.registration_type === 'individual'
                              ? 'border-blue-500 bg-blue-50 shadow-md'
                              : 'border-gray-300 bg-white hover:border-gray-400'
                          }`}
                        >
                          <div className="flex items-center">
                            <div
                              className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center ${
                                formData.registration_type === 'individual'
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-gray-400'
                              }`}
                            >
                              {formData.registration_type === 'individual' && (
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                              )}
                            </div>
                            <span className="font-semibold text-gray-900">Individual</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, registration_type: 'company' })}
                          className={`p-4 rounded-xl border-2 transition-all ${
                            formData.registration_type === 'company'
                              ? 'border-blue-500 bg-blue-50 shadow-md'
                              : 'border-gray-300 bg-white hover:border-gray-400'
                          }`}
                        >
                          <div className="flex items-center">
                            <div
                              className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center ${
                                formData.registration_type === 'company'
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-gray-400'
                              }`}
                            >
                              {formData.registration_type === 'company' && (
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                              )}
                            </div>
                            <span className="font-semibold text-gray-900">Company</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Company Information Section */}
                {formData.registration_type === 'company' && (
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200 animate-fade-in">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">4</span>
                      Company Information
                    </h4>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Company Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required={formData.registration_type === 'company'}
                          value={formData.company_name}
                          onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                          placeholder="Enter company name"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-gray-700">Company GSTIN</label>
                          <input
                            type="text"
                            value={formData.company_gstin}
                            onChange={(e) => setFormData({ ...formData, company_gstin: e.target.value })}
                            placeholder="GSTIN Number"
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-gray-700">Nature of Business</label>
                          <input
                            type="text"
                            value={formData.nature_of_business}
                            onChange={(e) => setFormData({ ...formData, nature_of_business: e.target.value })}
                            placeholder="Business type"
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Company Registration Documents URL <span className="text-gray-500 text-xs">(Optional)</span>
                        </label>
                        <input
                          type="url"
                          value={formData.company_registration_doc_url}
                          onChange={(e) => setFormData({ ...formData, company_registration_doc_url: e.target.value })}
                          placeholder="https://example.com/registration-doc.pdf"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                        />
                      </div>
                      <div className="flex items-center p-4 bg-white rounded-lg border-2 border-gray-200">
                        <input
                          type="checkbox"
                          id="pays_gst"
                          checked={formData.pays_gst}
                          onChange={(e) => setFormData({ ...formData, pays_gst: e.target.checked })}
                          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <label htmlFor="pays_gst" className="ml-3 text-sm font-semibold text-gray-700 cursor-pointer">
                          This company pays GST
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Form Actions */}
                <div className="flex justify-end space-x-4 pt-6 border-t-2 border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false)
                      setEditingCustomer(null)
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
                    {editingCustomer ? (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Update Customer
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create Customer
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Customer Details Modal */}
      {showDetailsModal && viewingCustomer && (
        <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col animate-slide-up">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">Customer Details</h3>
                  <p className="text-orange-100 text-sm mt-1">
                    {viewingCustomer.first_name && viewingCustomer.last_name
                      ? `${viewingCustomer.first_name} ${viewingCustomer.last_name}`
                      : viewingCustomer.name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowDetailsModal(false)
                    setViewingCustomer(null)
                    setViewingAssignment(null)
                    setViewingPayments([])
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
                {/* Personal Information */}
                <div className="bg-gradient-to-br from-orange-50 to-white rounded-xl p-6 border-2 border-orange-100">
                  <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
                    Personal Information
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Full Name</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {viewingCustomer.first_name && viewingCustomer.last_name
                          ? `${viewingCustomer.first_name} ${viewingCustomer.last_name}`
                          : viewingCustomer.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Email</p>
                      <p className="text-sm font-semibold text-gray-900">{viewingCustomer.email || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Mobile Number</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {viewingCustomer.mobile_number || viewingCustomer.phone || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Registration Type</p>
                      <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                        {viewingCustomer.registration_type === 'company' ? 'Company' : 'Individual'}
                      </span>
                    </div>
                    {viewingCustomer.aadhaar_card_url && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Aadhaar Card</p>
                        <a
                          href={viewingCustomer.aadhaar_card_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-orange-600 hover:text-orange-800 underline font-semibold"
                        >
                          View Document
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Address Information */}
                <div className="bg-gradient-to-br from-green-50 to-white rounded-xl p-6 border-2 border-green-100">
                  <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
                    Address Information
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Street Address</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {viewingCustomer.street_address || '-'}
                      </p>
                    </div>
                    {viewingCustomer.street_address_line2 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Address Line 2</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {viewingCustomer.street_address_line2}
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">City</p>
                        <p className="text-sm font-semibold text-gray-900">{viewingCustomer.city || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">State</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {viewingCustomer.state_province || '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Postal Code</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {viewingCustomer.postal_code || '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Country</p>
                        <p className="text-sm font-semibold text-gray-900">{viewingCustomer.country || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Company Information */}
                {viewingCustomer.registration_type === 'company' && (
                  <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-6 border-2 border-blue-100 md:col-span-2">
                    <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
                      Company Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Company Name</p>
                        <p className="text-sm font-semibold text-gray-900">{viewingCustomer.company || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">GSTIN</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {viewingCustomer.company_gstin || viewingCustomer.tax_id || '-'}
                        </p>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-xs text-gray-500 mb-1">Nature of Business</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {viewingCustomer.nature_of_business || '-'}
                        </p>
                      </div>
                      {viewingCustomer.company_registration_doc_url && (
                        <div className="md:col-span-2">
                          <p className="text-xs text-gray-500 mb-1">Company Registration Document</p>
                          <a
                            href={viewingCustomer.company_registration_doc_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 underline font-semibold"
                          >
                            View Document
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* GST Information */}
                <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl p-6 border-2 border-emerald-100 md:col-span-2">
                  <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">4</span>
                    Tax Information
                  </h4>
                  <div className="flex items-center space-x-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Pays GST</p>
                      <span
                        className={`inline-block px-4 py-2 text-sm font-semibold rounded-lg ${
                          viewingCustomer.pays_gst
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {viewingCustomer.pays_gst ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {viewingCustomer.pays_gst && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">GST Rate</p>
                        <p className="text-sm font-bold text-emerald-700">18%</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Assignment Information */}
                {viewingAssignment && (
                  <div className="bg-gradient-to-br from-purple-50 to-white rounded-xl p-6 border-2 border-purple-100 md:col-span-2">
                    <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">5</span>
                      Current Assignment
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Assigned Space</p>
                        <p className="text-base font-bold text-purple-700">
                          {(() => {
                            const space = viewingAssignment.space as Space
                            return space ? `${space.name} (${space.type})` : '-'
                          })()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Monthly Rent</p>
                        <p className="text-base font-bold text-gray-900">
                          {viewingAssignment.monthly_price
                            ? formatCurrency(viewingAssignment.monthly_price)
                            : (() => {
                                const space = viewingAssignment.space as Space
                                return space ? formatCurrency(space.price_per_day) : '-'
                              })()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Security Deposit</p>
                        <p className="text-base font-bold text-gray-900">
                          {formatCurrency(viewingAssignment.security_deposit || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Start Date</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatDate(viewingAssignment.start_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Status</p>
                        <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          {viewingAssignment.status.charAt(0).toUpperCase() + viewingAssignment.status.slice(1)}
                        </span>
                      </div>
                      {(viewingAssignment as any).renewal_date && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Renewal Date</p>
                          <p className="text-sm font-semibold text-purple-700">
                            {formatDate((viewingAssignment as any).renewal_date)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Payments Information */}
                {viewingPayments.length > 0 && (
                  <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-6 border-2 border-blue-100 md:col-span-2">
                    <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">6</span>
                      Payment History ({viewingPayments.length} payments)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Space</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Base Amount</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">GST</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {viewingPayments.map((payment) => {
                            const assignment = payment.assignment as any
                            const space = assignment?.space as Space
                            const baseAmount = payment.amount - (payment.gst_amount || 0)
                            return (
                              <tr key={payment.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {formatDate(payment.payment_date)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {space ? `${space.name} (${space.type})` : '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                                  {formatCurrency(baseAmount)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {payment.includes_gst ? formatCurrency(payment.gst_amount || 0) : '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-blue-700">
                                  {formatCurrency(payment.amount)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {payment.destination || '-'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot className="bg-gray-50">
                          <tr>
                            <td colSpan={2} className="px-4 py-3 text-sm font-bold text-gray-900">
                              Total Payments
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-gray-900">
                              {formatCurrency(
                                viewingPayments.reduce((sum, p) => sum + (p.amount - (p.gst_amount || 0)), 0)
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-gray-900">
                              {formatCurrency(
                                viewingPayments.reduce((sum, p) => sum + (p.gst_amount || 0), 0)
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-blue-700">
                              {formatCurrency(
                                viewingPayments.reduce((sum, p) => sum + p.amount, 0)
                              )}
                            </td>
                            <td className="px-4 py-3"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 border-t-2 border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => {
                  setShowDetailsModal(false)
                  setViewingCustomer(null)
                  setViewingAssignment(null)
                  setViewingPayments([])
                }}
                className="px-6 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 font-semibold"
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
