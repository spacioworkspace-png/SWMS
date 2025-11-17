'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Assignment, Customer, Space, Payment } from '@/types'

export default function AppaPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [showDayPassForm, setShowDayPassForm] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null)
  const [collectingPayment, setCollectingPayment] = useState<{
    assignment: Assignment
    monthKey: string
    customer: string
    space: string
    spaceType: string
    base: number
    gst: number
    total: number
    includesGST: boolean
  } | null>(null)
  const [dayPassForm, setDayPassForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    destination: 'SPACIO CURRENT',
    includes_gst: false,
    gst_amount: '0',
    reference_number: '',
    notes: '',
  })
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_for_month: '',
    destination: '',
    includes_gst: false,
    gst_amount: '0',
    reference_number: '',
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

  const fetchData = async () => {
    try {
      const [assignmentsResult, paymentsResult, customersResult, spacesResult] = await Promise.all([
        supabase
          .from('assignments')
          .select(`
            *,
            customer:customers(*),
            space:spaces(*)
          `)
          .eq('status', 'active'),
        supabase.from('payments').select('*').order('payment_date', { ascending: false }),
        supabase.from('customers').select('*'),
        supabase.from('spaces').select('*'),
      ])

      if (assignmentsResult.error) throw assignmentsResult.error
      if (paymentsResult.error) throw paymentsResult.error
      if (customersResult.error) throw customersResult.error
      if (spacesResult.error) throw spacesResult.error

      setAssignments(assignmentsResult.data || [])
      setPayments(paymentsResult.data || [])
      setCustomers(customersResult.data || [])
      setSpaces(spacesResult.data || [])
    } catch (error: any) {
      alert('Error loading data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // Calculate pending payments for ALL months
  const pendingPaymentsByMonth = useMemo(() => {
    const now = new Date()
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    
    // Generate list of months from first assignment start date to current month (inclusive)
    const allMonths: string[] = []
    if (assignments.length > 0) {
      const earliestStart = assignments.reduce((earliest, a) => {
        const start = (a.start_date || '').slice(0, 7)
        if (!start) return earliest
        return earliest && start < earliest ? start : (earliest || start)
      }, '')
      
      if (earliestStart) {
        const [startYear, startMonth] = earliestStart.split('-').map(Number)
        const [currentYear, currentMonth] = currentMonthKey.split('-').map(Number)
        
        let year = startYear
        let month = startMonth
        
        // Include current month by using <=
        while (year < currentYear || (year === currentYear && month <= currentMonth)) {
          allMonths.push(`${year}-${String(month).padStart(2, '0')}`)
          month++
          if (month > 12) {
            month = 1
            year++
          }
        }
      } else {
        // If no start dates, at least include current month
        allMonths.push(currentMonthKey)
      }
    } else {
      // If no assignments, still show current month
      allMonths.push(currentMonthKey)
    }

    // Group pending payments by month
    const grouped: Record<string, Array<{
      assignment: Assignment
      monthKey: string
      customer: string
      space: string
      spaceType: string
      base: number
      gst: number
      total: number
      includesGST: boolean
    }>> = {}

    for (const monthKey of allMonths) {
      const pending = assignments
        .filter((a) => {
          const space = a.space as Space
          if (space?.type === 'Virtual Office') return false

          const startKey = (a.start_date || '').slice(0, 7) || monthKey
          const endKey = (a.end_date || '').slice(0, 7) || ''
          
          if (monthKey < startKey) return false
          if (endKey && monthKey > endKey) return false

          // Check if payment exists for this month
          const hasPayment = payments.some(
            (p) =>
              p.assignment_id === a.id &&
              ((p.payment_for_date || '').slice(0, 7) === monthKey ||
                (p.payment_date || '').slice(0, 7) === monthKey)
          )

          return !hasPayment
        })
        .map((a) => {
          const customer = a.customer as Customer
          const space = a.space as Space
          const base = a.monthly_price || space?.price_per_day || 0
          const gst = (a as any).includes_gst ? base * 0.18 : 0
          const total = base + gst

          return {
            assignment: a,
            monthKey,
            customer: customer?.first_name && customer?.last_name
              ? `${customer.first_name} ${customer.last_name}`
              : customer?.name || '-',
            space: space?.name || '-',
            spaceType: space?.type || '-',
            base,
            gst,
            total,
            includesGST: (a as any).includes_gst || false,
          }
        })
        .sort((a, b) => a.space.localeCompare(b.space))

      // Always include current month, even if no pending payments
      if (pending.length > 0 || monthKey === currentMonthKey) {
        grouped[monthKey] = pending
      }
    }

    return grouped
  }, [assignments, payments])

  // Flatten for total count
  const allPendingPayments = useMemo(() => {
    return Object.values(pendingPaymentsByMonth).flat()
  }, [pendingPaymentsByMonth])

  const calculateGST = (amount: number) => {
    return amount * 0.18
  }

  const handleAmountChange = (amount: string) => {
    const amountNum = parseFloat(amount) || 0
    const gstAmount = dayPassForm.includes_gst ? calculateGST(amountNum) : 0
    setDayPassForm((prev) => ({
      ...prev,
      amount,
      gst_amount: gstAmount.toFixed(2),
    }))
  }

  const handleGSTToggle = (includesGST: boolean) => {
    const amountNum = parseFloat(dayPassForm.amount) || 0
    const gstAmount = includesGST ? calculateGST(amountNum) : 0
    setDayPassForm((prev) => ({
      ...prev,
      includes_gst: includesGST,
      gst_amount: gstAmount.toFixed(2),
    }))
  }

  const handleDayPassSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!dayPassForm.amount) {
        alert('Please enter amount')
        return
      }
      if (!dayPassForm.destination) {
        alert('Please select payment destination')
        return
      }

      const baseAmount = parseFloat(dayPassForm.amount) || 0
      const gstAmount = dayPassForm.includes_gst ? parseFloat(dayPassForm.gst_amount) || 0 : 0
      const totalAmount = baseAmount + gstAmount

      const paymentData = {
        customer_id: null,
        assignment_id: null,
        amount: totalAmount,
        payment_date: dayPassForm.payment_date,
        payment_for_date: dayPassForm.payment_date,
        includes_gst: dayPassForm.includes_gst,
        gst_amount: gstAmount,
        destination: dayPassForm.destination,
        reference_number: dayPassForm.reference_number || null,
        notes: `Day Pass Entry${dayPassForm.notes ? ` - ${dayPassForm.notes}` : ''}`,
      }

      const { error } = await supabase.from('payments').insert([paymentData])
      if (error) throw error

      alert('Day Pass payment saved successfully!')
      setShowDayPassForm(false)
      setDayPassForm({
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        destination: 'SPACIO CURRENT',
        includes_gst: false,
        gst_amount: '0',
        reference_number: '',
        notes: '',
      })
      fetchData()
    } catch (error: any) {
      alert('Error saving payment: ' + error.message)
    }
  }

  const startCollectPayment = (item: {
    assignment: Assignment
    monthKey: string
    customer: string
    space: string
    spaceType: string
    base: number
    gst: number
    total: number
    includesGST: boolean
  }) => {
    setCollectingPayment(item)
    const assignment = item.assignment
    const space = assignment.space as Space
    const today = new Date().toISOString().split('T')[0]
    
    setPaymentForm({
      amount: item.base.toString(),
      payment_date: today,
      payment_for_month: item.monthKey,
      destination: (assignment as any).payment_destination || 'SPACIO CURRENT',
      includes_gst: item.includesGST,
      gst_amount: item.gst.toFixed(2),
      reference_number: '',
      notes: '',
    })
    setShowPaymentModal(true)
  }

  const handlePaymentAmountChange = (amount: string) => {
    const amountNum = parseFloat(amount) || 0
    const gstAmount = paymentForm.includes_gst ? calculateGST(amountNum) : 0
    setPaymentForm((prev) => ({
      ...prev,
      amount,
      gst_amount: gstAmount.toFixed(2),
    }))
  }

  const handlePaymentGSTToggle = (includesGST: boolean) => {
    const amountNum = parseFloat(paymentForm.amount) || 0
    const gstAmount = includesGST ? calculateGST(amountNum) : 0
    setPaymentForm((prev) => ({
      ...prev,
      includes_gst: includesGST,
      gst_amount: gstAmount.toFixed(2),
    }))
  }

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!collectingPayment) return

    try {
      if (!paymentForm.amount) {
        alert('Please enter amount')
        return
      }
      if (!paymentForm.destination) {
        alert('Please select payment destination')
        return
      }

      const baseAmount = parseFloat(paymentForm.amount) || 0
      const gstAmount = paymentForm.includes_gst ? parseFloat(paymentForm.gst_amount) || 0 : 0
      const totalAmount = baseAmount + gstAmount

      const paymentForDate = paymentForm.payment_for_month
        ? `${paymentForm.payment_for_month}-01`
        : paymentForm.payment_date

      const paymentData = {
        customer_id: collectingPayment.assignment.customer_id,
        assignment_id: collectingPayment.assignment.id,
        amount: totalAmount,
        payment_date: paymentForm.payment_date,
        payment_for_date: paymentForDate,
        includes_gst: paymentForm.includes_gst,
        gst_amount: gstAmount,
        destination: paymentForm.destination,
        reference_number: paymentForm.reference_number || null,
        notes: paymentForm.notes || null,
      }

      const { error } = await supabase.from('payments').insert([paymentData])
      if (error) throw error

      // Show success message
      const customerName = collectingPayment.customer
      const spaceName = collectingPayment.space
      const monthName = new Date(collectingPayment.monthKey + '-01').toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
      setPaymentSuccessMessage(
        `Payment of ${formatCurrency(totalAmount)} collected successfully for ${customerName} - ${spaceName} (${monthName})!`
      )

      // Close modal and refresh data after a brief delay
      setTimeout(() => {
        setShowPaymentModal(false)
        setCollectingPayment(null)
        setPaymentSuccessMessage(null)
        setPaymentForm({
          amount: '',
          payment_date: new Date().toISOString().split('T')[0],
          payment_for_month: '',
          destination: '',
          includes_gst: false,
          gst_amount: '0',
          reference_number: '',
          notes: '',
        })
        fetchData()
      }, 2000)
    } catch (error: any) {
      alert('Error saving payment: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-orange-600 text-xl font-semibold">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-green-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 mb-6 animate-slide-up">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-xl">S</span>
                </div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-orange-700 bg-clip-text text-transparent">
                    Payment Collection
                  </h1>
                  <p className="text-sm text-gray-500">Simple payment tracking</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowDayPassForm(!showDayPassForm)}
              className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-3 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 hover:scale-105 shadow-lg font-semibold text-lg flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {showDayPassForm ? 'Cancel' : 'Add Day Pass'}
            </button>
          </div>
        </div>

        {/* Day Pass Form */}
        {showDayPassForm && (
          <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 mb-6 animate-slide-up border border-orange-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                💰
              </span>
              Add Day Pass Payment
            </h2>
            <form onSubmit={handleDayPassSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={dayPassForm.amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 placeholder:text-gray-400 text-lg font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Payment Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={dayPassForm.payment_date}
                    onChange={(e) => setDayPassForm((prev) => ({ ...prev, payment_date: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Payment Destination <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={dayPassForm.destination}
                    onChange={(e) => setDayPassForm((prev) => ({ ...prev, destination: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 font-medium"
                  >
                    {destinationOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Reference Number</label>
                  <input
                    type="text"
                    value={dayPassForm.reference_number}
                    onChange={(e) => setDayPassForm((prev) => ({ ...prev, reference_number: e.target.value }))}
                    placeholder="Transaction ID, Cheque #..."
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 placeholder:text-gray-400"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg border-2 border-orange-200">
                <input
                  type="checkbox"
                  id="daypass_gst"
                  checked={dayPassForm.includes_gst}
                  onChange={(e) => handleGSTToggle(e.target.checked)}
                  className="w-5 h-5 text-orange-600 border-gray-300 rounded focus:ring-orange-500 cursor-pointer"
                />
                <label htmlFor="daypass_gst" className="text-sm font-semibold text-gray-700 cursor-pointer flex-1">
                  Include GST (18%)
                </label>
              </div>

              {dayPassForm.includes_gst && dayPassForm.amount && (
                <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-gray-600 font-semibold mb-1">Base</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(parseFloat(dayPassForm.amount) || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 font-semibold mb-1">GST</p>
                    <p className="text-xl font-bold text-green-700">{formatCurrency(parseFloat(dayPassForm.gst_amount) || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 font-semibold mb-1">Total</p>
                    <p className="text-xl font-bold text-green-800">
                      {formatCurrency((parseFloat(dayPassForm.amount) || 0) + (parseFloat(dayPassForm.gst_amount) || 0))}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Notes (optional)</label>
                <textarea
                  value={dayPassForm.notes}
                  onChange={(e) => setDayPassForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any additional notes..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 placeholder:text-gray-400 resize-none"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t-2 border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowDayPassForm(false)
                    setDayPassForm({
                      amount: '',
                      payment_date: new Date().toISOString().split('T')[0],
                      destination: 'SPACIO CURRENT',
                      includes_gst: false,
                      gst_amount: '0',
                      reference_number: '',
                      notes: '',
                    })
                  }}
                  className="px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-semibold text-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 font-bold shadow-lg flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                  </svg>
                  Save Day Pass
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Pending Payments by Month */}
        {Object.keys(pendingPaymentsByMonth).length === 0 ? (
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-orange-100 animate-fade-in">
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">🎉</div>
              <p className="text-xl font-semibold text-gray-700">All payments collected!</p>
              <p className="text-sm text-gray-500 mt-2">No pending payments</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(pendingPaymentsByMonth)
              .sort(([a], [b]) => b.localeCompare(a)) // Newest months first
              .map(([monthKey, pendingList]) => {
                // Parse month key reliably (YYYY-MM format)
                const [year, month] = monthKey.split('-').map(Number)
                const monthDate = new Date(year, month - 1, 1) // month is 0-indexed in Date constructor
                const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                
                // Calculate current month key consistently
                const now = new Date()
                const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                const isCurrentMonth = monthKey === currentMonthKey
                const monthTotal = pendingList.reduce((sum, p) => sum + p.total, 0)
                const monthBase = pendingList.reduce((sum, p) => sum + p.base, 0)
                const monthGST = pendingList.reduce((sum, p) => sum + p.gst, 0)

                return (
                  <div
                    key={monthKey}
                    className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-orange-100 animate-fade-in"
                  >
                    <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-white">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <span className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                              📋
                            </span>
                            {monthName}
                            {isCurrentMonth && (
                              <span className="px-3 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800">
                                Current Month
                              </span>
                            )}
                          </h2>
                          <p className="text-sm text-gray-500 mt-1">
                            {pendingList.length} payment{pendingList.length !== 1 ? 's' : ''} pending • Total:{' '}
                            {formatCurrency(monthTotal)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gradient-to-r from-orange-500 to-orange-600">
                          <tr>
                            <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase">Customer</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase">Space</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase">Type</th>
                            <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase">Base Amount</th>
                            <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase">GST</th>
                            <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase">Total</th>
                            <th className="px-6 py-4 text-center text-xs font-bold text-white uppercase">Action</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {pendingList.map((item, index) => (
                            <tr
                              key={`${item.assignment.id}-${item.monthKey}-${index}`}
                              className="hover:bg-orange-50 transition-colors"
                            >
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-semibold text-gray-900">{item.customer}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-semibold text-orange-700">{item.space}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                  {item.spaceType}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div className="text-sm font-semibold text-gray-900">{formatCurrency(item.base)}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div className="text-sm font-semibold text-green-700">
                                  {item.includesGST ? formatCurrency(item.gst) : '-'}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div className="text-base font-bold text-orange-700">{formatCurrency(item.total)}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <button
                                  onClick={() => startCollectPayment(item)}
                                  className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg font-semibold transition-all duration-200 hover:scale-105 shadow-md"
                                >
                                  Collect
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gradient-to-r from-orange-50 to-white">
                          <tr>
                            <td colSpan={3} className="px-6 py-4 text-sm font-bold text-gray-900">
                              Month Total
                            </td>
                            <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                              {formatCurrency(monthBase)}
                            </td>
                            <td className="px-6 py-4 text-right text-sm font-bold text-green-700">
                              {formatCurrency(monthGST)}
                            </td>
                            <td className="px-6 py-4 text-right text-base font-bold text-orange-700">
                              {formatCurrency(monthTotal)}
                            </td>
                            <td className="px-6 py-4"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        {/* Payment Collection Modal */}
        {showPaymentModal && collectingPayment && (
          <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-hidden flex flex-col animate-slide-up border border-orange-100">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold">Collect Payment</h3>
                    <p className="text-orange-100 text-sm mt-1">
                      {collectingPayment.customer} - {collectingPayment.space} ({collectingPayment.monthKey})
                    </p>
                  </div>
                  {!paymentSuccessMessage && (
                    <button
                      onClick={() => {
                        setShowPaymentModal(false)
                        setCollectingPayment(null)
                        setPaymentForm({
                          amount: '',
                          payment_date: new Date().toISOString().split('T')[0],
                          payment_for_month: '',
                          destination: '',
                          includes_gst: false,
                          gst_amount: '0',
                          reference_number: '',
                          notes: '',
                        })
                      }}
                      className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                {paymentSuccessMessage ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 animate-bounce">
                      <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-green-700 mb-2">Payment Saved Successfully!</h3>
                    <p className="text-lg text-gray-700 text-center max-w-md">{paymentSuccessMessage}</p>
                    <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Closing form...
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handlePaymentSubmit} className="space-y-6">
                    {/* Pre-filled Info */}
                  <div className="bg-gradient-to-br from-orange-50 to-white rounded-xl p-6 border-2 border-orange-100">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Customer</p>
                        <p className="text-sm font-bold text-gray-900">{collectingPayment.customer}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Space</p>
                        <p className="text-sm font-bold text-orange-700">{collectingPayment.space}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Month</p>
                        <p className="text-sm font-bold text-gray-900">
                          {new Date(collectingPayment.monthKey + '-01').toLocaleDateString('en-US', {
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Expected Total</p>
                        <p className="text-sm font-bold text-orange-700">{formatCurrency(collectingPayment.total)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Amount <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={paymentForm.amount}
                      onChange={(e) => handlePaymentAmountChange(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 placeholder:text-gray-400 text-lg font-semibold"
                    />
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Payment Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={paymentForm.payment_date}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, payment_date: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Payment For Month <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="month"
                        required
                        value={paymentForm.payment_for_month}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, payment_for_month: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900"
                      />
                    </div>
                  </div>

                  {/* Destination */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Payment Destination <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={paymentForm.destination}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, destination: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 font-medium"
                    >
                      <option value="">Select Destination</option>
                      {destinationOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* GST */}
                  <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg border-2 border-orange-200">
                    <input
                      type="checkbox"
                      id="payment_gst"
                      checked={paymentForm.includes_gst}
                      onChange={(e) => handlePaymentGSTToggle(e.target.checked)}
                      className="w-5 h-5 text-orange-600 border-gray-300 rounded focus:ring-orange-500 cursor-pointer"
                    />
                    <label htmlFor="payment_gst" className="text-sm font-semibold text-gray-700 cursor-pointer flex-1">
                      Include GST (18%)
                    </label>
                  </div>

                  {paymentForm.includes_gst && paymentForm.amount && (
                    <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200 grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-gray-600 font-semibold mb-1">Base</p>
                        <p className="text-xl font-bold text-gray-900">{formatCurrency(parseFloat(paymentForm.amount) || 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 font-semibold mb-1">GST</p>
                        <p className="text-xl font-bold text-green-700">{formatCurrency(parseFloat(paymentForm.gst_amount) || 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 font-semibold mb-1">Total</p>
                        <p className="text-xl font-bold text-green-800">
                          {formatCurrency((parseFloat(paymentForm.amount) || 0) + (parseFloat(paymentForm.gst_amount) || 0))}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Reference & Notes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Reference Number</label>
                      <input
                        type="text"
                        value={paymentForm.reference_number}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, reference_number: e.target.value }))}
                        placeholder="Transaction ID, Cheque #..."
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                      <textarea
                        value={paymentForm.notes}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Any additional notes..."
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 placeholder:text-gray-400 resize-none"
                        rows={2}
                      />
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="flex justify-end gap-4 pt-6 border-t-2 border-gray-200">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPaymentModal(false)
                        setCollectingPayment(null)
                      }}
                      className="px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-semibold text-gray-700 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 font-bold shadow-lg flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                      </svg>
                      Save Payment
                    </button>
                  </div>
                </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

