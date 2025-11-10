'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Payment, Customer, Assignment, Space } from '@/types'
import { formatCurrency, formatDate, getBillingCycle } from '@/lib/utils'
import { useAuth } from './AuthProvider'
import { canEdit, canDelete } from '@/lib/auth'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function Payments() {
  const { user } = useAuth()
  const [payments, setPayments] = useState<Payment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [dashboardStats, setDashboardStats] = useState({
    monthlyRevenue: 0,
    monthlyPayments: 0,
    totalGST: 0,
    netRevenue: 0,
    todayRevenue: 0,
    thisWeekRevenue: 0,
  })
  const [formData, setFormData] = useState({
    assignment_id: '',
    amount: '',
    payment_date: '',
    payment_for_month: '',
    includes_gst: false,
    gst_amount: '0',
    destination: '',
    reference_number: '',
    notes: '',
    // Daily billing fields for Day Pass and Meeting Room
    number_of_days: '1',
    rent_for_dates: '', // Comma-separated dates or date range
    // Manual entry fields for Day Pass and Meeting Room
    is_manual_entry: false,
    manual_space_type: '' as 'Day Pass' | 'Meeting Room' | '',
    manual_customer_name: '',
    manual_space_name: '',
    manual_daily_rate: '',
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
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString().split('T')[0]
      const today = new Date().toISOString().split('T')[0]

      // Fetch payments with related data
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          *,
          customer:customers(*),
          assignment:assignments(
            *,
            space:spaces(*)
          )
        `)
        .order('payment_date', { ascending: false })

      if (paymentsError) throw paymentsError

      // Fetch customers, assignments, and spaces for dropdowns
      const [customersResult, assignmentsResult, spacesResult] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase
          .from('assignments')
          .select(`
            *,
            space:spaces(*)
          `)
          .order('start_date', { ascending: false }),
        supabase.from('spaces').select('*').order('name'),
      ])

      if (customersResult.error) throw customersResult.error
      if (assignmentsResult.error) throw assignmentsResult.error
      if (spacesResult.error) throw spacesResult.error

      setPayments(paymentsData || [])
      setCustomers(customersResult.data || [])
      setAssignments(assignmentsResult.data || [])
      setSpaces(spacesResult.data || [])

      // Calculate dashboard stats
      const monthlyPayments = paymentsData?.filter((p) => p.payment_date >= startOfMonth) || []
      const weeklyPayments = paymentsData?.filter((p) => p.payment_date >= startOfWeek) || []
      const todayPayments = paymentsData?.filter((p) => p.payment_date === today) || []

      const monthlyRevenue = monthlyPayments.reduce((sum, p) => sum + p.amount, 0)
      const totalGST = monthlyPayments.reduce((sum, p) => sum + (p.gst_amount || 0), 0)
      const netRevenue = monthlyRevenue - totalGST
      const todayRevenue = todayPayments.reduce((sum, p) => sum + p.amount, 0)
      const thisWeekRevenue = weeklyPayments.reduce((sum, p) => sum + p.amount, 0)

      setDashboardStats({
        monthlyRevenue,
        monthlyPayments: monthlyPayments.length,
        totalGST,
        netRevenue,
        todayRevenue,
        thisWeekRevenue,
      })
    } catch (error: any) {
      alert('Error fetching data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const calculateGST = (amount: number, includesGST: boolean) => {
    if (!includesGST) return 0
    // GST rate is 18%
    return amount * 0.18
  }

  const handleGSTChange = (includesGST: boolean, amount: string) => {
    const amountNum = parseFloat(amount) || 0
    const gstAmount = includesGST ? calculateGST(amountNum, true) : 0
    setFormData({
      ...formData,
      includes_gst: includesGST,
      gst_amount: gstAmount.toFixed(2),
    })
  }

  const handleAmountChange = (amount: string) => {
    const amountNum = parseFloat(amount) || 0
    const gstAmount = formData.includes_gst ? calculateGST(amountNum, true) : 0
    setFormData({
      ...formData,
      amount,
      gst_amount: gstAmount.toFixed(2),
    })
  }

  const handleDaysChange = (days: string) => {
    const daysNum = parseInt(days) || 1
    if (formData.is_manual_entry) {
      const dailyPrice = parseFloat(formData.manual_daily_rate) || 0
      const totalAmount = dailyPrice * daysNum
      const gstAmount = formData.includes_gst ? calculateGST(totalAmount, true) : 0
      setFormData({
        ...formData,
        number_of_days: days,
        amount: totalAmount.toString(),
        gst_amount: gstAmount.toFixed(2),
      })
    } else {
      const selectedAssignment = assignments.find((a) => a.id === formData.assignment_id)
      if (selectedAssignment) {
        const space = (selectedAssignment.space as Space) || spaces.find((s) => s.id === selectedAssignment.space_id)
        if (space && getBillingCycle(space.type) === 'daily') {
          const dailyPrice = space.price_per_day || 0
          const totalAmount = dailyPrice * daysNum
          const gstAmount = formData.includes_gst ? calculateGST(totalAmount, true) : 0
          setFormData({
            ...formData,
            number_of_days: days,
            amount: totalAmount.toString(),
            gst_amount: gstAmount.toFixed(2),
          })
        }
      }
    }
  }

  const handleAssignmentChange = (assignmentId: string) => {
    if (!assignmentId) {
      setFormData({
        ...formData,
        assignment_id: '',
        amount: '',
        includes_gst: false,
        gst_amount: '0',
        destination: '',
        payment_date: '',
        payment_for_month: '',
      })
      return
    }

    const assignment = assignments.find((a) => a.id === assignmentId)
    if (assignment) {
      const space = (assignment.space as Space) || spaces.find((s) => s.id === assignment.space_id)
      const billingCycle = space ? getBillingCycle(space.type) : 'monthly'
      const isDailyBilling = billingCycle === 'daily'
      
      // For daily billing (Day Pass, Meeting Room), use price_per_day * number_of_days
      // For monthly/yearly, use monthly_price or price_per_day
      let basePrice = 0
      if (isDailyBilling) {
        const dailyPrice = space?.price_per_day || 0
        const days = parseInt(formData.number_of_days) || 1
        basePrice = dailyPrice * days
      } else {
        basePrice = assignment.monthly_price || space?.price_per_day || 0
      }
      
      const customer = customers.find((c) => c.id === assignment.customer_id)
      const customerPaysGST = customer?.pays_gst || false
      // GST is additional (18% of base amount)
      const gstAmount = customerPaysGST ? calculateGST(basePrice, true) : 0
      
      // Get payment destination from assignment if available
      const paymentDestination = (assignment as any).payment_destination || ''

      // Set default payment date to today
      const today = new Date().toISOString().split('T')[0]
      
      // Set default payment_for_month to current month (YYYY-MM format)
      const currentMonth = new Date().toISOString().slice(0, 7)
      
      // For daily billing, set default rent_for_dates to today
      const defaultRentForDates = isDailyBilling ? today : ''

      setFormData({
        ...formData,
        assignment_id: assignmentId,
        amount: basePrice > 0 ? basePrice.toString() : '',
        includes_gst: customerPaysGST,
        gst_amount: gstAmount.toFixed(2),
        destination: paymentDestination, // Auto-fill payment destination from assignment
        payment_date: formData.payment_date || today, // Auto-fill with today if not already set
        payment_for_month: isDailyBilling ? '' : (formData.payment_for_month || currentMonth), // Only set for monthly/yearly
        number_of_days: isDailyBilling ? (formData.number_of_days || '1') : '1',
        rent_for_dates: isDailyBilling ? (formData.rent_for_dates || defaultRentForDates) : '',
      })
    }
  }

  const selectedAssignment = assignments.find((a) => a.id === formData.assignment_id)
  const selectedCustomer = selectedAssignment
    ? (customers.find((c) => c.id === selectedAssignment.customer_id) as Customer)
    : null
  const selectedSpace = selectedAssignment
    ? (selectedAssignment.space as Space) || spaces.find((s) => s.id === selectedAssignment.space_id)
    : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // Handle manual entry for Day Pass and Meeting Room
      if (formData.is_manual_entry) {
        if (!formData.manual_space_type) {
          alert('Please select space type')
          return
        }
        if (!formData.amount) {
          alert('Please enter amount')
          return
        }
        if (!formData.destination) {
          alert('Please select a payment destination')
          return
        }

        const baseAmount = parseFloat(formData.amount) || 0
        const gstAmount = formData.includes_gst ? parseFloat(formData.gst_amount) || 0 : 0
        const totalAmount = baseAmount + gstAmount

        // For manual entry, create a payment without assignment_id
        const paymentData = {
          customer_id: null, // No customer ID for manual entry
          assignment_id: null, // No assignment for manual entry
          amount: totalAmount,
          payment_date: formData.payment_date,
          payment_for_date: formData.rent_for_dates || formData.payment_date, // Use entered date(s) or payment date
          includes_gst: formData.includes_gst,
          gst_amount: gstAmount,
          destination: formData.destination,
          reference_number: formData.reference_number || null,
          notes: `Manual Entry - ${formData.manual_space_type}${formData.rent_for_dates ? `, For: ${formData.rent_for_dates}` : ''}${formData.notes ? `\n${formData.notes}` : ''}`,
        }

        const { error } = await supabase.from('payments').insert([paymentData])
        if (error) throw error

        setShowModal(false)
        setEditingPayment(null)
        resetForm()
        fetchData()
        return
      }

      // Regular assignment-based payment
      // Convert payment_for_month (YYYY-MM) to payment_for_date (first day of month)
      // For daily billing, use rent_for_dates if available, otherwise use payment_date
      let paymentForDate = ''
      if (selectedSpace && getBillingCycle(selectedSpace.type) === 'daily') {
        // For daily billing, use rent_for_dates or payment_date
        paymentForDate = formData.rent_for_dates || formData.payment_date || new Date().toISOString().split('T')[0]
      } else {
        // For monthly/yearly billing, use payment_for_month
        paymentForDate = formData.payment_for_month
          ? `${formData.payment_for_month}-01`
          : new Date().toISOString().split('T')[0]
      }

      // If GST is included, the amount stored is the base amount, GST is additional
      // Total payment = base amount + GST amount
      const baseAmount = parseFloat(formData.amount) || 0
      const gstAmount = formData.includes_gst ? parseFloat(formData.gst_amount) || 0 : 0
      const totalAmount = baseAmount + gstAmount

      if (!selectedAssignment) {
        alert('Please select an assignment')
        return
      }

      // Ensure destination is set - use form value, assignment default, or empty string
      const destination = formData.destination || (selectedAssignment as any).payment_destination || null
      
      if (!destination) {
        alert('Please select a payment destination')
        return
      }

      // Build notes with daily billing details if applicable
      let notes = formData.notes || ''
      if (selectedSpace && getBillingCycle(selectedSpace.type) === 'daily') {
        const dailyDetails = `Days: ${formData.number_of_days}, Rent For: ${formData.rent_for_dates}`
        notes = notes ? `${notes}\n${dailyDetails}` : dailyDetails
      }

      const paymentData = {
        customer_id: selectedAssignment.customer_id,
        assignment_id: formData.assignment_id,
        amount: totalAmount, // Store total amount (base + GST)
        payment_date: formData.payment_date,
        payment_for_date: paymentForDate,
        includes_gst: formData.includes_gst,
        gst_amount: gstAmount, // Store GST amount separately
        destination: destination, // Always set destination
        reference_number: formData.reference_number || null,
        notes: notes || null,
      }

      if (editingPayment) {
        const { error } = await supabase
          .from('payments')
          .update(paymentData)
          .eq('id', editingPayment.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('payments').insert([paymentData])
        if (error) throw error
      }

      setShowModal(false)
      setEditingPayment(null)
      resetForm()
      fetchData()
    } catch (error: any) {
      alert('Error saving payment: ' + error.message)
    }
  }

  const handleEdit = (payment: Payment) => {
    setEditingPayment(payment)
    // Convert payment_for_date to payment_for_month (YYYY-MM format)
    const paymentForMonth = payment.payment_for_date
      ? payment.payment_for_date.substring(0, 7)
      : ''
    
    // If GST was included, extract base amount from total
    // Total = base + GST, so base = total - GST
    const baseAmount = payment.includes_gst
      ? payment.amount - (payment.gst_amount || 0)
      : payment.amount

    // Check if this is a daily billing payment by looking at the assignment
    const assignment = assignments.find((a) => a.id === payment.assignment_id)
    const space = assignment ? ((assignment.space as Space) || spaces.find((s) => s.id === assignment.space_id)) : null
    const isDailyBilling = space ? getBillingCycle(space.type) === 'daily' : false
    
    // Extract number of days and rent_for_dates from notes if available, or calculate from amount
    let numberOfDays = '1'
    let rentForDates = ''
    let notesWithoutDailyDetails = payment.notes || ''
    
    if (isDailyBilling && space) {
      // Try to extract from notes first
      if (payment.notes) {
        const daysMatch = payment.notes.match(/Days:\s*(\d+)/i)
        const rentForMatch = payment.notes.match(/Rent For:\s*([^\n]+)/i)
        
        if (daysMatch) {
          numberOfDays = daysMatch[1]
        } else {
          // Calculate days from amount
          const dailyPrice = space.price_per_day || 1
          numberOfDays = Math.ceil(baseAmount / dailyPrice).toString()
        }
        
        if (rentForMatch) {
          rentForDates = rentForMatch[1].trim()
        } else {
          rentForDates = payment.payment_for_date || payment.payment_date
        }
        
        // Remove daily details from notes
        notesWithoutDailyDetails = payment.notes.replace(/Days:\s*\d+,\s*Rent For:\s*[^\n]+/i, '').trim()
      } else {
        // Calculate days from amount if no notes
        const dailyPrice = space.price_per_day || 1
        numberOfDays = Math.ceil(baseAmount / dailyPrice).toString()
        rentForDates = payment.payment_for_date || payment.payment_date
      }
    }

<<<<<<< HEAD
    setFormData({
      assignment_id: payment.assignment_id || '',
      amount: baseAmount.toString(), // Store base amount
      payment_date: payment.payment_date,
      payment_for_month: isDailyBilling ? '' : paymentForMonth,
      includes_gst: payment.includes_gst,
      gst_amount: (payment.gst_amount || 0).toString(),
      destination: payment.destination || '',
      reference_number: payment.reference_number || '',
      notes: notesWithoutDailyDetails,
      number_of_days: numberOfDays,
      rent_for_dates: rentForDates,
      is_manual_entry: false, // Payments from database are not manual entries
      manual_space_type: '',
      manual_customer_name: '',
      manual_space_name: '',
      manual_daily_rate: '',
    })
=======
 setFormData({
    assignmentid: payment.assignment_id || '',
    amount: baseAmount.toString(),
    paymentdate: payment.payment_date,
    paymentformonth: isDailyBilling ? '' : paymentForMonth,
    includesgst: payment.includes_gst,
    gstamount: (payment.gst_amount || 0).toString(),
    destination: payment.destination || '',
    referencenumber: payment.reference_number || '',
    notes: notesWithoutDailyDetails,
    numberofdays: numberOfDays,
    rentfordates: rentForDates,
    ismanualentry: false,
    manualspacetype: '',
    manualcustomername: '',
    manualspacename: '',
    manualdailyrate: '',
});

>>>>>>> 26e755e892b1a7bba3c4f0aa06b2bedab0d24506
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this payment?')) return

    try {
      const { error } = await supabase.from('payments').delete().eq('id', id)
      if (error) throw error
      fetchData()
    } catch (error: any) {
      alert('Error deleting payment: ' + error.message)
    }
  }

  const resetForm = () => {
    // Set defaults: today's date and current month
    const today = new Date().toISOString().split('T')[0]
    const currentMonth = new Date().toISOString().slice(0, 7)
    
    setFormData({
      assignment_id: '',
      amount: '',
      payment_date: today, // Default to today
      payment_for_month: currentMonth, // Default to current month
      includes_gst: false,
      gst_amount: '0',
      destination: '',
      reference_number: '',
      notes: '',
      number_of_days: '1',
      rent_for_dates: '',
      is_manual_entry: false,
      manual_space_type: '',
      manual_customer_name: '',
      manual_space_name: '',
      manual_daily_rate: '',
    })
  }

  const generateMonthlyPDF = () => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthName = startOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    
    const monthlyPayments = payments.filter((p) => {
      const paymentDate = new Date(p.payment_date)
      return paymentDate >= startOfMonth && paymentDate.getMonth() === now.getMonth()
    })

    const doc = new jsPDF()
    
    // Header with gradient effect (simulated)
    doc.setFillColor(255, 152, 0) // Orange
    doc.rect(0, 0, 210, 40, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.text('Spacio Workspace', 105, 20, { align: 'center' })
    
    doc.setFontSize(14)
    doc.setFont('helvetica', 'normal')
    doc.text(`Monthly Payment Report - ${monthName}`, 105, 30, { align: 'center' })
    
    // Reset text color
    doc.setTextColor(0, 0, 0)
    
    // Summary section
    const totalRevenue = monthlyPayments.reduce((sum, p) => sum + p.amount, 0)
    const totalGST = monthlyPayments.reduce((sum, p) => sum + (p.gst_amount || 0), 0)
    const totalBase = totalRevenue - totalGST
    
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Summary', 14, 50)
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Total Payments: ${monthlyPayments.length}`, 14, 58)
    doc.text(`Base Amount: ${formatCurrency(totalBase)}`, 14, 64)
    doc.text(`Total GST (18%): ${formatCurrency(totalGST)}`, 14, 70)
    doc.text(`Total Revenue: ${formatCurrency(totalRevenue)}`, 14, 76)
    
    // Table data
    const tableData = monthlyPayments.map((payment) => {
      const customer = payment.customer as Customer
      const assignment = payment.assignment as Assignment
      const space = assignment?.space as Space
      const baseAmount = payment.amount - (payment.gst_amount || 0)
      
      return [
        customer?.first_name && customer?.last_name
          ? `${customer.first_name} ${customer.last_name}`
          : customer?.name || '-',
        space?.name || '-',
        formatCurrency(baseAmount),
        payment.includes_gst ? formatCurrency(payment.gst_amount || 0) : '-',
        formatCurrency(payment.amount),
        new Date(payment.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        payment.destination || '-',
      ]
    })
    
    autoTable(doc, {
      startY: 85,
      head: [['Customer', 'Space', 'Base Amount', 'GST (18%)', 'Total', 'Date', 'Destination']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [255, 152, 0], // Orange
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [255, 247, 237], // Light orange
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 30 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
        4: { cellWidth: 25 },
        5: { cellWidth: 30 },
        6: { cellWidth: 35 },
      },
    })
    
    // Footer
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(128, 128, 128)
      doc.text(
        `Page ${i} of ${pageCount} | Generated on ${new Date().toLocaleDateString('en-US')}`,
        105,
        287,
        { align: 'center' }
      )
    }
    
    doc.save(`Spacio-Workspace-Monthly-Report-${monthName.replace(' ', '-')}.pdf`)
  }

  if (loading) {
    return <div className="p-8 text-center animate-pulse">Loading...</div>
  }

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-orange-700 bg-clip-text text-transparent">
            Payments
          </h2>
          <p className="text-sm text-gray-500 mt-1">Manage and track all payments</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={generateMonthlyPDF}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-2 rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 hover:scale-105 shadow-md font-semibold flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Generate Monthly PDF
          </button>
          <button
            onClick={() => {
              setEditingPayment(null)
              // Reset form with default values (today's date and current month)
              const today = new Date().toISOString().split('T')[0]
              const currentMonth = new Date().toISOString().slice(0, 7)
              resetForm()
              setShowModal(true)
            }}
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-2 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 hover:scale-105 shadow-md font-semibold flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Payment
          </button>
        </div>
      </div>

      {/* Sales Dashboard */}
      <div className="mb-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Sales Dashboard - This Month</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
            <h4 className="text-sm font-medium mb-2 opacity-90">Monthly Revenue</h4>
            <p className="text-3xl font-bold">{formatCurrency(dashboardStats.monthlyRevenue)}</p>
            <p className="text-sm mt-2 opacity-75">{dashboardStats.monthlyPayments} payments</p>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
            <h4 className="text-sm font-medium mb-2 opacity-90">Net Revenue (Base)</h4>
            <p className="text-3xl font-bold">{formatCurrency(dashboardStats.netRevenue)}</p>
            <p className="text-sm mt-2 opacity-75">After GST deduction</p>
          </div>

          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
            <h4 className="text-sm font-medium mb-2 opacity-90">Total GST Collected</h4>
            <p className="text-3xl font-bold">{formatCurrency(dashboardStats.totalGST)}</p>
            <p className="text-sm mt-2 opacity-75">From {dashboardStats.monthlyPayments} payments</p>
          </div>

          <div className="bg-gradient-to-br from-orange-400 to-orange-500 rounded-lg shadow-lg p-6 text-white animate-scale-in">
            <h4 className="text-sm font-medium mb-2 opacity-90">Today's Revenue</h4>
            <p className="text-3xl font-bold">{formatCurrency(dashboardStats.todayRevenue)}</p>
            <p className="text-sm mt-2 opacity-75">Today</p>
          </div>

          <div className="bg-gradient-to-br from-green-400 to-green-500 rounded-lg shadow-lg p-6 text-white animate-scale-in">
            <h4 className="text-sm font-medium mb-2 opacity-90">This Week's Revenue</h4>
            <p className="text-3xl font-bold">{formatCurrency(dashboardStats.thisWeekRevenue)}</p>
            <p className="text-sm mt-2 opacity-75">Last 7 days</p>
          </div>

          <div className="bg-gradient-to-br from-orange-300 to-orange-400 rounded-lg shadow-lg p-6 text-white animate-scale-in">
            <h4 className="text-sm font-medium mb-2 opacity-90">Average per Payment</h4>
            <p className="text-3xl font-bold">
              {dashboardStats.monthlyPayments > 0
                ? formatCurrency(dashboardStats.monthlyRevenue / dashboardStats.monthlyPayments)
                : formatCurrency(0)}
            </p>
            <p className="text-sm mt-2 opacity-75">This month</p>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-orange-100">
        <div className="px-6 py-4 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white">
          <h3 className="text-lg font-bold text-gray-900">All Payments</h3>
          <p className="text-sm text-gray-500 mt-1">Complete payment history with space assignments</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-orange-500 to-orange-600">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Assigned Space</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Base Amount</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">GST (18%)</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Total Amount</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Payment Date</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Payment For Month</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Destination</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payments.map((payment) => {
                const customer = payment.customer as Customer
                const assignment = payment.assignment as Assignment
                const space = assignment?.space as Space
                const baseAmount = payment.amount - (payment.gst_amount || 0)
                return (
                  <tr key={payment.id} className="hover:bg-orange-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {customer?.first_name && customer?.last_name
                        ? `${customer.first_name} ${customer.last_name}`
                        : customer?.name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {space ? (
                        <div>
                          <span className="font-semibold text-orange-700">{space.name}</span>
                          <span className="text-gray-500 ml-2">({space.type})</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {formatCurrency(baseAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {payment.includes_gst ? (
                        <span className="text-green-700 font-semibold">{formatCurrency(payment.gst_amount || 0)}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-orange-700">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(payment.payment_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {payment.payment_for_date
                        ? new Date(payment.payment_for_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                          })
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">
                      {payment.destination || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {canEdit(user) && (
                        <button
                          onClick={() => handleEdit(payment)}
                          className="text-orange-600 hover:text-orange-800 mr-4 transition-colors font-semibold"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete(user) && (
                        <button
                          onClick={() => handleDelete(payment.id)}
                          className="text-red-600 hover:text-red-800 transition-colors font-semibold"
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
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-hidden flex flex-col animate-slide-up">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">{editingPayment ? 'Edit Payment' : 'Add New Payment'}</h3>
                  <p className="text-orange-100 text-sm mt-1">Record payment details below</p>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false)
                    setEditingPayment(null)
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
                {/* Manual Entry Toggle for Day Pass and Meeting Room */}
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border-2 border-purple-200 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-2">Day Pass / Meeting Room Entry</h4>
                      <p className="text-sm text-gray-600">Enable manual entry for Day Pass and Meeting Room payments</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_manual_entry}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            is_manual_entry: e.target.checked,
                            assignment_id: e.target.checked ? '' : formData.assignment_id,
                            manual_space_type: e.target.checked ? formData.manual_space_type : '',
                            manual_customer_name: e.target.checked ? formData.manual_customer_name : '',
                            manual_space_name: e.target.checked ? formData.manual_space_name : '',
                            manual_daily_rate: e.target.checked ? formData.manual_daily_rate : '',
                          })
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>
                </div>

                {/* Manual Entry Form for Day Pass and Meeting Room */}
                {formData.is_manual_entry && (
                  <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border-2 border-purple-200 mb-6 animate-fade-in">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
                      Manual Entry Details
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Space Type <span className="text-red-500">*</span>
                        </label>
                        <select
                          required
                          value={formData.manual_space_type}
                          onChange={(e) => {
                            const spaceType = e.target.value as 'Day Pass' | 'Meeting Room' | ''
                            setFormData({
                              ...formData,
                              manual_space_type: spaceType,
                            })
                          }}
                          className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-gray-900 font-medium"
                        >
                          <option value="">Select Type</option>
                          <option value="Day Pass">Day Pass</option>
                          <option value="Meeting Room">Meeting Room</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Amount <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={formData.amount}
                          onChange={(e) => handleAmountChange(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-gray-900 placeholder:text-gray-400 font-medium"
                        />
                      </div>
                      <div className="col-span-1 md:col-span-2 p-4 bg-white rounded-lg border-2 border-purple-200">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="manual_includes_gst"
                            checked={formData.includes_gst}
                            onChange={(e) => handleGSTChange(e.target.checked, formData.amount)}
                            className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer"
                          />
                          <label htmlFor="manual_includes_gst" className="ml-3 text-sm font-semibold text-gray-700 cursor-pointer">
                            Include GST (18% additional)
                          </label>
                        </div>
                        {formData.includes_gst && (
                          <div className="mt-3 pt-3 border-t border-purple-200">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-gray-700">Base Amount:</span>
                              <span className="text-base font-bold text-gray-900">{formatCurrency(parseFloat(formData.amount) || 0)}</span>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-sm font-semibold text-gray-700">GST (18%):</span>
                              <span className="text-base font-bold text-purple-700">{formatCurrency(parseFloat(formData.gst_amount) || 0)}</span>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t-2 border-purple-300">
                              <span className="text-lg font-bold text-gray-900">Total Amount:</span>
                              <span className="text-xl font-bold text-purple-800">{formatCurrency((parseFloat(formData.amount) || 0) + (parseFloat(formData.gst_amount) || 0))}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Payment For Date(s)</label>
                        <input
                          type="text"
                          value={formData.rent_for_dates}
                          onChange={(e) => setFormData({ ...formData, rent_for_dates: e.target.value })}
                          placeholder="e.g., 2025-01-15 or 2025-01-15, 2025-01-16"
                          className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-purple-400 text-gray-900 placeholder:text-gray-400 font-medium"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Payment Destination <span className="text-red-500">*</span>
                        </label>
                        <select
                          required
                          value={formData.destination || ''}
                          onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                          className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-purple-400 text-gray-900 font-medium"
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
                )}

                {/* Assignment Selection Section - Only show if not manual entry */}
                {!formData.is_manual_entry && (
                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
                      Select Assignment
                    </h4>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Assignment (Space) <span className="text-red-500">*</span>
                        </label>
                        <select
                          required
                          value={formData.assignment_id}
                          onChange={(e) => handleAssignmentChange(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 text-gray-900 font-medium"
                        >
                          <option value="">Select Assignment</option>
                          {assignments
                            .filter((a) => a.status === 'active')
                            .map((assignment) => {
                              const customer = (assignment.customer as Customer) || customers.find((c) => c.id === assignment.customer_id)
                              const customerName = customer?.first_name && customer?.last_name
                                ? `${customer.first_name} ${customer.last_name}`
                                : customer?.name || 'Customer'
                              const space = (assignment.space as Space) || spaces.find((s) => s.id === assignment.space_id)
                              return (
                                <option key={assignment.id} value={assignment.id}>
                                  {space?.name || 'Space'} ({space?.type || 'N/A'}) - {customerName}
                                </option>
                              )
                            })}
                        </select>
                      {selectedAssignment && selectedSpace && selectedCustomer && (
                        <div className="mt-2 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200 animate-fade-in">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-gray-500 mb-1 font-medium">Customer</p>
                              <p className="text-base font-bold text-green-900">
                                {selectedCustomer.first_name && selectedCustomer.last_name
                                  ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
                                  : selectedCustomer.name || '-'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1 font-medium">Allocated Space</p>
                              <p className="text-base font-bold text-green-900">
                                {selectedSpace.name} ({selectedSpace.type})
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1 font-medium">Monthly Price</p>
                              <p className="text-base font-bold text-green-900">
                                {formatCurrency(selectedAssignment.monthly_price || selectedSpace.price_per_day)}
                              </p>
                            </div>
                          />
                          <p className="text-xs text-purple-600 mt-1 font-medium">
                            Daily rate: {formatCurrency(formData.is_manual_entry ? parseFloat(formData.manual_daily_rate) || 0 : (selectedSpace?.price_per_day || 0))} × {formData.number_of_days} days = {formatCurrency(parseFloat(formData.amount) || 0)}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-gray-700">
                            Rent For Date(s) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={formData.rent_for_dates}
                            onChange={(e) => setFormData({ ...formData, rent_for_dates: e.target.value })}
                            placeholder="e.g., 2024-01-15 or 2024-01-15, 2024-01-16"
                            className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-purple-400 text-gray-900 placeholder:text-gray-400 font-medium"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Enter date(s) in YYYY-MM-DD format. Use comma for multiple dates.
                          </p>
                        </div>
                      </div>
                      
                      {/* GST Option for Daily Billing */}
                      <div className="p-4 bg-white rounded-lg border-2 border-purple-200">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="daily_includes_gst"
                            checked={formData.includes_gst}
                            onChange={(e) => handleGSTChange(e.target.checked, formData.amount)}
                            className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer"
                          />
                          <label
                            htmlFor="daily_includes_gst"
                            className="ml-3 text-sm font-semibold text-gray-700 cursor-pointer"
                          >
                            Include GST (18% additional)
                          </label>
                        </div>
                        {formData.includes_gst && (
                          <div className="mt-3 pt-3 border-t border-purple-200">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-gray-700">Base Amount:</span>
                              <span className="text-base font-bold text-gray-900">
                                {formatCurrency(parseFloat(formData.amount) || 0)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-sm font-semibold text-gray-700">GST (18%):</span>
                              <span className="text-base font-bold text-purple-700">
                                {formatCurrency(parseFloat(formData.gst_amount) || 0)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t-2 border-purple-300">
                              <span className="text-lg font-bold text-gray-900">Total Amount:</span>
                              <span className="text-xl font-bold text-purple-800">
                                {formatCurrency(
                                  (parseFloat(formData.amount) || 0) + (parseFloat(formData.gst_amount) || 0)
                                )}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Payment Destination for Daily Billing */}
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Payment Destination <span className="text-red-500">*</span>
                        </label>
                        <select
                          required
                          value={formData.destination || ''}
                          onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                          className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-purple-400 text-gray-900 font-medium"
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
                )}

                {/* Payment Amount Section - Only for Monthly/Yearly Billing */}
                {(!selectedSpace || getBillingCycle(selectedSpace.type) !== 'daily') && (
                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
                      Payment Amount
                    </h4>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Base Amount (Monthly Price) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={formData.amount}
                          onChange={(e) => handleAmountChange(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400 text-lg font-semibold"
                        />
                        {selectedAssignment && selectedSpace && (
                          <p className="text-xs text-blue-600 mt-1 font-medium">
                            ✓ Auto-filled from assignment ({formatCurrency(selectedAssignment.monthly_price || selectedSpace.price_per_day || 0)}). You can modify if needed.
                          </p>
                        )}
                        {!selectedAssignment && (
                          <p className="text-xs text-gray-500 mt-1">
                            Select an assignment to auto-fill the amount
                          </p>
                        )}
                      </div>
                      <div className="flex items-center p-4 bg-white rounded-lg border-2 border-gray-200">
                        <input
                          type="checkbox"
                          id="includes_gst"
                          checked={formData.includes_gst}
                          onChange={(e) => handleGSTChange(e.target.checked, formData.amount)}
                          className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500 cursor-pointer"
                          disabled={selectedCustomer?.pays_gst === true}
                        />
                        <label
                          htmlFor="includes_gst"
                          className={`ml-3 text-sm font-semibold text-gray-700 cursor-pointer ${
                            selectedCustomer?.pays_gst === true ? 'opacity-60' : ''
                          }`}
                        >
                          Customer Pays GST (18% additional)
                          {selectedCustomer?.pays_gst === true && (
                            <span className="ml-2 text-xs text-green-600">(Auto-enabled for this customer)</span>
                          )}
                        </label>
                      </div>
                      {formData.includes_gst && (
                        <div className="space-y-3 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200 animate-fade-in">
                          <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-700">GST Amount (18%)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={formData.gst_amount}
                              readOnly
                              className="w-full px-4 py-3 border-2 border-green-300 rounded-lg bg-white text-gray-900 font-semibold text-green-700 text-lg"
                            />
                            {selectedAssignment && (
                              <p className="text-xs text-gray-500 mt-1">Auto-calculated as 18% of base amount</p>
                            )}
                          </div>
                          <div className="pt-3 border-t-2 border-green-200">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-gray-700">Base Amount:</span>
                              <span className="text-base font-semibold text-gray-900">
                                {formatCurrency(parseFloat(formData.amount) || 0)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-sm font-semibold text-gray-700">GST (18%):</span>
                              <span className="text-base font-semibold text-green-700">
                                {formatCurrency(parseFloat(formData.gst_amount) || 0)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t-2 border-green-300">
                              <span className="text-lg font-bold text-gray-900">Total Amount:</span>
                              <span className="text-xl font-bold text-green-800">
                                {formatCurrency(
                                  (parseFloat(formData.amount) || 0) + (parseFloat(formData.gst_amount) || 0)
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      {!formData.includes_gst && formData.amount && (
                        <div className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-700">Total Amount:</span>
                            <span className="text-lg font-bold text-gray-900">
                              {formatCurrency(parseFloat(formData.amount) || 0)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">No GST applied</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Date & Destination Section - Only for Monthly/Yearly Billing */}
                {(!selectedSpace || getBillingCycle(selectedSpace.type) !== 'daily') && (
                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
                      Date & Destination
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Payment Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={formData.payment_date || new Date().toISOString().split('T')[0]}
                          onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 text-gray-900"
                        />
                        <p className="text-xs text-gray-500">
                          {!formData.payment_date && 'Default: Today'}
                          {formData.payment_date && 'You can change this date'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Payment For Month <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="month"
                          required
                          value={formData.payment_for_month || new Date().toISOString().slice(0, 7)}
                          onChange={(e) => setFormData({ ...formData, payment_for_month: e.target.value })}
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 text-gray-900"
                        />
                        <p className="text-xs text-gray-500">
                          {!formData.payment_for_month && 'Default: Current month'}
                          {formData.payment_for_month && 'Select the month this payment is for'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        Payment Destination <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.destination || ''}
                        onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 text-gray-900 font-medium"
                      >
                        <option value="">Select Payment Destination</option>
                        {destinationOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {selectedAssignment && (selectedAssignment as any).payment_destination && (
                        <p className="text-xs text-blue-600 mt-1 font-medium">
                          {formData.destination === (selectedAssignment as any).payment_destination 
                            ? `✓ Auto-filled from assignment: ${(selectedAssignment as any).payment_destination}`
                            : `Default from assignment: ${(selectedAssignment as any).payment_destination} (currently: ${formData.destination || 'Not selected'})`}
                        </p>
                      )}
                      {!selectedAssignment && (
                        <p className="text-xs text-gray-500 mt-1">
                          Select an assignment to see the default destination
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Additional Information Section */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                      {selectedSpace && getBillingCycle(selectedSpace.type) === 'daily' ? '5' : '4'}
                    </span>
                    Additional Information
                  </h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Reference Number</label>
                      <input
                        type="text"
                        value={formData.reference_number}
                        onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                        placeholder="Transaction/Reference number"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Notes</label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Add any additional notes..."
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 resize-none text-gray-900 placeholder:text-gray-400"
                        rows={3}
                      />
                    </div>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end space-x-4 pt-6 border-t-2 border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false)
                      setEditingPayment(null)
                      resetForm()
                    }}
                    className="px-8 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all duration-200 hover:scale-105 shadow-lg font-semibold flex items-center"
                  >
                    {editingPayment ? (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Update Payment
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create Payment
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
