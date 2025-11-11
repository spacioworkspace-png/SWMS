'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Payment, Customer, Assignment, Space } from '@/types'
import { formatCurrency, formatDate, getBillingCycle } from '@/lib/utils'
import { useAuth } from '@/components/AuthProvider'
import { canEdit, canDelete } from '@/lib/auth'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function PaymentsNew({ mode }: { mode?: 'full' | 'formOnly' } = {}) {
  const { user } = useAuth()
  const [payments, setPayments] = useState<Payment[]>([])
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(mode === 'formOnly')
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [destinationFilter, setDestinationFilter] = useState<string>('all')
  const [gstFilter, setGstFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [sortBy, setSortBy] = useState('date_desc')
  const [dashboardStats, setDashboardStats] = useState({
    monthlyRevenue: 0,
    monthlyPayments: 0,
    totalGST: 0,
    netRevenue: 0,
    todayRevenue: 0,
    thisWeekRevenue: 0,
  })
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<Record<string, { count: number; base: number; gst: number; total: number }>>({})
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list' | 'pending' | 'reports'>('dashboard')
  const [reportsSort, setReportsSort] = useState<'desc' | 'asc'>('desc')
  const [reportsRowSort, setReportsRowSort] = useState<'space_asc' | 'space_desc' | 'date_asc' | 'date_desc'>('date_asc')
  const [isLateMonth, setIsLateMonth] = useState<boolean>(false)
  const [groupPendingByMonth, setGroupPendingByMonth] = useState<boolean>(false)
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
    is_manual_entry: false,
    manual_space_type: '' as 'Day Pass' | 'Meeting Room' | '',
    rent_for_dates: '',
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

  // Compute filtered/sorted payments
  useEffect(() => {
    let list = [...payments]

    // Date range filter
    if (dateFrom) list = list.filter((p) => p.payment_date >= dateFrom)
    if (dateTo) list = list.filter((p) => p.payment_date <= dateTo)

    // Destination filter
    if (destinationFilter !== 'all') {
      list = list.filter((p) => (p.destination || '') === destinationFilter)
    }

    // GST filter
    if (gstFilter !== 'all') {
      const flag = gstFilter === 'yes'
      list = list.filter((p) => !!p.includes_gst === flag)
    }

    // Search filter across customer name, space name, destination, reference, notes
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      list = list.filter((p) => {
        const customer = p.customer as Customer | undefined
        const assignment = p.assignment as Assignment | undefined
        const space = assignment?.space as Space | undefined
        const customerName = customer?.first_name && customer?.last_name
          ? `${customer.first_name} ${customer.last_name}`
          : customer?.name || ''
        return (
          customerName.toLowerCase().includes(q) ||
          (space?.name || '').toLowerCase().includes(q) ||
          (space?.type || '').toLowerCase().includes(q) ||
          (p.destination || '').toLowerCase().includes(q) ||
          (p.reference_number || '').toLowerCase().includes(q) ||
          (p.notes || '').toLowerCase().includes(q)
        )
      })
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc':
          return new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
        case 'date_asc':
          return new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
        case 'amount_desc':
          return b.amount - a.amount
        case 'amount_asc':
          return a.amount - b.amount
        case 'customer_asc': {
          const getName = (p: Payment) => {
            const c = p.customer as Customer | undefined
            const name = c?.first_name && c?.last_name ? `${c.first_name} ${c.last_name}` : c?.name || ''
            return name
          }
          return getName(a).localeCompare(getName(b))
        }
        case 'space_asc': {
          const getSpace = (p: Payment) => {
            const asg = p.assignment as Assignment | undefined
            const sp = asg?.space as Space | undefined
            return (sp?.name || '').toLowerCase()
          }
          return getSpace(a).localeCompare(getSpace(b))
        }
        case 'space_desc': {
          const getSpace = (p: Payment) => {
            const asg = p.assignment as Assignment | undefined
            const sp = asg?.space as Space | undefined
            return (sp?.name || '').toLowerCase()
          }
          return getSpace(b).localeCompare(getSpace(a))
        }
        default:
          return 0
      }
    })

    setFilteredPayments(list)
  }, [payments, searchTerm, dateFrom, dateTo, destinationFilter, gstFilter, sortBy])

  const fetchData = async () => {
    try {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString().split('T')[0]
      const today = new Date().toISOString().split('T')[0]

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

      const [customersResult, assignmentsResult, spacesResult] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase
          .from('assignments')
          .select(`*, space:spaces(*)`)
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
      setFilteredPayments(paymentsData || [])

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

      const breakdown: Record<string, { count: number; base: number; gst: number; total: number }> = {}
      for (const p of monthlyPayments) {
        const asg = p.assignment as Assignment | undefined
        const sp = asg?.space as Space | undefined
        const type = sp?.type || 'Unknown'
        const base = p.amount - (p.gst_amount || 0)
        const gst = p.includes_gst ? (p.gst_amount || 0) : 0
        if (!breakdown[type]) breakdown[type] = { count: 0, base: 0, gst: 0, total: 0 }
        breakdown[type].count += 1
        breakdown[type].base += base
        breakdown[type].gst += gst
        breakdown[type].total += p.amount
      }
      setMonthlyBreakdown(breakdown)
    } catch (error: any) {
      alert('Error fetching data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const calculateGST = (amount: number, includesGST: boolean) => {
    if (!includesGST) return 0
    return amount * 0.18
  }

  const handleGSTChange = (includesGST: boolean, amount: string) => {
    const amountNum = parseFloat(amount) || 0
    const gstAmount = includesGST ? calculateGST(amountNum, true) : 0
    setFormData((prev) => ({
      ...prev,
      includes_gst: includesGST,
      gst_amount: gstAmount.toFixed(2),
    }))
  }

  const handleAmountChange = (amount: string) => {
    const amountNum = parseFloat(amount) || 0
    const gstAmount = formData.includes_gst ? calculateGST(amountNum, true) : 0
    setFormData((prev) => ({
      ...prev,
      amount,
      gst_amount: gstAmount.toFixed(2),
    }))
  }

  const handleAssignmentChange = (assignmentId: string) => {
    if (!assignmentId) {
      setFormData((prev) => ({
        ...prev,
        assignment_id: '',
        amount: '',
        includes_gst: false,
        gst_amount: '0',
        destination: '',
        payment_date: '',
        payment_for_month: '',
      }))
      return
    }

    const assignment = assignments.find((a) => a.id === assignmentId)
    if (assignment) {
      const space = (assignment.space as Space) || spaces.find((s) => s.id === assignment.space_id)
      const billingCycle = space ? getBillingCycle(space.type) : 'monthly'
      const isDailyBilling = billingCycle === 'daily'

      let basePrice = 0
      if (!isDailyBilling) {
        // Do not auto-fill base for Virtual Office (yearly billing)
        if (space?.type === 'Virtual Office') {
          basePrice = 0
        } else {
          basePrice = assignment.monthly_price || space?.price_per_day || 0
        }
      } else {
        basePrice = space?.price_per_day || 0
      }

      const customer = customers.find((c) => c.id === assignment.customer_id)
      const customerPaysGST = customer?.pays_gst || false
      const gstAmount = customerPaysGST ? calculateGST(basePrice, true) : 0

      const paymentDestination = (assignment as any).payment_destination || ''
      const today = new Date().toISOString().split('T')[0]
      const currentMonth = new Date().toISOString().slice(0, 7)

      setFormData((prev) => ({
        ...prev,
        assignment_id: assignmentId,
        // For Virtual Office, keep amount unchanged (no auto-fill)
        amount: space?.type === 'Virtual Office' ? prev.amount : (basePrice > 0 ? basePrice.toString() : ''),
        includes_gst: customerPaysGST,
        gst_amount: gstAmount.toFixed(2),
        destination: paymentDestination,
        payment_date: prev.payment_date || today,
        payment_for_month: isDailyBilling ? '' : (prev.payment_for_month || currentMonth),
        rent_for_dates: isDailyBilling ? (prev.rent_for_dates || today) : '',
      }))
    }
  }

  const selectedAssignment = assignments.find((a) => a.id === formData.assignment_id)
  const selectedCustomer = selectedAssignment ? (customers.find((c) => c.id === selectedAssignment.customer_id) as Customer) : null
  const selectedSpace = selectedAssignment ? (selectedAssignment.space as Space) || spaces.find((s) => s.id === selectedAssignment.space_id) : null

  // Current month key e.g. '2025-11'
  const currentMonthKey = new Date().toISOString().slice(0, 7)
  const [pendingMonth, setPendingMonth] = useState<string>(currentMonthKey)
  
  // Dashboard computations: this-month only metrics and last-month comparison
  const lastMonthKey = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 7)
  })()

  const monthKeyOf = (p: Payment) => ((p.payment_for_date && p.payment_for_date.slice(0,7)) || (p.payment_date || '').slice(0,7))

  const metrics = useMemo(() => {
    const thisMonthPayments = payments.filter((p) => monthKeyOf(p) === currentMonthKey)
    const lastMonthPayments = payments.filter((p) => monthKeyOf(p) === lastMonthKey)
    const sum = (list: Payment[]) => {
      let baseGST = 0, baseNonGST = 0, gst = 0, total = 0
      for (const p of list) {
        const b = (p.amount - (p.gst_amount || 0))
        if (p.includes_gst) baseGST += b
        else baseNonGST += p.amount
        gst += (p.gst_amount || 0)
        total += p.amount
      }
      const base = baseGST + baseNonGST
      return { baseGST, baseNonGST, base, gst, total, count: list.length }
    }
    return { thisM: sum(thisMonthPayments), lastM: sum(lastMonthPayments) }
  }, [payments, currentMonthKey, lastMonthKey])
  const [rowCollectMonth, setRowCollectMonth] = useState<Record<string, string>>({})

  // Utility: month iteration between two YYYY-MM inclusive
  const monthRange = (fromKey: string, toKey: string) => {
    const res: string[] = []
    const [yf, mf] = fromKey.split('-').map(Number)
    const [yt, mt] = toKey.split('-').map(Number)
    let y = yf, m = mf
    while (y < yt || (y === yt && m <= mt)) {
      res.push(`${y.toString().padStart(4,'0')}-${m.toString().padStart(2,'0')}`)
      m++
      if (m > 12) { m = 1; y++ }
    }
    return res
  }

  // Map of assignmentId -> pending month keys (from start_date up to current month, excluding months with a payment)
  const pendingMonthsByAssignment: Record<string, string[]> = (() => {
    const map: Record<string, string[]> = {}
    for (const a of assignments) {
      if (a.status !== 'active') continue
      const sp = (a.space as Space) || spaces.find((s) => s.id === a.space_id)
      if (sp?.type === 'Virtual Office') continue
      const startKey = (a.start_date || '').slice(0,7) || currentMonthKey
      const months = monthRange(startKey, currentMonthKey)
      const pend = months.filter((mk) => {
        const hasPayment = payments.some((p) => p.assignment_id === a.id && (((p.payment_for_date || '').slice(0,7) === mk) || ((p.payment_date || '').slice(0,7) === mk)))
        return !hasPayment
      })
      map[a.id] = pend
    }
    return map
  })()

  // Flatten pending months into rows for display
  const pendingRows: Array<{ a: Assignment; monthKey: string }> = (() => {
    const rows: Array<{ a: Assignment; monthKey: string }> = []
    for (const a of assignments) {
      if (a.status !== 'active') continue
      const sp = (a.space as Space) || spaces.find((s) => s.id === a.space_id)
      if (sp?.type === 'Virtual Office') continue
      const months = pendingMonthsByAssignment[a.id] || []
      for (const mk of months) rows.push({ a, monthKey: mk })
    }
    // Sort by space name then month
    rows.sort((r1, r2) => {
      const s1 = ((r1.a.space as Space) || spaces.find((s) => s.id === r1.a.space_id))
      const s2 = ((r2.a.space as Space) || spaces.find((s) => s.id === r2.a.space_id))
      const n1 = (s1?.name || '').toLowerCase()
      const n2 = (s2?.name || '').toLowerCase()
      const byName = n1.localeCompare(n2)
      if (byName !== 0) return byName
      return r1.monthKey.localeCompare(r2.monthKey)
    })
    return rows
  })()

  // Group pending rows by month with estimated totals (base/gst/total)
  const pendingGroups: Record<string, { rows: Array<{ a: Assignment; monthKey: string }>; totals: { base: number; gst: number; total: number } }> = (() => {
    const map: Record<string, { rows: Array<{ a: Assignment; monthKey: string }>; totals: { base: number; gst: number; total: number } }> = {}
    for (const pr of pendingRows) {
      const key = pr.monthKey
      if (!map[key]) map[key] = { rows: [], totals: { base: 0, gst: 0, total: 0 } }
      map[key].rows.push(pr)
      const a = pr.a
      const sp = (a.space as Space) || spaces.find((s) => s.id === a.space_id)
      const c = customers.find((cc) => cc.id === a.customer_id)
      const base = (a.monthly_price || sp?.price_per_day || 0)
      const gst = c?.pays_gst ? base * 0.18 : 0
      map[key].totals.base += base
      map[key].totals.gst += gst
      map[key].totals.total += base + gst
    }
    return map
  })()

  // Assignments that have NOT made a payment in selected pendingMonth (match by payment_for_date OR payment_date month)
  const pendingAssignments = assignments
    .filter((a) => a.status === 'active')
    .filter((a) => {
      const sp = (a.space as Space) || spaces.find((s) => s.id === a.space_id)
      if (sp?.type === 'Virtual Office') return false
      const hasPaymentThisMonth = payments.some((p) => {
        if (p.assignment_id !== a.id) return false
        const forMonth = (p.payment_for_date || '').slice(0, 7)
        const paidMonth = (p.payment_date || '').slice(0, 7)
        return forMonth === pendingMonth || paidMonth === pendingMonth
      })
      return !hasPaymentThisMonth
    })
    .sort((a, b) => {
      const sa = ((a.space as Space) || spaces.find((s) => s.id === a.space_id))
      const sb = ((b.space as Space) || spaces.find((s) => s.id === b.space_id))
      const an = (sa?.name || '').toLowerCase()
      const bn = (sb?.name || '').toLowerCase()
      return an.localeCompare(bn)
    })

  // Start a collection flow for a given assignment
  const startCollect = (assignment: Assignment, monthKey?: string) => {
    setEditingPayment(null)
    resetForm()
    handleAssignmentChange(assignment.id)
    setFormData((prev) => ({ ...prev, payment_for_month: (monthKey || pendingMonth) }))
    setShowModal(true)
  }

  // Row comparator for Reports tab tables
  const compareReportRows = (a: Payment, b: Payment) => {
    const getSpaceName = (p: Payment) => {
      const asg = p.assignment as Assignment | undefined
      const sp = asg?.space as Space | undefined
      return (sp?.name || '').toLowerCase()
    }
    switch (reportsRowSort) {
      case 'space_asc':
        return getSpaceName(a).localeCompare(getSpaceName(b))
      case 'space_desc':
        return getSpaceName(b).localeCompare(getSpaceName(a))
      case 'date_desc':
        return b.payment_date.localeCompare(a.payment_date)
      case 'date_asc':
      default:
        return a.payment_date.localeCompare(b.payment_date)
    }
  }

  // Only show assignments that already have a payment recorded for the selected month, ordered by space name
  const monthKey = (formData.payment_for_month || new Date().toISOString().slice(0, 7))
  const filteredAssignmentsByMonth = assignments
    .filter((a) => a.status === 'active')
    .filter((a) => !payments.some((p) => p.assignment_id === a.id && (p.payment_for_date || '').startsWith(monthKey)))
    .sort((a, b) => {
      const sa = ((a.space as Space) || spaces.find((s) => s.id === a.space_id))
      const sb = ((b.space as Space) || spaces.find((s) => s.id === b.space_id))
      const an = (sa?.name || '').toLowerCase()
      const bn = (sb?.name || '').toLowerCase()
      return an.localeCompare(bn)
    })

  // If selected assignment is not in the filtered list for the chosen month, clear it
  useEffect(() => {
    if (formData.assignment_id && !filteredAssignmentsByMonth.find((a) => a.id === formData.assignment_id)) {
      setFormData((prev) => ({ ...prev, assignment_id: '' }))
    }
  }, [monthKey, assignments, payments])

  // Late month toggle: when enabled, set Payment For Month to previous month; when disabled, default to current if empty
  useEffect(() => {
    const now = new Date()
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const currentKey = currentMonth.toISOString().slice(0, 7)
    const prevKey = prevMonth.toISOString().slice(0, 7)
    setFormData((prev) => ({
      ...prev,
      payment_for_month: isLateMonth ? prevKey : (prev.payment_for_month || currentKey),
    }))
  }, [isLateMonth])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
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

        const paymentForDate = formData.payment_for_month
          ? `${formData.payment_for_month}-01`
          : (formData.payment_date || new Date().toISOString().split('T')[0])

        const paymentData = {
          customer_id: null,
          assignment_id: null,
          amount: totalAmount,
          payment_date: formData.payment_date || new Date().toISOString().split('T')[0],
          payment_for_date: paymentForDate,
          includes_gst: formData.includes_gst,
          gst_amount: gstAmount,
          destination: formData.destination,
          reference_number: formData.reference_number || null,
          notes: `Manual Entry - ${formData.manual_space_type}${formData.payment_for_month ? `, For: ${formData.payment_for_month}` : ''}${formData.notes ? `\n${formData.notes}` : ''}`,
        }

        const { error } = await supabase.from('payments').insert([paymentData])
        if (error) throw error
        setShowModal(false)
        setEditingPayment(null)
        resetForm()
        fetchData()
        return
      }

      let paymentForDate = ''
      if (selectedSpace && getBillingCycle(selectedSpace.type) === 'daily') {
        paymentForDate = formData.rent_for_dates || formData.payment_date || new Date().toISOString().split('T')[0]
      } else {
        paymentForDate = formData.payment_for_month ? `${formData.payment_for_month}-01` : new Date().toISOString().split('T')[0]
      }

      const baseAmount = parseFloat(formData.amount) || 0
      const gstAmount = formData.includes_gst ? parseFloat(formData.gst_amount) || 0 : 0
      const totalAmount = baseAmount + gstAmount

      if (!selectedAssignment) {
        alert('Please select an assignment')
        return
      }

      const destination = formData.destination || (selectedAssignment as any).payment_destination || null
      if (!destination) {
        alert('Please select a payment destination')
        return
      }

      let notes = formData.notes || ''
      if (selectedSpace && getBillingCycle(selectedSpace.type) === 'daily') {
        const dailyDetails = `For: ${formData.rent_for_dates || paymentForDate}`
        notes = notes ? `${notes}\n${dailyDetails}` : dailyDetails
      }

      const paymentData = {
        customer_id: selectedAssignment.customer_id,
        assignment_id: formData.assignment_id,
        amount: totalAmount,
        payment_date: formData.payment_date,
        payment_for_date: paymentForDate,
        includes_gst: formData.includes_gst,
        gst_amount: gstAmount,
        destination: destination,
        reference_number: formData.reference_number || null,
        notes: notes || null,
      }

      if (editingPayment) {
        const { error } = await supabase.from('payments').update(paymentData).eq('id', editingPayment.id)
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
    const paymentForMonth = payment.payment_for_date ? payment.payment_for_date.substring(0, 7) : ''
    const baseAmount = payment.includes_gst ? payment.amount - (payment.gst_amount || 0) : payment.amount
    setFormData({
      assignment_id: payment.assignment_id || '',
      amount: baseAmount.toString(),
      payment_date: payment.payment_date,
      payment_for_month: payment.assignment_id ? paymentForMonth : '',
      includes_gst: payment.includes_gst,
      gst_amount: (payment.gst_amount || 0).toString(),
      destination: payment.destination || '',
      reference_number: payment.reference_number || '',
      notes: payment.notes || '',
      is_manual_entry: !payment.assignment_id,
      manual_space_type: !payment.assignment_id ? ('Day Pass' as const) : '',
      rent_for_dates: !payment.assignment_id ? (payment.payment_for_date || payment.payment_date) : '',
    })
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
    const today = new Date().toISOString().split('T')[0]
    const currentMonth = new Date().toISOString().slice(0, 7)
    setFormData({
      assignment_id: '',
      amount: '',
      payment_date: today,
      payment_for_month: currentMonth,
      includes_gst: false,
      gst_amount: '0',
      destination: '',
      reference_number: '',
      notes: '',
      is_manual_entry: false,
      manual_space_type: '',
      rent_for_dates: '',
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
    doc.setFillColor(255, 152, 0)
    doc.rect(0, 0, 210, 40, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.text('Spacio Workspace', 105, 20, { align: 'center' })
    doc.setFontSize(14)
    doc.setFont('helvetica', 'normal')
    doc.text(`Monthly Payment Report - ${monthName}`, 105, 30, { align: 'center' })
    doc.setTextColor(0, 0, 0)

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

    const tableData = monthlyPayments.map((payment) => {
      const customer = payment.customer as Customer
      const assignment = payment.assignment as Assignment
      const space = assignment?.space as Space
      const baseAmount = payment.amount - (payment.gst_amount || 0)
      return [
        customer?.first_name && customer?.last_name ? `${customer.first_name} ${customer.last_name}` : customer?.name || '-',
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
      headStyles: { fillColor: [255, 152, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 247, 237] },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 30 }, 2: { cellWidth: 25 }, 3: { cellWidth: 25 }, 4: { cellWidth: 25 }, 5: { cellWidth: 30 }, 6: { cellWidth: 35 } },
    })

    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(128, 128, 128)
      doc.text(`Page ${i} of ${pageCount} | Generated on ${new Date().toLocaleDateString('en-US')}`, 105, 287, { align: 'center' })
    }

    doc.save(`Spacio-Workspace-Monthly-Report-${monthName.replace(' ', '-')}.pdf`)
  }

  if (loading) return <div className="p-8 text-center animate-pulse">Loading...</div>

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-orange-700 bg-clip-text text-transparent">Payments</h2>
          <p className="text-sm text-gray-500 mt-1">Manage and track all payments</p>
        </div>
        <div className="flex space-x-3">
          <button onClick={generateMonthlyPDF} className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-2 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 hover:scale-105 shadow-md font-semibold flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Generate Monthly PDF
          </button>
          <button
            onClick={() => { setEditingPayment(null); resetForm(); setShowModal(true) }}
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-2 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 hover:scale-105 shadow-md font-semibold flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Payment
          </button>
        </div>
      </div>

      <div className="mb-4 sticky top-0 z-30 bg-white border-b border-gray-200 py-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <button type="button" onClick={() => setActiveTab('dashboard')} className={`flex-1 min-w-[140px] px-4 py-3 rounded-lg border text-sm font-semibold ${activeTab === 'dashboard' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300'}`}>Dashboard</button>
          <button type="button" onClick={() => setActiveTab('list')} className={`flex-1 min-w-[140px] px-4 py-3 rounded-lg border text-sm font-semibold ${activeTab === 'list' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300'}`}>All Payments</button>
          <button type="button" onClick={() => setActiveTab('pending')} className={`flex-1 min-w-[140px] px-4 py-3 rounded-lg border text-sm font-semibold ${activeTab === 'pending' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300'}`}>Pending</button>
          <button type="button" onClick={() => setActiveTab('reports')} className={`flex-1 min-w-[140px] px-4 py-3 rounded-lg border text-sm font-semibold ${activeTab === 'reports' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300'}`}>Reports</button>
        </div>
      </div>

      {activeTab === 'dashboard' ? (
        <div className="mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Sales Dashboard - This Month</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white"><h4 className="text-sm mb-2 opacity-90">Monthly Revenue</h4><p className="text-3xl font-bold">{formatCurrency(dashboardStats.monthlyRevenue)}</p><p className="text-sm mt-2 opacity-75">{dashboardStats.monthlyPayments} payments</p></div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white"><h4 className="text-sm mb-2 opacity-90">Net Revenue (Base)</h4><p className="text-3xl font-bold">{formatCurrency(dashboardStats.netRevenue)}</p><p className="text-sm mt-2 opacity-75">After GST deduction</p></div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white"><h4 className="text-sm mb-2 opacity-90">Total GST Collected</h4><p className="text-3xl font-bold">{formatCurrency(dashboardStats.totalGST)}</p><p className="text-sm mt-2 opacity-75">From {dashboardStats.monthlyPayments} payments</p></div>
          </div>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl border border-orange-100 p-4">
              <div className="text-xs font-semibold text-gray-500">GST Base</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(metrics.thisM.baseGST)}</div>
              <div className="text-xs text-gray-500 mt-1">From GST-included payments</div>
            </div>
            <div className="bg-white rounded-xl border border-orange-100 p-4">
              <div className="text-xs font-semibold text-gray-500">Non-GST Base</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(metrics.thisM.baseNonGST)}</div>
              <div className="text-xs text-gray-500 mt-1">From non-GST payments</div>
            </div>
            <div className="bg-white rounded-xl border border-orange-100 p-4">
              <div className="text-xs font-semibold text-gray-500">Total Base</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(metrics.thisM.base)}</div>
              <div className="text-xs text-gray-500 mt-1">GST Base + Non-GST Base</div>
            </div>
            <div className="bg-white rounded-xl border border-orange-100 p-4">
              <div className="text-xs font-semibold text-gray-500">GST</div>
              <div className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(metrics.thisM.gst)}</div>
              <div className="text-xs text-gray-500 mt-1">Collected GST</div>
            </div>
            <div className="bg-white rounded-xl border border-orange-100 p-4">
              <div className="text-xs font-semibold text-gray-500">Total</div>
              <div className="text-2xl font-bold text-orange-700 mt-1">{formatCurrency(metrics.thisM.total)}</div>
              <div className="text-xs text-gray-500 mt-1">Base + GST</div>
            </div>
          </div>

          <div className="mt-6 bg-white rounded-xl border border-orange-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-md font-bold text-gray-900">Sales Comparison</h4>
                <p className="text-sm text-gray-500">Last Month vs This Month</p>
              </div>
              <div className="text-sm text-gray-600">
                <span className="mr-4"><span className="inline-block w-3 h-3 bg-gray-300 rounded-sm mr-1"></span>Last</span>
                <span><span className="inline-block w-3 h-3 bg-orange-500 rounded-sm mr-1"></span>This</span>
              </div>
            </div>
            <div className="mt-4 h-48 flex items-end gap-8 px-6">
              <div className="flex-1 flex flex-col items-center">
                <div className="w-12 bg-gray-300 rounded-t" style={{ height: `${Math.max(8, Math.round((metrics.lastM.total / Math.max(metrics.thisM.total, metrics.lastM.total, 1)) * 160))}px` }}></div>
                <div className="mt-2 text-xs text-gray-700">Last Month</div>
                <div className="text-sm font-semibold text-gray-900">{formatCurrency(metrics.lastM.total)}</div>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <div className="w-12 bg-orange-500 rounded-t" style={{ height: `${Math.max(8, Math.round((metrics.thisM.total / Math.max(metrics.thisM.total, metrics.lastM.total, 1)) * 160))}px` }}></div>
                <div className="mt-2 text-xs text-gray-700">This Month</div>
                <div className="text-sm font-semibold text-gray-900">{formatCurrency(metrics.thisM.total)}</div>
              </div>
            </div>
          </div>
          <div className="mt-6 bg-white rounded-xl border border-orange-100 p-4">
            <h4 className="text-md font-bold text-gray-900 mb-3">Breakdown by Space Type (This Month)</h4>
            {Object.entries(monthlyBreakdown).length === 0 ? (
              <div className="text-sm text-gray-500">No payments recorded this month</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Space Type</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Payments</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Base</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">GST</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(monthlyBreakdown).map(([type, stats]) => (
                      <tr key={type}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{type}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{stats.count}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{formatCurrency(stats.base)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 font-semibold">{formatCurrency(stats.gst)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-orange-700">{formatCurrency(stats.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'pending' ? (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-orange-100">
          <div className="px-6 py-4 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Pending Payments (All Months)</h3>
                <p className="text-sm text-gray-500 mt-1">One row per pending month per assignment since start date</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={groupPendingByMonth} onChange={(e)=>setGroupPendingByMonth(e.target.checked)} className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 cursor-pointer" />
                Group by Month
              </label>
            </div>
          </div>
          <div className="p-6">
            {pendingRows.length === 0 ? (
              <div className="text-sm text-gray-500">No pending payments for this month 🎉</div>
            ) : !groupPendingByMonth ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Space</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Month</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Monthly Price</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pendingRows.map(({ a, monthKey }) => {
                      const c = customers.find((cc) => cc.id === a.customer_id)
                      const s = ((a.space as Space) || spaces.find((sp) => sp.id === a.space_id))
                      const name = c?.first_name && c?.last_name ? `${c.first_name} ${c.last_name}` : c?.name || '-'
                      return (
                        <tr key={`${a.id}-${monthKey}`} className="hover:bg-orange-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{s?.name} <span className="text-gray-400">({s?.type})</span></td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{monthKey}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{formatCurrency(a.monthly_price || s?.price_per_day || 0)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button onClick={() => startCollect(a, monthKey)} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold">Collect</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.keys(pendingGroups).sort().map((mk) => {
                  const sect = pendingGroups[mk]
                  return (
                    <div key={mk} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white flex items-center justify-between">
                        <div className="font-bold">{mk}</div>
                        <div className="text-sm opacity-90">{sect.rows.length} pending • Base {formatCurrency(sect.totals.base)} • GST {formatCurrency(sect.totals.gst)} • Total {formatCurrency(sect.totals.total)}</div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Customer</th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Space</th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Est. Base</th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Est. GST</th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Est. Total</th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Action</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {sect.rows.map(({ a, monthKey }) => {
                              const c = customers.find((cc) => cc.id === a.customer_id)
                              const s = ((a.space as Space) || spaces.find((sp) => sp.id === a.space_id))
                              const base = (a.monthly_price || s?.price_per_day || 0)
                              const gst = c?.pays_gst ? base * 0.18 : 0
                              const total = base + gst
                              const name = c?.first_name && c?.last_name ? `${c.first_name} ${c.last_name}` : c?.name || '-'
                              return (
                                <tr key={`${a.id}-${monthKey}`} className="hover:bg-orange-50">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{name}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{s?.name} <span className="text-gray-400">({s?.type})</span></td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{formatCurrency(base)}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 font-semibold">{gst ? formatCurrency(gst) : '-'}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-orange-700">{formatCurrency(total)}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <button onClick={() => startCollect(a, monthKey)} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold">Collect</button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'list' ? (
      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-orange-100">
        <div className="px-6 py-4 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white">
          <h3 className="text-lg font-bold text-gray-900">All Payments</h3>
          <p className="text-sm text-gray-500 mt-1">Complete payment history with space assignments</p>
        </div>
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Search</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Customer, space, destination, ref..."
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 placeholder:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Destination</label>
              <select value={destinationFilter} onChange={(e) => setDestinationFilter(e.target.value)} className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 font-medium">
                <option value="all">All</option>
                {destinationOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">GST</label>
              <select value={gstFilter} onChange={(e) => setGstFilter(e.target.value as any)} className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 font-medium">
                <option value="all">All</option>
                <option value="yes">Includes GST</option>
                <option value="no">No GST</option>
              </select>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Sort By</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 font-medium">
                <option value="date_desc">Date (Newest First)</option>
                <option value="date_asc">Date (Oldest First)</option>
                <option value="amount_desc">Amount (High to Low)</option>
                <option value="amount_asc">Amount (Low to High)</option>
                <option value="customer_asc">Customer (A-Z)</option>
                <option value="space_asc">Space (A-Z)</option>
                <option value="space_desc">Space (Z-A)</option>
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-sm text-gray-600">Showing <span className="font-semibold text-orange-700">{filteredPayments.length}</span> of <span className="font-semibold">{payments.length}</span> payments</p>
            </div>
          </div>
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
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Payment For</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Destination</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPayments.map((payment) => {
                const customer = payment.customer as Customer
                const assignment = payment.assignment as Assignment
                const space = assignment?.space as Space
                const baseAmount = payment.amount - (payment.gst_amount || 0)
                return (
                  <tr key={payment.id} className="hover:bg-orange-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {payment.assignment_id
                        ? (customer?.first_name && customer?.last_name
                            ? `${customer.first_name} ${customer.last_name}`
                            : customer?.name || '-')
                        : 'Day Pass'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {space ? (<div><span className="font-semibold text-orange-700">{space.name}</span><span className="text-gray-500 ml-2">({space.type})</span></div>) : (<span className="text-gray-400">-</span>)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{formatCurrency(baseAmount)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.includes_gst ? (<span className="text-green-700 font-semibold">{formatCurrency(payment.gst_amount || 0)}</span>) : (<span className="text-gray-400">-</span>)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-orange-700">{formatCurrency(payment.amount)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatDate(payment.payment_date)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{payment.payment_for_date || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">{payment.destination || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {canEdit(user) && (
                        <button onClick={() => handleEdit(payment)} className="text-orange-600 hover:text-orange-800 mr-4 transition-colors font-semibold">Edit</button>
                      )}
                      {canDelete(user) && (
                        <button onClick={() => handleDelete(payment.id)} className="text-red-600 hover:text-red-800 transition-colors font-semibold">Delete</button>
                      )}
                      {!canEdit(user) && !canDelete(user) && (<span className="text-gray-400 text-xs">View Only</span>)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      ) : activeTab === 'reports' ? (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-orange-100">
          <div className="px-6 py-4 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white">
            <h3 className="text-lg font-bold text-gray-900">Reports</h3>
            <p className="text-sm text-gray-500 mt-1">Historical payments grouped by month and year</p>
          </div>
          <div className="p-6 border-b border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Sort Months</label>
                <select value={reportsSort} onChange={(e) => setReportsSort(e.target.value as 'desc' | 'asc')} className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 font-medium">
                  <option value="desc">Newest First</option>
                  <option value="asc">Oldest First</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Sort Rows</label>
                <select value={reportsRowSort} onChange={(e) => setReportsRowSort(e.target.value as any)} className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white text-gray-900 font-medium">
                  <option value="date_asc">Date (Oldest First)</option>
                  <option value="date_desc">Date (Newest First)</option>
                  <option value="space_asc">Space (A-Z)</option>
                  <option value="space_desc">Space (Z-A)</option>
                </select>
              </div>
            </div>
          </div>
          <div className="p-6">
            {(() => {
              const groups: Record<string, Payment[]> = {}
              for (const p of payments) {
                const key = (p.payment_for_date ? p.payment_for_date.substring(0, 7) : p.payment_date.substring(0, 7))
                if (!groups[key]) groups[key] = []
                groups[key].push(p)
              }
              const nowKey = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 7)
              const thisMonthList = groups[nowKey] || []
              const thisMonthTotals = thisMonthList.reduce((acc, p) => {
                const base = p.amount - (p.gst_amount || 0)
                acc.base += base
                acc.gst += p.gst_amount || 0
                acc.total += p.amount
                return acc
              }, { base: 0, gst: 0, total: 0 })
              const otherKeys = Object.keys(groups).filter((k) => k !== nowKey)
              const months = Object.keys(groups).sort((a, b) => reportsSort === 'desc' ? b.localeCompare(a) : a.localeCompare(b))
              if (months.length === 0) return (<div className="text-sm text-gray-500">No payment history available</div>)
              return (
                <div className="space-y-6">
                  {/* This Month */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white flex items-center justify-between">
                      <div className="font-bold">This Month ({nowKey})</div>
                      <div className="text-sm opacity-90">{thisMonthList.length} payments • Base {formatCurrency(thisMonthTotals.base)} • GST {formatCurrency(thisMonthTotals.gst)} • Total {formatCurrency(thisMonthTotals.total)}</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Customer</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Space</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Base</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">GST</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Total</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Destination</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {thisMonthList
                            .slice()
                            .sort(compareReportRows)
                            .map((payment) => {
                              const customer = payment.customer as Customer
                              const assignment = payment.assignment as Assignment
                              const space = assignment?.space as Space
                              const baseAmount = payment.amount - (payment.gst_amount || 0)
                              return (
                                <tr key={payment.id} className="hover:bg-orange-50 transition-colors">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{payment.assignment_id ? (customer?.first_name && customer?.last_name ? `${customer.first_name} ${customer.last_name}` : customer?.name || '-') : 'Day Pass'}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{space ? (<div><span className="font-semibold text-orange-700">{space.name}</span><span className="text-gray-500 ml-2">({space.type})</span></div>) : (<span className="text-gray-400">-</span>)}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{formatCurrency(baseAmount)}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.includes_gst ? (<span className="text-green-700 font-semibold">{formatCurrency(payment.gst_amount || 0)}</span>) : (<span className="text-gray-400">-</span>)}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-orange-700">{formatCurrency(payment.amount)}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatDate(payment.payment_date)}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">{payment.destination || '-'}</td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* All Other Months grouped by YYYY-MM */}
                  {months.map((m) => {
                    if (m === nowKey) return null
                    const list = groups[m]
                    const totals = list.reduce((acc, p) => {
                      const base = p.amount - (p.gst_amount || 0)
                      acc.base += base
                      acc.gst += p.gst_amount || 0
                      acc.total += p.amount
                      return acc
                    }, { base: 0, gst: 0, total: 0 })
                    return (
                      <div key={m} className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white flex items-center justify-between">
                          <div className="font-bold">{m}</div>
                          <div className="text-sm opacity-90">{list.length} payments • Base {formatCurrency(totals.base)} • GST {formatCurrency(totals.gst)} • Total {formatCurrency(totals.total)}</div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Space</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Base</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">GST</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Total</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Destination</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {list
                                .slice()
                                .sort(compareReportRows)
                                .map((payment) => {
                                  const customer = payment.customer as Customer
                                  const assignment = payment.assignment as Assignment
                                  const space = assignment?.space as Space
                                  const baseAmount = payment.amount - (payment.gst_amount || 0)
                                  return (
                                    <tr key={payment.id} className="hover:bg-orange-50 transition-colors">
                                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{payment.assignment_id ? (customer?.first_name && customer?.last_name ? `${customer.first_name} ${customer.last_name}` : customer?.name || '-') : 'Day Pass'}</td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{space ? (<div><span className="font-semibold text-orange-700">{space.name}</span><span className="text-gray-500 ml-2">({space.type})</span></div>) : (<span className="text-gray-400">-</span>)}</td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{formatCurrency(baseAmount)}</td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.includes_gst ? (<span className="text-green-700 font-semibold">{formatCurrency(payment.gst_amount || 0)}</span>) : (<span className="text-gray-400">-</span>)}</td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-orange-700">{formatCurrency(payment.amount)}</td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatDate(payment.payment_date)}</td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">{payment.destination || '-'}</td>
                                    </tr>
                                  )
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      ) : null}

      {showModal && (
        <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-hidden flex flex-col animate-slide-up">
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">{editingPayment ? 'Edit Payment' : 'Add New Payment'}</h3>
                  <p className="text-orange-100 text-sm mt-1">Record payment details below</p>
                </div>
                <button onClick={() => { setShowModal(false); setEditingPayment(null); resetForm() }} className="text-white hover:bg-white/20 rounded-full p-2 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border-2 border-purple-200 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-2">Day Pass / Meeting Room Entry</h4>
                      <p className="text-sm text-gray-600">Enable manual entry for Day Pass and Meeting Room payments</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={formData.is_manual_entry} onChange={(e) => setFormData((prev) => ({ ...prev, is_manual_entry: e.target.checked, assignment_id: e.target.checked ? '' : prev.assignment_id }))} className="sr-only peer" />
                      <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>
                </div>

                {formData.is_manual_entry && (
                  <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border-2 border-purple-200 mb-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center"><span className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>Manual Entry Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Space Type <span className="text-red-500">*</span></label>
                        <select required value={formData.manual_space_type} onChange={(e) => setFormData((prev) => ({ ...prev, manual_space_type: e.target.value as 'Day Pass' | 'Meeting Room' | '' }))} className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-gray-900 font-medium">
                          <option value="">Select Type</option>
                          <option value="Day Pass">Day Pass</option>
                          <option value="Meeting Room">Meeting Room</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Amount <span className="text-red-500">*</span></label>
                        <input type="number" step="0.01" required value={formData.amount} onChange={(e) => handleAmountChange(e.target.value)} placeholder="0.00" className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white text-gray-900 placeholder:text-gray-400 font-medium" />
                      </div>
                      <div className="col-span-1 md:col-span-2 p-4 bg-white rounded-lg border-2 border-purple-200">
                        <div className="flex items-center">
                          <input type="checkbox" id="manual_includes_gst" checked={formData.includes_gst} onChange={(e) => handleGSTChange(e.target.checked, formData.amount)} className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer" />
                          <label htmlFor="manual_includes_gst" className="ml-3 text-sm font-semibold text-gray-700 cursor-pointer">Include GST (18% additional)</label>
                        </div>
                        {formData.includes_gst && (
                          <div className="mt-3 pt-3 border-t border-purple-200">
                            <div className="flex items-center justify-between"><span className="text-sm font-semibold text-gray-700">Base Amount:</span><span className="text-base font-bold text-gray-900">{formatCurrency(parseFloat(formData.amount) || 0)}</span></div>
                            <div className="flex items-center justify-between mt-2"><span className="text-sm font-semibold text-gray-700">GST (18%):</span><span className="text-base font-bold text-purple-700">{formatCurrency(parseFloat(formData.gst_amount) || 0)}</span></div>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t-2 border-purple-300"><span className="text-lg font-bold text-gray-900">Total Amount:</span><span className="text-xl font-bold text-purple-800">{formatCurrency((parseFloat(formData.amount) || 0) + (parseFloat(formData.gst_amount) || 0))}</span></div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Payment For Month <span className="text-red-500">*</span></label>
                        <input
                          type="month"
                          required
                          value={formData.payment_for_month || new Date().toISOString().slice(0, 7)}
                          onChange={(e) => setFormData((prev) => ({ ...prev, payment_for_month: e.target.value }))}
                          className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-purple-400 text-gray-900"
                        />
                        <div className="flex items-center pt-1">
                          <input id="late-month-manual" type="checkbox" checked={isLateMonth} onChange={(e) => setIsLateMonth(e.target.checked)} className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer" />
                          <label htmlFor="late-month-manual" className="ml-2 text-sm text-gray-700 font-medium cursor-pointer">Late payment (previous month)</label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Payment Destination <span className="text-red-500">*</span></label>
                        <select required value={formData.destination || ''} onChange={(e) => setFormData((prev) => ({ ...prev, destination: e.target.value }))} className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-purple-400 text-gray-900 font-medium">
                          <option value="">Select Payment Destination</option>
                          {destinationOptions.map((option) => (<option key={option} value={option}>{option}</option>))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {!formData.is_manual_entry && (
                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center"><span className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>Select Assignment</h4>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Assignment (Space) <span className="text-red-500">*</span></label>
                        <select required value={formData.assignment_id} onChange={(e) => handleAssignmentChange(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 text-gray-900 font-medium">
                          <option value="">Select Assignment</option>
                          {filteredAssignmentsByMonth.map((assignment) => {
                            const customer = (assignment.customer as Customer) || customers.find((c) => c.id === assignment.customer_id)
                            const customerName = customer?.first_name && customer?.last_name ? `${customer.first_name} ${customer.last_name}` : customer?.name || 'Customer'
                            const space = (assignment.space as Space) || spaces.find((s) => s.id === assignment.space_id)
                            return (<option key={assignment.id} value={assignment.id}>{space?.name || 'Space'} ({space?.type || 'N/A'}) - {customerName}</option>)
                          })}
                        </select>
                      </div>
                      {selectedAssignment && selectedSpace && selectedCustomer && (
                        <div className="mt-2 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><p className="text-xs text-gray-500 mb-1 font-medium">Customer</p><p className="text-base font-bold text-green-900">{selectedCustomer.first_name && selectedCustomer.last_name ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}` : selectedCustomer.name || '-'}</p></div>
                            <div><p className="text-xs text-gray-500 mb-1 font-medium">Allocated Space</p><p className="text-base font-bold text-green-900">{selectedSpace.name} ({selectedSpace.type})</p></div>
                            <div><p className="text-xs text-gray-500 mb-1 font-medium">Monthly Price</p><p className="text-base font-bold text-green-900">{formatCurrency(selectedAssignment.monthly_price || selectedSpace.price_per_day)}</p></div>
                            {(selectedAssignment as any).payment_destination && (<div><p className="text-xs text-gray-500 mb-1 font-medium">Payment Destination</p><p className="text-base font-bold text-green-900">{(selectedAssignment as any).payment_destination}</p></div>)}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
                )}

                {(!formData.is_manual_entry && selectedSpace && getBillingCycle(selectedSpace.type) === 'daily') && (
                  <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border-2 border-purple-200">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center"><span className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>Daily Rent Details</h4>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Rent For Date(s) <span className="text-red-500">*</span></label>
                        <input type="text" required value={formData.rent_for_dates} onChange={(e) => setFormData((prev) => ({ ...prev, rent_for_dates: e.target.value }))} placeholder="e.g., 2024-01-15 or 2024-01-15, 2024-01-16" className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-purple-400 text-gray-900 placeholder:text-gray-400 font-medium" />
                      </div>
                      <div className="p-4 bg-white rounded-lg border-2 border-purple-200">
                        <div className="flex items-center">
                          <input type="checkbox" id="daily_includes_gst" checked={formData.includes_gst} onChange={(e) => handleGSTChange(e.target.checked, formData.amount)} className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer" />
                          <label htmlFor="daily_includes_gst" className="ml-3 text-sm font-semibold text-gray-700 cursor-pointer">Include GST (18% additional)</label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Payment Destination <span className="text-red-500">*</span></label>
                        <select required value={formData.destination || ''} onChange={(e) => setFormData((prev) => ({ ...prev, destination: e.target.value }))} className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white hover:border-purple-400 text-gray-900 font-medium">
                          <option value="">Select Payment Destination</option>
                          {destinationOptions.map((option) => (<option key={option} value={option}>{option}</option>))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {(!selectedSpace || getBillingCycle(selectedSpace.type) !== 'daily') && (
                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center"><span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>Payment Amount</h4>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Base Amount (Monthly Price) <span className="text-red-500">*</span></label>
                        <input type="number" step="0.01" required value={formData.amount} onChange={(e) => handleAmountChange(e.target.value)} placeholder="0.00" className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400 text-lg font-semibold" />
                        {selectedAssignment && selectedSpace && (<p className="text-xs text-blue-600 mt-1 font-medium">✓ Auto-filled from assignment ({formatCurrency(selectedAssignment.monthly_price || selectedSpace.price_per_day || 0)}). You can modify if needed.</p>)}
                        {!selectedAssignment && (<p className="text-xs text-gray-500 mt-1">Select an assignment to auto-fill the amount</p>)}
                      </div>
                      <div className="flex items-center p-4 bg-white rounded-lg border-2 border-gray-200">
                        <input type="checkbox" id="includes_gst" checked={formData.includes_gst} onChange={(e) => handleGSTChange(e.target.checked, formData.amount)} className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500 cursor-pointer" disabled={selectedCustomer?.pays_gst === true} />
                        <label htmlFor="includes_gst" className={`ml-3 text-sm font-semibold text-gray-700 cursor-pointer ${selectedCustomer?.pays_gst === true ? 'opacity-60' : ''}`}>Customer Pays GST (18% additional){selectedCustomer?.pays_gst === true && (<span className="ml-2 text-xs text-green-600">(Auto-enabled for this customer)</span>)}</label>
                      </div>
                      {formData.includes_gst && (
                        <div className="space-y-3 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
                          <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-700">GST Amount (18%)</label>
                            <input type="number" step="0.01" value={formData.gst_amount} readOnly className="w-full px-4 py-3 border-2 border-green-300 rounded-lg bg-white text-gray-900 font-semibold text-green-700 text-lg" />
                          </div>
                          <div className="pt-3 border-t-2 border-green-200">
                            <div className="flex items-center justify-between"><span className="text-sm font-semibold text-gray-700">Base Amount:</span><span className="text-base font-semibold text-gray-900">{formatCurrency(parseFloat(formData.amount) || 0)}</span></div>
                            <div className="flex items-center justify-between mt-2"><span className="text-sm font-semibold text-gray-700">GST (18%):</span><span className="text-base font-semibold text-green-700">{formatCurrency(parseFloat(formData.gst_amount) || 0)}</span></div>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t-2 border-green-300"><span className="text-lg font-bold text-gray-900">Total Amount:</span><span className="text-xl font-bold text-green-800">{formatCurrency((parseFloat(formData.amount) || 0) + (parseFloat(formData.gst_amount) || 0))}</span></div>
                          </div>
                        </div>
                      )}
                      {!formData.includes_gst && formData.amount && (
                        <div className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                          <div className="flex items-center justify-between"><span className="text-sm font-semibold text-gray-700">Total Amount:</span><span className="text-lg font-bold text-gray-900">{formatCurrency(parseFloat(formData.amount) || 0)}</span></div>
                          <p className="text-xs text-gray-500 mt-2">No GST applied</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(!selectedSpace || getBillingCycle(selectedSpace.type) !== 'daily') && (
                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center"><span className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>Date & Destination</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Payment Date <span className="text-red-500">*</span></label>
                        <input type="date" required value={formData.payment_date || new Date().toISOString().split('T')[0]} onChange={(e) => setFormData((prev) => ({ ...prev, payment_date: e.target.value }))} className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 text-gray-900" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Payment For Month <span className="text-red-500">*</span></label>
                        <input type="month" required value={formData.payment_for_month || new Date().toISOString().slice(0, 7)} onChange={(e) => setFormData((prev) => ({ ...prev, payment_for_month: e.target.value }))} className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 text-gray-900" />
                        <div className="flex items-center pt-1">
                          <input id="late-month" type="checkbox" checked={isLateMonth} onChange={(e) => setIsLateMonth(e.target.checked)} className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 cursor-pointer" />
                          <label htmlFor="late-month" className="ml-2 text-sm text-gray-700 font-medium cursor-pointer">Late payment (previous month)</label>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Payment Destination <span className="text-red-500">*</span></label>
                      <select required value={formData.destination || ''} onChange={(e) => setFormData((prev) => ({ ...prev, destination: e.target.value }))} className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 text-gray-900 font-medium">
                        <option value="">Select Payment Destination</option>
                        {destinationOptions.map((option) => (<option key={option} value={option}>{option}</option>))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center"><span className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">{selectedSpace && getBillingCycle(selectedSpace.type) === 'daily' ? '5' : '4'}</span>Additional Information</h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Reference Number</label>
                      <input type="text" value={formData.reference_number} onChange={(e) => setFormData((prev) => ({ ...prev, reference_number: e.target.value }))} placeholder="Transaction/Reference number" className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 text-gray-900 placeholder:text-gray-400" />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Notes</label>
                      <textarea value={formData.notes} onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Add any additional notes..." className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 resize-none text-gray-900 placeholder:text-gray-400" rows={3} />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-6 border-t-2 border-gray-200">
                  <button type="button" onClick={() => { setShowModal(false); setEditingPayment(null); resetForm() }} className="px-8 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold text-gray-700">Cancel</button>
                  <button type="submit" className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all duration-200 hover:scale-105 shadow-lg font-semibold flex items-center">
                    {editingPayment ? (<><svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Update Payment</>) : (<><svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Create Payment</>)}
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
