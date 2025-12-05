'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { exportToCSV } from '@/lib/export'

type ReportType = 
  | 'profit-loss'
  | 'balance-sheet'
  | 'cash-flow'
  | 'accounts-receivable'
  | 'tax-report'
  | 'aging-report'
  | 'revenue-by-customer'
  | 'revenue-by-space'
  | 'expense-report'

export default function Reports() {
  const [activeTab, setActiveTab] = useState<ReportType>('profit-loss')
  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  })
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<any>(null)

  useEffect(() => {
    generateReport()
  }, [activeTab, dateRange])

  const generateReport = async () => {
    setLoading(true)
    try {
      const fromDate = dateRange.from
      const toDate = new Date(dateRange.to)
      toDate.setHours(23, 59, 59, 999)
      const toDateStr = toDate.toISOString().split('T')[0]

      switch (activeTab) {
        case 'profit-loss':
          await generateProfitLossReport(fromDate, toDateStr)
          break
        case 'balance-sheet':
          await generateBalanceSheetReport()
          break
        case 'cash-flow':
          await generateCashFlowReport(fromDate, toDateStr)
          break
        case 'accounts-receivable':
          await generateAccountsReceivableReport()
          break
        case 'tax-report':
          await generateTaxReport(fromDate, toDateStr)
          break
        case 'aging-report':
          await generateAgingReport()
          break
        case 'revenue-by-customer':
          await generateRevenueByCustomerReport(fromDate, toDateStr)
          break
        case 'revenue-by-space':
          await generateRevenueBySpaceReport(fromDate, toDateStr)
          break
        case 'expense-report':
          await generateExpenseReport(fromDate, toDateStr)
          break
      }
    } catch (error: any) {
      alert('Error generating report: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const generateProfitLossReport = async (from: string, to: string) => {
    const [paymentsResult, expensesResult] = await Promise.all([
      supabase
        .from('payments')
        .select('amount, includes_gst, gst_amount, payment_date')
        .gte('payment_date', from)
        .lte('payment_date', to),
      supabase
        .from('expenses')
        .select('amount, includes_gst, gst_amount, date, category')
        .gte('date', from)
        .lte('date', to),
    ])

    const payments = paymentsResult.data || []
    const expenses = expensesResult.data || []

    const revenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const revenueBase = payments.reduce((sum, p) => {
      if (p.includes_gst) {
        return sum + (p.amount || 0) - (p.gst_amount || 0)
      }
      return sum + (p.amount || 0)
    }, 0)
    const revenueGST = payments.reduce((sum, p) => sum + (p.gst_amount || 0), 0)

    const expensesTotal = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
    const expensesBase = expenses.reduce((sum, e) => {
      if (e.includes_gst) {
        return sum + (e.amount || 0) - (e.gst_amount || 0)
      }
      return sum + (e.amount || 0)
    }, 0)
    const expensesGST = expenses.reduce((sum, e) => sum + (e.gst_amount || 0), 0)

    const expensesByCategory = expenses.reduce((acc: any, e: any) => {
      const cat = e.category || 'Uncategorized'
      if (!acc[cat]) acc[cat] = { base: 0, gst: 0, total: 0 }
      const base = e.includes_gst ? (e.amount || 0) - (e.gst_amount || 0) : (e.amount || 0)
      acc[cat].base += base
      acc[cat].gst += e.includes_gst ? (e.gst_amount || 0) : 0
      acc[cat].total += e.amount || 0
      return acc
    }, {})

    const grossProfit = revenueBase - expensesBase
    const netProfit = revenue - expensesTotal
    const netGST = revenueGST - expensesGST

    setReportData({
      type: 'profit-loss',
      period: { from, to },
      revenue: { total: revenue, base: revenueBase, gst: revenueGST },
      expenses: { total: expensesTotal, base: expensesBase, gst: expensesGST, byCategory: expensesByCategory },
      grossProfit,
      netProfit,
      netGST,
    })
  }

  const generateBalanceSheetReport = async () => {
    const [assignmentsResult, paymentsResult, expensesResult] = await Promise.all([
      supabase
        .from('assignments')
        .select('security_deposit, status')
        .eq('status', 'active'),
      supabase.from('payments').select('amount'),
      supabase.from('expenses').select('amount'),
    ])

    const activeAssignments = assignmentsResult.data || []
    const allPayments = paymentsResult.data || []
    const allExpenses = expensesResult.data || []

    const securityDeposits = activeAssignments.reduce((sum, a) => sum + (Number(a.security_deposit) || 0), 0)
    const totalRevenue = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const totalExpenses = allExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
    const retainedEarnings = totalRevenue - totalExpenses

    setReportData({
      type: 'balance-sheet',
      assets: {
        securityDeposits,
        cash: retainedEarnings > 0 ? retainedEarnings : 0,
      },
      liabilities: {},
      equity: {
        retainedEarnings,
      },
    })
  }

  const generateCashFlowReport = async (from: string, to: string) => {
    const [paymentsResult, expensesResult] = await Promise.all([
      supabase
        .from('payments')
        .select('amount, payment_date, destination')
        .gte('payment_date', from)
        .lte('payment_date', to)
        .order('payment_date'),
      supabase
        .from('expenses')
        .select('amount, date, destination')
        .gte('date', from)
        .lte('date', to)
        .order('date'),
    ])

    const payments = paymentsResult.data || []
    const expenses = expensesResult.data || []

    const cashInflows = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const cashOutflows = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
    const netCashFlow = cashInflows - cashOutflows

    const inflowsByDestination = payments.reduce((acc: any, p: any) => {
      const dest = p.destination || 'Not Specified'
      acc[dest] = (acc[dest] || 0) + (p.amount || 0)
      return acc
    }, {})

    const outflowsByDestination = expenses.reduce((acc: any, e: any) => {
      const dest = e.destination || 'Not Specified'
      acc[dest] = (acc[dest] || 0) + (e.amount || 0)
      return acc
    }, {})

    setReportData({
      type: 'cash-flow',
      period: { from, to },
      cashInflows,
      cashOutflows,
      netCashFlow,
      inflowsByDestination,
      outflowsByDestination,
      transactions: [
        ...payments.map((p: any) => ({ type: 'inflow', date: p.payment_date, amount: p.amount, description: `Payment - ${p.destination || 'N/A'}` })),
        ...expenses.map((e: any) => ({ type: 'outflow', date: e.date, amount: -e.amount, description: `Expense - ${e.destination || 'N/A'}` })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    })
  }

  const generateAccountsReceivableReport = async () => {
    const [assignmentsResult, paymentsResult] = await Promise.all([
      supabase
        .from('assignments')
        .select(`
          *,
          customer:customers(*),
          space:spaces(*)
        `)
        .eq('status', 'active'),
      supabase.from('payments').select('assignment_id, amount, payment_for_date'),
    ])

    const assignments = assignmentsResult.data || []
    const payments = paymentsResult.data || []

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const receivables = assignments
      .filter((a: any) => {
        const space = a.space
        return space && space.type !== 'Virtual Office'
      })
      .map((assignment: any) => {
        const space = assignment.space
        const customer = assignment.customer
        const monthlyPrice = assignment.monthly_price || space?.price_per_day || 0
        const includesGST = assignment.includes_gst || false
        const baseAmount = monthlyPrice
        const gstAmount = includesGST ? baseAmount * 0.18 : 0
        const totalAmount = baseAmount + gstAmount

        const hasPayment = payments.some(
          (p: any) =>
            p.assignment_id === assignment.id &&
            (p.payment_for_date || '').slice(0, 7) === currentMonth
        )

        return {
          customer: customer?.first_name && customer?.last_name
            ? `${customer.first_name} ${customer.last_name}`
            : customer?.name || '-',
          space: space?.name || '-',
          monthlyPrice: baseAmount,
          gstAmount,
          totalAmount,
          hasPayment,
          assignmentId: assignment.id,
        }
      })
      .filter((r: any) => !r.hasPayment)

    const totalReceivable = receivables.reduce((sum, r) => sum + r.totalAmount, 0)

    setReportData({
      type: 'accounts-receivable',
      receivables,
      totalReceivable,
      count: receivables.length,
    })
  }

  const generateTaxReport = async (from: string, to: string) => {
    const [paymentsResult, expensesResult] = await Promise.all([
      supabase
        .from('payments')
        .select('amount, includes_gst, gst_amount, payment_date')
        .gte('payment_date', from)
        .lte('payment_date', to),
      supabase
        .from('expenses')
        .select('amount, includes_gst, gst_amount, date, category')
        .gte('date', from)
        .lte('date', to),
    ])

    const payments = paymentsResult.data || []
    const expenses = expensesResult.data || []

    const gstCollected = payments.reduce((sum, p) => sum + (p.gst_amount || 0), 0)
    const gstPaid = expenses.reduce((sum, e) => sum + (e.gst_amount || 0), 0)
    const gstPayable = gstCollected - gstPaid

    const gstByMonth = payments.reduce((acc: any, p: any) => {
      const month = (p.payment_date || '').slice(0, 7)
      if (!acc[month]) acc[month] = 0
      acc[month] += p.gst_amount || 0
      return acc
    }, {})

    setReportData({
      type: 'tax-report',
      period: { from, to },
      gstCollected,
      gstPaid,
      gstPayable,
      gstByMonth,
    })
  }

  const generateAgingReport = async () => {
    const [assignmentsResult, paymentsResult] = await Promise.all([
      supabase
        .from('assignments')
        .select(`
          *,
          customer:customers(*),
          space:spaces(*)
        `)
        .eq('status', 'active'),
      supabase.from('payments').select('assignment_id, payment_for_date, amount'),
    ])

    const assignments = assignmentsResult.data || []
    const payments = paymentsResult.data || []
    const now = new Date()

    const aging = assignments
      .filter((a: any) => a.space?.type !== 'Virtual Office')
      .map((assignment: any) => {
        const customer = assignment.customer
        const space = assignment.space
        const monthlyPrice = assignment.monthly_price || space?.price_per_day || 0
        const includesGST = assignment.includes_gst || false
        const baseAmount = monthlyPrice
        const gstAmount = includesGST ? baseAmount * 0.18 : 0
        const totalAmount = baseAmount + gstAmount

        const lastPayment = payments
          .filter((p: any) => p.assignment_id === assignment.id)
          .sort((a: any, b: any) => new Date(b.payment_for_date).getTime() - new Date(a.payment_for_date).getTime())[0]

        const lastPaymentDate = lastPayment ? new Date(lastPayment.payment_for_date) : new Date(assignment.start_date)
        const daysOverdue = Math.floor((now.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24))

        let ageBucket = 'Current'
        if (daysOverdue > 90) ageBucket = '90+ Days'
        else if (daysOverdue > 60) ageBucket = '61-90 Days'
        else if (daysOverdue > 30) ageBucket = '31-60 Days'
        else if (daysOverdue > 0) ageBucket = '1-30 Days'

        return {
          customer: customer?.first_name && customer?.last_name
            ? `${customer.first_name} ${customer.last_name}`
            : customer?.name || '-',
          space: space?.name || '-',
          amount: totalAmount,
          lastPaymentDate: lastPaymentDate.toISOString().split('T')[0],
          daysOverdue,
          ageBucket,
        }
      })

    const agingSummary = aging.reduce((acc: any, item: any) => {
      if (!acc[item.ageBucket]) acc[item.ageBucket] = 0
      acc[item.ageBucket] += item.amount
      return acc
    }, {})

    setReportData({
      type: 'aging-report',
      aging,
      agingSummary,
      totalReceivable: aging.reduce((sum, a) => sum + a.amount, 0),
    })
  }

  const generateRevenueByCustomerReport = async (from: string, to: string) => {
    const { data: payments } = await supabase
      .from('payments')
      .select(`
        amount,
        includes_gst,
        gst_amount,
        customer:customers(*)
      `)
      .gte('payment_date', from)
      .lte('payment_date', to)

    const revenueByCustomer = (payments || []).reduce((acc: any, p: any) => {
      const customer = p.customer
      const customerName = customer?.first_name && customer?.last_name
        ? `${customer.first_name} ${customer.last_name}`
        : customer?.name || 'Unknown'
      const customerId = customer?.id || 'unknown'

      if (!acc[customerId]) {
        acc[customerId] = {
          name: customerName,
          base: 0,
          gst: 0,
          total: 0,
          count: 0,
        }
      }

      const base = p.includes_gst ? (p.amount || 0) - (p.gst_amount || 0) : (p.amount || 0)
      acc[customerId].base += base
      acc[customerId].gst += p.gst_amount || 0
      acc[customerId].total += p.amount || 0
      acc[customerId].count += 1

      return acc
    }, {})

    const customerList = Object.values(revenueByCustomer).sort((a: any, b: any) => b.total - a.total)

    setReportData({
      type: 'revenue-by-customer',
      period: { from, to },
      customers: customerList,
      totalRevenue: customerList.reduce((sum: number, c: any) => sum + c.total, 0),
    })
  }

  const generateRevenueBySpaceReport = async (from: string, to: string) => {
    const { data: payments } = await supabase
      .from('payments')
      .select(`
        amount,
        includes_gst,
        gst_amount,
        assignment:assignments(space:spaces(*))
      `)
      .gte('payment_date', from)
      .lte('payment_date', to)

    const revenueBySpace = (payments || []).reduce((acc: any, p: any) => {
      const space = p.assignment?.space
      const spaceName = space?.name || 'Unassigned'
      const spaceId = space?.id || 'unassigned'

      if (!acc[spaceId]) {
        acc[spaceId] = {
          name: spaceName,
          type: space?.type || '-',
          base: 0,
          gst: 0,
          total: 0,
          count: 0,
        }
      }

      const base = p.includes_gst ? (p.amount || 0) - (p.gst_amount || 0) : (p.amount || 0)
      acc[spaceId].base += base
      acc[spaceId].gst += p.gst_amount || 0
      acc[spaceId].total += p.amount || 0
      acc[spaceId].count += 1

      return acc
    }, {})

    const spaceList = Object.values(revenueBySpace).sort((a: any, b: any) => b.total - a.total)

    setReportData({
      type: 'revenue-by-space',
      period: { from, to },
      spaces: spaceList,
      totalRevenue: spaceList.reduce((sum: number, s: any) => sum + s.total, 0),
    })
  }

  const generateExpenseReport = async (from: string, to: string) => {
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })

    const expensesByCategory = (expenses || []).reduce((acc: any, e: any) => {
      const cat = e.category || 'Uncategorized'
      if (!acc[cat]) {
        acc[cat] = { base: 0, gst: 0, total: 0, count: 0 }
      }
      const base = e.includes_gst ? (e.amount || 0) - (e.gst_amount || 0) : (e.amount || 0)
      acc[cat].base += base
      acc[cat].gst += e.gst_amount || 0
      acc[cat].total += e.amount || 0
      acc[cat].count += 1
      return acc
    }, {})

    setReportData({
      type: 'expense-report',
      period: { from, to },
      expenses: expenses || [],
      expensesByCategory,
      totalExpenses: (expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0),
    })
  }

  const exportToPDF = () => {
    if (!reportData) return

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    
    // Header
    doc.setFillColor(244, 127, 37)
    doc.rect(0, 0, pageWidth, 40, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('Spacio Workspace', 14, 20)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.text(getReportTitle(), 14, 32)

    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    let yPos = 50

    switch (reportData.type) {
      case 'profit-loss':
        doc.setFont('helvetica', 'bold')
        doc.text('Profit & Loss Statement', 14, yPos)
        yPos += 10
        doc.setFont('helvetica', 'normal')
        doc.text(`Period: ${formatDate(reportData.period.from)} to ${formatDate(reportData.period.to)}`, 14, yPos)
        yPos += 15

        doc.setFont('helvetica', 'bold')
        doc.text('Revenue', 14, yPos)
        yPos += 8
        doc.setFont('helvetica', 'normal')
        doc.text(`Total Revenue: ${formatCurrency(reportData.revenue.total)}`, 20, yPos)
        yPos += 6
        doc.text(`Base Revenue: ${formatCurrency(reportData.revenue.base)}`, 20, yPos)
        yPos += 6
        doc.text(`GST Collected: ${formatCurrency(reportData.revenue.gst)}`, 20, yPos)
        yPos += 10

        doc.setFont('helvetica', 'bold')
        doc.text('Expenses', 14, yPos)
        yPos += 8
        doc.setFont('helvetica', 'normal')
        doc.text(`Total Expenses: ${formatCurrency(reportData.expenses.total)}`, 20, yPos)
        yPos += 6
        doc.text(`Base Expenses: ${formatCurrency(reportData.expenses.base)}`, 20, yPos)
        yPos += 6
        doc.text(`GST Paid: ${formatCurrency(reportData.expenses.gst)}`, 20, yPos)
        yPos += 10

        doc.setFont('helvetica', 'bold')
        doc.text(`Net Profit: ${formatCurrency(reportData.netProfit)}`, 14, yPos)
        yPos += 6
        doc.text(`Net GST Payable: ${formatCurrency(reportData.netGST)}`, 14, yPos)
        break

      case 'tax-report':
        doc.setFont('helvetica', 'bold')
        doc.text('GST Tax Report', 14, yPos)
        yPos += 10
        doc.setFont('helvetica', 'normal')
        doc.text(`Period: ${formatDate(reportData.period.from)} to ${formatDate(reportData.period.to)}`, 14, yPos)
        yPos += 15
        doc.text(`GST Collected: ${formatCurrency(reportData.gstCollected)}`, 14, yPos)
        yPos += 8
        doc.text(`GST Paid: ${formatCurrency(reportData.gstPaid)}`, 14, yPos)
        yPos += 8
        doc.setFont('helvetica', 'bold')
        doc.text(`Net GST Payable: ${formatCurrency(reportData.gstPayable)}`, 14, yPos)
        break

      // Add more cases as needed
    }

    doc.save(`${getReportTitle()}-${new Date().toISOString().split('T')[0]}.pdf`)
  }

  const exportToExcel = () => {
    if (!reportData) return

    let csvData: any[] = []
    let filename = ''

    switch (reportData.type) {
      case 'profit-loss':
        filename = 'Profit-Loss-Report'
        csvData = [
          ['Profit & Loss Statement'],
          [`Period: ${formatDate(reportData.period.from)} to ${formatDate(reportData.period.to)}`],
          [],
          ['Revenue'],
          ['Total Revenue', formatCurrency(reportData.revenue.total)],
          ['Base Revenue', formatCurrency(reportData.revenue.base)],
          ['GST Collected', formatCurrency(reportData.revenue.gst)],
          [],
          ['Expenses'],
          ['Total Expenses', formatCurrency(reportData.expenses.total)],
          ['Base Expenses', formatCurrency(reportData.expenses.base)],
          ['GST Paid', formatCurrency(reportData.expenses.gst)],
          [],
          ['Net Profit', formatCurrency(reportData.netProfit)],
          ['Net GST Payable', formatCurrency(reportData.netGST)],
        ]
        break

      case 'revenue-by-customer':
        filename = 'Revenue-By-Customer'
        csvData = [
          ['Customer', 'Base Amount', 'GST', 'Total Revenue', 'Payments'],
          ...reportData.customers.map((c: any) => [
            c.name,
            formatCurrency(c.base),
            formatCurrency(c.gst),
            formatCurrency(c.total),
            c.count,
          ]),
          ['Total', '', '', formatCurrency(reportData.totalRevenue), ''],
        ]
        break

      // Add more cases
    }

    // Convert to CSV format
    const csvContent = csvData.map(row => row.map((cell: any) => {
      const str = String(cell)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getReportTitle = () => {
    const titles: Record<ReportType, string> = {
      'profit-loss': 'Profit & Loss Statement',
      'balance-sheet': 'Balance Sheet',
      'cash-flow': 'Cash Flow Statement',
      'accounts-receivable': 'Accounts Receivable',
      'tax-report': 'GST Tax Report',
      'aging-report': 'Aging Report',
      'revenue-by-customer': 'Revenue by Customer',
      'revenue-by-space': 'Revenue by Space',
      'expense-report': 'Expense Report',
    }
    return titles[activeTab]
  }

  const renderReport = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
        </div>
      )
    }

    if (!reportData) return null

    switch (reportData.type) {
      case 'profit-loss':
        return (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-orange-50 to-white rounded-xl p-6 border-2 border-orange-100">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Revenue</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-orange-700">{formatCurrency(reportData.revenue.total)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Base Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(reportData.revenue.base)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">GST Collected</p>
                  <p className="text-2xl font-bold text-green-700">{formatCurrency(reportData.revenue.gst)}</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-50 to-white rounded-xl p-6 border-2 border-red-100">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Expenses</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Expenses</p>
                  <p className="text-2xl font-bold text-red-700">{formatCurrency(reportData.expenses.total)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Base Expenses</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(reportData.expenses.base)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">GST Paid</p>
                  <p className="text-2xl font-bold text-orange-700">{formatCurrency(reportData.expenses.gst)}</p>
                </div>
              </div>

              {Object.keys(reportData.expenses.byCategory || {}).length > 0 && (
                <div className="mt-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Expenses by Category</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Base</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">GST</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {Object.entries(reportData.expenses.byCategory).map(([cat, data]: [string, any]) => (
                          <tr key={cat} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{cat}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(data.base)}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(data.gst)}</td>
                            <td className="px-4 py-3 text-sm text-right font-bold text-red-700">{formatCurrency(data.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gradient-to-br from-green-50 to-white rounded-xl p-6 border-2 border-green-100">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Gross Profit</p>
                  <p className="text-2xl font-bold text-green-700">{formatCurrency(reportData.grossProfit)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Net Profit</p>
                  <p className="text-2xl font-bold text-blue-700">{formatCurrency(reportData.netProfit)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Net GST Payable</p>
                  <p className="text-2xl font-bold text-orange-700">{formatCurrency(reportData.netGST)}</p>
                </div>
              </div>
            </div>
          </div>
        )

      case 'tax-report':
        return (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-6 border-2 border-blue-100">
              <h3 className="text-xl font-bold text-gray-900 mb-4">GST Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">GST Collected</p>
                  <p className="text-2xl font-bold text-green-700">{formatCurrency(reportData.gstCollected)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">GST Paid</p>
                  <p className="text-2xl font-bold text-red-700">{formatCurrency(reportData.gstPaid)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Net GST Payable</p>
                  <p className="text-2xl font-bold text-orange-700">{formatCurrency(reportData.gstPayable)}</p>
                </div>
              </div>
            </div>
          </div>
        )

      case 'revenue-by-customer':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-white">
                <h3 className="text-xl font-bold text-gray-900">Revenue by Customer</h3>
                <p className="text-sm text-gray-600 mt-1">Total: {formatCurrency(reportData.totalRevenue)}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-orange-500 to-orange-600">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Customer</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase">Base Amount</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase">GST</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase">Total Revenue</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase">Payments</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.customers.map((c: any, idx: number) => (
                      <tr key={idx} className="hover:bg-orange-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{c.name}</td>
                        <td className="px-6 py-4 text-sm text-right text-gray-900">{formatCurrency(c.base)}</td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">{formatCurrency(c.gst)}</td>
                        <td className="px-6 py-4 text-sm text-right font-bold text-orange-700">{formatCurrency(c.total)}</td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">Total</td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                        {formatCurrency(reportData.customers.reduce((sum: number, c: any) => sum + c.base, 0))}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                        {formatCurrency(reportData.customers.reduce((sum: number, c: any) => sum + c.gst, 0))}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-orange-700">
                        {formatCurrency(reportData.totalRevenue)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                        {reportData.customers.reduce((sum: number, c: any) => sum + c.count, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )

      case 'accounts-receivable':
        return (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-orange-50 to-white rounded-xl p-6 border-2 border-orange-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Accounts Receivable</h3>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Total Receivable</p>
                  <p className="text-2xl font-bold text-orange-700">{formatCurrency(reportData.totalReceivable)}</p>
                  <p className="text-sm text-gray-500 mt-1">{reportData.count} pending payments</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-orange-500 to-orange-600">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Space</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase">Base Amount</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase">GST</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.receivables.map((r: any, idx: number) => (
                      <tr key={idx} className="hover:bg-orange-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{r.customer}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{r.space}</td>
                        <td className="px-6 py-4 text-sm text-right text-gray-900">{formatCurrency(r.monthlyPrice)}</td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">{formatCurrency(r.gstAmount)}</td>
                        <td className="px-6 py-4 text-sm text-right font-bold text-orange-700">{formatCurrency(r.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )

      default:
        return <div className="text-center py-10 text-gray-500">Report data not available</div>
    }
  }

  const tabs: { id: ReportType; label: string; icon: string }[] = [
    { id: 'profit-loss', label: 'Profit & Loss', icon: '📊' },
    { id: 'balance-sheet', label: 'Balance Sheet', icon: '📋' },
    { id: 'cash-flow', label: 'Cash Flow', icon: '💸' },
    { id: 'accounts-receivable', label: 'Accounts Receivable', icon: '💰' },
    { id: 'tax-report', label: 'Tax Report', icon: '🧾' },
    { id: 'aging-report', label: 'Aging Report', icon: '⏰' },
    { id: 'revenue-by-customer', label: 'Revenue by Customer', icon: '👥' },
    { id: 'revenue-by-space', label: 'Revenue by Space', icon: '🏢' },
    { id: 'expense-report', label: 'Expense Report', icon: '💳' },
  ]

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-orange-700 bg-clip-text text-transparent">
            Financial Reports
          </h2>
          <p className="text-sm text-gray-500 mt-1">Comprehensive financial analysis and reporting</p>
        </div>
        {reportData && (
          <div className="flex gap-3">
            <button
              onClick={exportToPDF}
              className="bg-gradient-to-r from-orange-600 to-orange-700 text-white px-5 py-2 rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all duration-200 shadow-md font-semibold flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export PDF
            </button>
            <button
              onClick={exportToExcel}
              className="bg-gradient-to-r from-green-600 to-green-700 text-white px-5 py-2 rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-md font-semibold flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Excel
            </button>
          </div>
        )}
      </div>

      {/* Date Range Selector */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-orange-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">From Date</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">To Date</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-lg border border-orange-100 mb-6 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-4 font-semibold text-sm transition-all whitespace-nowrap border-b-2 ${
                activeTab === tab.id
                  ? 'border-orange-600 text-orange-600 bg-orange-50'
                  : 'border-transparent text-gray-600 hover:text-orange-600 hover:bg-gray-50'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Report Content */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        {renderReport()}
      </div>
    </div>
  )
}

