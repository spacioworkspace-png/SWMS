'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalSpaces: 0,
    availableSpaces: 0,
    occupiedSpaces: 0,
    vacantValue: 0,
    totalCustomers: 0,
    activeAssignments: 0,
    totalPayments: 0,
    monthlyRevenue: 0,
    monthlyBaseRevenue: 0,
    monthlyRevenueWithGST: 0,
    monthlyGST: 0,
    recentPayments: [] as any[],
    paymentByDestination: [] as { destination: string; amount: number; count: number }[],
    baseNoGST: 0, // Total base amount for payments without GST
    baseWithGST: 0, // Total base amount for payments with GST
    totalGSTCollected: 0, // Total GST collected
    monthlyBaseFromAssignments: 0, // Total monthly base revenue from all active assignments
    activeByCategory: [] as { type: string; count: number }[],
    monthlyPaymentsList: [] as any[],
    monthlyLeadsCount: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

      // Fetch all data in parallel
      const [
        spacesResult,
        customersResult,
        assignmentsResult,
        paymentsResult,
        monthlyPaymentsResult,
        recentPaymentsResult,
        activeAssignmentsWithSpacesResult,
        allAssignmentsResult, // Fetch all assignments to match with payments
        leadsThisMonthResult,
      ] = await Promise.all([
        supabase.from('spaces').select('id, name, type, is_available, price_per_day'),
        supabase.from('customers').select('id'),
        supabase.from('assignments').select('id, status').eq('status', 'active'),
        supabase.from('payments').select('amount'),
        supabase
          .from('payments')
          .select(`
            amount, 
            includes_gst, 
            gst_amount,
            destination,
            assignment_id
          `)
          .gte('payment_date', startOfMonth),
        supabase
          .from('payments')
          .select(`
            *,
            customer:customers(*)
          `)
          .order('payment_date', { ascending: false })
          .limit(5),
        supabase
          .from('assignments')
          .select(`
            id,
            monthly_price,
            status,
            space:spaces(id, name, type, price_per_day, is_available)
          `)
          .eq('status', 'active'),
        supabase
          .from('assignments')
          .select('id, payment_destination, monthly_price, includes_gst'), // Fetch all assignments with payment_destination and pricing
        supabase
          .from('leads')
          .select('id')
          .gte('created_at', startOfMonth),
      ])

      if (spacesResult.error) throw spacesResult.error
      if (customersResult.error) throw customersResult.error
      if (assignmentsResult.error) throw assignmentsResult.error
      if (paymentsResult.error) throw paymentsResult.error
      if (monthlyPaymentsResult.error) throw monthlyPaymentsResult.error
      if (recentPaymentsResult.error) throw recentPaymentsResult.error
      if (activeAssignmentsWithSpacesResult.error) throw activeAssignmentsWithSpacesResult.error
      if (allAssignmentsResult.error) throw allAssignmentsResult.error
      if (leadsThisMonthResult.error) throw leadsThisMonthResult.error

      // Create a map of assignment_id to payment_destination for quick lookup
      const assignmentDestinationMap = new Map<string, string>()
      if (allAssignmentsResult.data) {
        allAssignmentsResult.data.forEach((assignment: any) => {
          if (assignment.payment_destination && assignment.payment_destination.trim() !== '') {
            assignmentDestinationMap.set(assignment.id, assignment.payment_destination.trim())
          }
        })
      }

      const totalSpaces = spacesResult.data?.length || 0
      const availableSpaces = spacesResult.data?.filter((s: any) => s.is_available).length || 0
      const occupiedSpaces = totalSpaces - availableSpaces
      
      // Calculate vacant value (sum of price for available spaces), exclude Virtual Office
      const vacantValue = spacesResult.data
        ?.filter((s: any) => s.is_available && s.type !== 'Virtual Office')
        .reduce((sum: number, s: any) => {
          const price = s.price_per_day != null && !isNaN(Number(s.price_per_day)) ? Number(s.price_per_day) : 0
          return sum + price
        }, 0) || 0

      const totalCustomers = customersResult.data?.length || 0
      const activeAssignments = assignmentsResult.data?.length || 0
      const totalPayments = paymentsResult.data?.length || 0
      
      // Calculate monthly revenue breakdown
      const monthlyPayments = monthlyPaymentsResult.data || []
      const monthlyRevenue = monthlyPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
      
      // Calculate base revenue (without GST)
      const monthlyBaseRevenue = monthlyPayments.reduce((sum, p) => {
        if (p.includes_gst) {
          return sum + (p.amount || 0) - (p.gst_amount || 0)
        }
        return sum + (p.amount || 0)
      }, 0)
      
      // Calculate GST
      const monthlyGST = monthlyPayments.reduce((sum, p) => sum + (p.gst_amount || 0), 0)
      
      // Calculate revenue with GST (total including GST)
      const monthlyRevenueWithGST = monthlyBaseRevenue + monthlyGST

      // Calculate base amounts by GST status
      const baseNoGST = monthlyPayments.reduce((sum, p) => {
        if (!p.includes_gst) {
          return sum + (p.amount || 0)
        }
        return sum
      }, 0)

      const baseWithGST = monthlyPayments.reduce((sum, p) => {
        if (p.includes_gst) {
          return sum + (p.amount || 0) - (p.gst_amount || 0)
        }
        return sum
      }, 0)

      const totalGSTCollected = monthlyPayments.reduce((sum, p) => sum + (p.gst_amount || 0), 0)
      const monthlyLeadsCount = leadsThisMonthResult.data?.length || 0

      // Calculate monthly base revenue from all active assignments (exclude Virtual Office)
      const monthlyBaseFromAssignments = (activeAssignmentsWithSpacesResult.data || [])
        .filter((assignment: any) => assignment.space?.type !== 'Virtual Office')
        .reduce((sum, assignment: any) => {
        // Get monthly price from assignment or space, handling null/undefined/NaN
        let monthlyPrice = 0
        
        // Try to get monthly_price from assignment first
        if (assignment.monthly_price != null) {
          const price = Number(assignment.monthly_price)
          if (!isNaN(price) && isFinite(price) && price > 0) {
            monthlyPrice = price
          }
        }
        
        // Fallback to space price_per_day if assignment monthly_price is not available
        if (monthlyPrice === 0 && assignment.space?.price_per_day != null) {
          const spacePrice = Number(assignment.space.price_per_day)
          if (!isNaN(spacePrice) && isFinite(spacePrice) && spacePrice > 0) {
            monthlyPrice = spacePrice
          }
        }
        
        // Ensure we're adding a valid number
        const validPrice = isNaN(monthlyPrice) || !isFinite(monthlyPrice) ? 0 : monthlyPrice
        return sum + validPrice
      }, 0)

      // Group payments by destination
      const destinationMap = new Map<string, { amount: number; count: number }>()
      
      monthlyPayments.forEach((payment: any) => {
        // Get destination from payment first
        let destination = payment.destination
        
        // Clean up destination (remove whitespace, handle null/undefined)
        if (destination && typeof destination === 'string') {
          destination = destination.trim()
          if (destination === '') {
            destination = null
          }
        } else {
          destination = null
        }
        
        // If payment doesn't have destination or it's empty, try to get it from assignment
        if (!destination && payment.assignment_id) {
          // Look up assignment destination from our map
          const assignmentDest = assignmentDestinationMap.get(payment.assignment_id)
          if (assignmentDest && assignmentDest !== '') {
            destination = assignmentDest
          }
        }
        
        // If still no destination, use 'Not Specified'
        if (!destination || destination === '') {
          destination = 'Not Specified'
        }
        
        if (!destinationMap.has(destination)) {
          destinationMap.set(destination, { amount: 0, count: 0 })
        }
        
        const current = destinationMap.get(destination)!
        destinationMap.set(destination, {
          amount: current.amount + (payment.amount || 0),
          count: current.count + 1,
        })
      })

      // Convert to array and sort by amount (descending)
      const paymentByDestination = Array.from(destinationMap.entries())
        .map(([destination, data]) => ({
          destination,
          amount: data.amount,
          count: data.count,
        }))
        .sort((a, b) => b.amount - a.amount)

      // Build active assignments by category (space.type)
      const categoryMap = new Map<string, number>()
      ;(activeAssignmentsWithSpacesResult.data || []).forEach((a: any) => {
        const t = a.space?.type || 'Unknown'
        categoryMap.set(t, (categoryMap.get(t) || 0) + 1)
      })
      const activeByCategory = Array.from(categoryMap.entries()).map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)

      setStats({
        totalSpaces,
        availableSpaces,
        occupiedSpaces,
        vacantValue,
        totalCustomers,
        activeAssignments,
        totalPayments,
        monthlyRevenue,
        monthlyBaseRevenue,
        monthlyRevenueWithGST,
        monthlyGST,
        recentPayments: recentPaymentsResult.data || [],
        paymentByDestination,
        baseNoGST,
        baseWithGST,
        totalGSTCollected,
        monthlyBaseFromAssignments,
        activeByCategory,
        monthlyPaymentsList: monthlyPayments,
        monthlyLeadsCount,
      })
    } catch (error: any) {
      alert('Error fetching dashboard data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const generateMonthlyReport = () => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthName = startOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    const doc = new jsPDF()

    // Header
    doc.setFillColor(99, 102, 241)
    doc.rect(0, 0, 210, 36, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('Spacio Workspace', 14, 18)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.text(`Monthly Report — ${monthName}`, 14, 28)

    // Summary block
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(12)
    const summaryY = 46
    doc.text('Summary', 14, summaryY)
    const lines = [
      `Total Payments: ${stats.monthlyPaymentsList.length}`,
      `Base Revenue (No GST): ${formatCurrency(stats.monthlyBaseRevenue)}`,
      `GST Collected: ${formatCurrency(stats.monthlyGST)}`,
      `Total Revenue (Incl. GST): ${formatCurrency(stats.monthlyRevenue)}`,
      `Expected Monthly Base from Assignments: ${formatCurrency(stats.monthlyBaseFromAssignments)}`,
    ]
    lines.forEach((t, i) => doc.text(t, 14, summaryY + 8 + i * 6))

    // Payments table
    const paymentsTableStart = summaryY + 8 + lines.length * 6 + 6
    const paymentsBody = (stats.monthlyPaymentsList || []).map((p: any) => [
      p.customer?.first_name && p.customer?.last_name ? `${p.customer.first_name} ${p.customer.last_name}` : p.customer?.name || '-',
      formatCurrency((p.amount || 0) - (p.gst_amount || 0)),
      p.includes_gst ? formatCurrency(p.gst_amount || 0) : '-',
      formatCurrency(p.amount || 0),
      new Date(p.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      p.destination || '-',
    ])
    autoTable(doc, {
      startY: paymentsTableStart,
      head: [['Customer', 'Base', 'GST', 'Total', 'Date', 'Destination']],
      body: paymentsBody,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255] },
    })

    // Category table
    const afterPaymentsY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : paymentsTableStart
    const categoryBody = (stats.activeByCategory || []).map((c) => [c.type, c.count.toString()])
    autoTable(doc, {
      startY: afterPaymentsY,
      head: [['Space Type', 'Active Assignments']],
      body: categoryBody,
      theme: 'grid',
      styles: { fontSize: 9 },
    })

    // Destination table
    const afterCatY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : afterPaymentsY
    const destBody = (stats.paymentByDestination || []).map((d) => [d.destination, formatCurrency(d.amount), d.count.toString()])
    autoTable(doc, {
      startY: afterCatY,
      head: [['Destination', 'Total Amount', 'Payments']],
      body: destBody,
      theme: 'grid',
      styles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 70 } },
    })

    // Footer
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(128, 128, 128)
      doc.text(`Page ${i} of ${pageCount} | Generated on ${new Date().toLocaleDateString('en-US')}`, 105, 287, { align: 'center' })
    }

    doc.save(`Spacio-Monthly-Report-${monthName.replace(' ', '-')}.pdf`)
  }

  if (loading) {
    return <div className="p-8 text-center animate-pulse">Loading...</div>
  }

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={generateMonthlyReport}
          className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-5 py-2 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 shadow-md font-semibold flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Generate Monthly Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">Total Spaces</h3>
          <p className="text-3xl font-bold">{stats.totalSpaces}</p>
          <p className="text-sm mt-2 opacity-75">{stats.availableSpaces} available, {stats.occupiedSpaces} occupied</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">Available Spaces</h3>
          <p className="text-3xl font-bold">{stats.availableSpaces}</p>
          <p className="text-sm mt-2 opacity-75">Vacant spaces</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">Vacant Value</h3>
          <p className="text-3xl font-bold">{formatCurrency(stats.vacantValue)}</p>
          <p className="text-sm mt-2 opacity-75">Monthly rent potential</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">Total Customers</h3>
          <p className="text-3xl font-bold">{stats.totalCustomers}</p>
          <Link href="/customers" className="text-sm mt-2 inline-block opacity-75 hover:opacity-100 transition-opacity">
            View all →
          </Link>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">Active Assignments</h3>
          <p className="text-3xl font-bold">{stats.activeAssignments}</p>
          <Link href="/assignments" className="text-sm mt-2 inline-block opacity-75 hover:opacity-100 transition-opacity">
            View all →
          </Link>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">Total Payments</h3>
          <p className="text-3xl font-bold">{stats.totalPayments}</p>
          <Link href="/payments" className="text-sm mt-2 inline-block opacity-75 hover:opacity-100 transition-opacity">
            View all →
          </Link>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">Leads (This Month)</h3>
          <p className="text-3xl font-bold">{stats.monthlyLeadsCount}</p>
          <Link href="/leads" className="text-sm mt-2 inline-block opacity-75 hover:opacity-100 transition-opacity">
            View leads →
          </Link>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">Monthly Revenue (Total)</h3>
          <p className="text-3xl font-bold">{formatCurrency(stats.monthlyRevenue)}</p>
          <p className="text-sm mt-2 opacity-75">This month</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">Base Revenue (No GST)</h3>
          <p className="text-3xl font-bold">{formatCurrency(stats.monthlyBaseRevenue)}</p>
          <p className="text-sm mt-2 opacity-75">Without GST</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">Revenue with GST</h3>
          <p className="text-3xl font-bold">{formatCurrency(stats.monthlyRevenueWithGST)}</p>
          <p className="text-sm mt-2 opacity-75">Base + GST</p>
        </div>

        <div className="bg-gradient-to-br from-lime-500 to-lime-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">GST Collected</h3>
          <p className="text-3xl font-bold">{formatCurrency(stats.monthlyGST)}</p>
          <p className="text-sm mt-2 opacity-75">18% GST amount</p>
        </div>

        <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">Occupancy Rate</h3>
          <p className="text-3xl font-bold">
            {stats.totalSpaces > 0
              ? ((stats.occupiedSpaces / stats.totalSpaces) * 100).toFixed(1)
              : 0}
            %
          </p>
          <p className="text-sm mt-2 opacity-75">Spaces occupied</p>
        </div>

        <div className="bg-gradient-to-br from-violet-500 to-violet-600 rounded-lg shadow-lg p-6 text-white animate-scale-in">
          <h3 className="text-sm font-medium mb-2 opacity-90">Monthly Base from Assignments</h3>
          <p className="text-3xl font-bold">
            {formatCurrency(isNaN(stats.monthlyBaseFromAssignments) ? 0 : stats.monthlyBaseFromAssignments)}
          </p>
          <p className="text-sm mt-2 opacity-75">
            Expected monthly base revenue ({stats.activeAssignments} active assignments)
          </p>
          <Link href="/assignments" className="text-sm mt-2 inline-block opacity-75 hover:opacity-100 transition-opacity">
            View assignments →
          </Link>
        </div>
      </div>

      {/* Payment by Destination */}
      {stats.paymentByDestination.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden animate-fade-in mb-8">
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-white">
            <h2 className="text-xl font-bold text-gray-900">Payments by Destination - This Month</h2>
            <p className="text-sm text-gray-500 mt-1">Total received grouped by payment destination</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {stats.paymentByDestination.map((item, index) => (
                <div
                  key={item.destination}
                  className="bg-gradient-to-br from-orange-50 to-white rounded-xl p-5 border-2 border-orange-100 hover:shadow-md transition-all animate-scale-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">{item.destination}</h3>
                    <span className="px-2 py-1 text-xs font-bold rounded-full bg-orange-200 text-orange-800">
                      {item.count} {item.count === 1 ? 'payment' : 'payments'}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-orange-700">{formatCurrency(item.amount)}</p>
                  <div className="mt-3 pt-3 border-t border-orange-200">
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span>Average per payment:</span>
                      <span className="font-semibold">
                        {formatCurrency(item.count > 0 ? item.amount / item.count : 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Summary Table */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Destination Summary</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-orange-500 to-orange-600">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Payment Destination</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Total Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Number of Payments</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Average Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stats.paymentByDestination.map((item) => {
                      const percentage = stats.monthlyRevenue > 0
                        ? ((item.amount / stats.monthlyRevenue) * 100).toFixed(1)
                        : '0.0'
                      return (
                        <tr key={item.destination} className="hover:bg-orange-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                            {item.destination}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-orange-700">
                            {formatCurrency(item.amount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {item.count} {item.count === 1 ? 'payment' : 'payments'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatCurrency(item.count > 0 ? item.amount / item.count : 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center">
                              <span className="font-semibold text-gray-700 mr-2">{percentage}%</span>
                              <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                                <div
                                  className="bg-orange-600 h-2 rounded-full"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="bg-gradient-to-r from-orange-50 to-white font-bold">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Total</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-700">
                        {formatCurrency(stats.monthlyRevenue)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {stats.paymentByDestination.reduce((sum, item) => sum + item.count, 0)} payments
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatCurrency(
                          stats.paymentByDestination.reduce((sum, item) => sum + item.count, 0) > 0
                            ? stats.monthlyRevenue / stats.paymentByDestination.reduce((sum, item) => sum + item.count, 0)
                            : 0
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Spaces by Category */}
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden animate-fade-in mb-8">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-violet-50 to-white">
          <h2 className="text-xl font-bold text-gray-900">Active Spaces by Category</h2>
          <p className="text-sm text-gray-500 mt-1">Count of active assignments grouped by space type</p>
        </div>
        <div className="p-6">
          {stats.activeByCategory.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {stats.activeByCategory.map((item, index) => (
                <div
                  key={`${item.type}-${index}`}
                  className="bg-gradient-to-br from-violet-50 to-white rounded-xl p-5 border-2 border-violet-100 hover:shadow-md transition-all animate-scale-in"
                  style={{ animationDelay: `${index * 0.06}s` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">{item.type}</h3>
                    <span className="px-2 py-1 text-xs font-bold rounded-full bg-violet-200 text-violet-800">
                      {item.count}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Active assignments</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No active assignments by category to display</div>
          )}
        </div>
      </div>

      {/* GST Breakdown Section */}
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden animate-fade-in mb-8">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-white">
          <h2 className="text-xl font-bold text-gray-900">GST Breakdown - This Month</h2>
          <p className="text-sm text-gray-500 mt-1">Revenue breakdown by GST status</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Base Amount - No GST */}
            <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-6 border-2 border-blue-200 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Base Amount (No GST)</h3>
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-blue-700 mb-2">{formatCurrency(stats.baseNoGST)}</p>
              <p className="text-xs text-gray-600">Customers who don't pay GST</p>
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-xs text-gray-500">
                  {stats.monthlyRevenue > 0
                    ? `${((stats.baseNoGST / stats.monthlyRevenue) * 100).toFixed(1)}% of total revenue`
                    : '0% of total revenue'}
                </p>
              </div>
            </div>

            {/* Base Amount - With GST */}
            <div className="bg-gradient-to-br from-green-50 to-white rounded-xl p-6 border-2 border-green-200 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Base Amount (With GST)</h3>
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-green-700 mb-2">{formatCurrency(stats.baseWithGST)}</p>
              <p className="text-xs text-gray-600">Base amount before GST</p>
              <div className="mt-3 pt-3 border-t border-green-200">
                <p className="text-xs text-gray-500">
                  {stats.monthlyRevenue > 0
                    ? `${((stats.baseWithGST / stats.monthlyRevenue) * 100).toFixed(1)}% of total revenue`
                    : '0% of total revenue'}
                </p>
              </div>
            </div>

            {/* Total GST Collected */}
            <div className="bg-gradient-to-br from-orange-50 to-white rounded-xl p-6 border-2 border-orange-200 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Total GST Collected</h3>
                <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-orange-700 mb-2">{formatCurrency(stats.totalGSTCollected)}</p>
              <p className="text-xs text-gray-600">GST tax amount (18%)</p>
              <div className="mt-3 pt-3 border-t border-orange-200">
                <p className="text-xs text-gray-500">
                  {stats.baseWithGST > 0
                    ? `${((stats.totalGSTCollected / stats.baseWithGST) * 100).toFixed(1)}% of base (with GST)`
                    : '0% of base'}
                </p>
              </div>
            </div>
          </div>

          {/* Summary Row */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="bg-gradient-to-r from-gray-50 to-white rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Total Base Revenue</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatCurrency(stats.baseNoGST + stats.baseWithGST)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Base (No GST)</p>
                  <p className="text-lg font-semibold text-blue-700">{formatCurrency(stats.baseNoGST)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Base (With GST)</p>
                  <p className="text-lg font-semibold text-green-700">{formatCurrency(stats.baseWithGST)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Total Revenue (Incl. GST)</p>
                  <p className="text-lg font-bold text-orange-700">
                    {formatCurrency(stats.baseNoGST + stats.baseWithGST + stats.totalGSTCollected)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden animate-fade-in">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <h2 className="text-xl font-bold text-gray-900">Recent Payments - This Month</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment For Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GST</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.recentPayments.length > 0 ? (
                stats.recentPayments.map((payment: any) => (
                  <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {payment.customer?.first_name && payment.customer?.last_name
                        ? `${payment.customer.first_name} ${payment.customer.last_name}`
                        : payment.customer?.name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(payment.payment_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(payment.payment_for_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {payment.includes_gst ? (
                        <span className="text-green-600 font-medium">
                          {formatCurrency(payment.gst_amount)}
                        </span>
                      ) : (
                        <span className="text-gray-400">No GST</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    No recent payments
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-gray-200 text-center bg-gray-50">
          <Link
            href="/payments"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            View all payments →
          </Link>
        </div>
      </div>
    </div>
  )
}

