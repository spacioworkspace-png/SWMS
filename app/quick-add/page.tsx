"use client"

import { useEffect, useMemo, useState } from "react"
import PaymentsNew from "@/components/PaymentsNew"
import Leads from "@/components/Leads"
import { supabase } from "@/lib/supabase"

export default function QuickAddPage() {
  const [leadFormKey, setLeadFormKey] = useState(0)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'quick' | 'pending'>('quick')
  const [loadingPending, setLoadingPending] = useState(true)
  const [assignments, setAssignments] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        const monthKey = startOfMonth.slice(0,7)
        const [asgRes, payRes] = await Promise.all([
          supabase
            .from('assignments')
            .select(`id, status, monthly_price, customer:customers(id, name, first_name, last_name), space:spaces(id, name, type)`) 
            .eq('status', 'active'),
          supabase
            .from('payments')
            .select('id, assignment_id, payment_for_date, payment_date'),
        ])
        if (asgRes.error) throw asgRes.error
        if (payRes.error) throw payRes.error
        setAssignments(asgRes.data || [])
        setPayments(payRes.data || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingPending(false)
      }
    }
    load()
  }, [])

  const monthKey = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,7), [])
  const pending = useMemo(() => {
    const list = (assignments || [])
      .filter((a) => a.status === 'active')
      .filter((a) => !payments.some((p) => p.assignment_id === a.id && ((p.payment_for_date || p.payment_date || '').startsWith(monthKey))))
      .sort((a, b) => (a.space?.name || '').localeCompare(b.space?.name || ''))
    return list
  }, [assignments, payments, monthKey])
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quick Add (Public)</h1>
        <p className="text-sm text-gray-600">Use the full forms below to add a Payment or a Lead. No login required.</p>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-200 mb-4">
        <div className="flex gap-2 p-1">
          <button type="button" onClick={() => setActiveTab('quick')} className={`px-4 py-2 rounded-md text-sm font-semibold border ${activeTab==='quick' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300'}`}>Quick Add</button>
          <button type="button" onClick={() => setActiveTab('pending')} className={`px-4 py-2 rounded-md text-sm font-semibold border ${activeTab==='pending' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300'}`}>Pending Rent</button>
        </div>
      </div>

      {activeTab === 'quick' && (
        <>
          {/* Top actions */}
          <div className="mb-6 flex items-center gap-3">
            <button onClick={() => setShowPaymentModal(true)} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">Add Payment</button>
            <button onClick={() => { setShowLeadModal(true); setLeadFormKey((k) => k + 1) }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Add New Lead</button>
          </div>

          {/* Conditionally mounted modals (form-only) */}
          {showPaymentModal && <PaymentsNew mode="formOnly" />}
          {showLeadModal && <Leads key={leadFormKey} mode="formOnly" />}

          {/* Leads list */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Leads</h2>
            <Leads />
          </div>
        </>
      )}

      {activeTab === 'pending' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">Pending Rent — {monthKey}</h2>
            <div className="text-sm text-gray-600">Total: <span className="font-semibold">{pending.length}</span></div>
          </div>
          {loadingPending ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : pending.length === 0 ? (
            <div className="text-sm text-gray-500">No pending rent</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Space</th>
                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Customer</th>
                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Monthly Price</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pending.map((a) => {
                    const customerName = a.customer?.first_name && a.customer?.last_name
                      ? `${a.customer.first_name} ${a.customer.last_name}`
                      : (a.customer?.name || '-')
                    return (
                      <tr key={a.id}>
                        <td className="px-4 py-2 text-sm font-semibold text-gray-900">{a.space?.name || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{a.space?.type || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{customerName}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">₹{(a.monthly_price || a.space?.price_per_day || 0).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
