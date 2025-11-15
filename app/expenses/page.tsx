"use client"

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { exportToCSV } from '@/lib/export'
import { Expense } from '@/types'
import { formatCurrency } from '@/lib/utils'
import DataTable, { DataTableColumn } from '@/components/DataTable'

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [category, setCategory] = useState('all')
  const [destination, setDestination] = useState('all')
  const [sortBy, setSortBy] = useState<'date_desc'|'date_asc'|'amount_desc'|'amount_asc'>('date_desc')

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    category: '',
    destination: '',
    vendor: '',
    includes_gst: false,
    gst_amount: '0',
    notes: '',
    attachment_url: '',
  })

  const categories = [
    'Rent',
    'Utilities',
    'GST',
    'Wifi',
    'Electricity',
    'Purchases',
    'Misc',
  ]

  const destinationOptions = [
    'APPA 316',
    'APPA CANARA',
    'DADDY FEDERAL',
    'SHAN SAVINGS',
    'SPACIO CURRENT',
    'Cash',
  ]

  const columns: DataTableColumn<Expense>[] = useMemo(() => ([
    {
      key: 'date', header: 'Date', type: 'date', sortable: true, filterable: true,
      accessor: (e) => e.date,
    },
    {
      key: 'category', header: 'Category', type: 'select', options: categories, sortable: true, filterable: true,
      accessor: (e) => e.category || '-',
    },
    {
      key: 'destination', header: 'Destination', type: 'select', options: destinationOptions, sortable: true, filterable: true,
      accessor: (e) => e.destination || '-',
    },
    {
      key: 'vendor', header: 'Vendor', type: 'text', sortable: true, filterable: true,
      accessor: (e) => e.vendor || '-',
    },
    {
      key: 'base', header: 'Base', type: 'number', align: 'right', sortable: true, filterable: true,
      value: (e) => (e.amount - (e.gst_amount || 0)),
      accessor: (e) => <span className="font-semibold">{formatCurrency(e.amount - (e.gst_amount || 0))}</span>,
    },
    {
      key: 'gst', header: 'GST', type: 'number', align: 'right', sortable: true, filterable: true,
      value: (e) => (e.includes_gst ? (e.gst_amount || 0) : 0),
      accessor: (e) => e.includes_gst ? formatCurrency(e.gst_amount || 0) : '-',
    },
    {
      key: 'amount', header: 'Total', type: 'number', align: 'right', sortable: true, filterable: true,
      accessor: (e) => <span className="font-semibold">{formatCurrency(e.amount)}</span>,
    },
  ]), [categories, destinationOptions])

  useEffect(() => { fetchExpenses() }, [])

  const fetchExpenses = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false })
      if (error) throw error
      setExpenses(data || [])
      const today = new Date().toISOString().split('T')[0]
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
      setDateFrom(startOfMonth)
      setDateTo(today)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const calculateGST = (amount: number, includes: boolean) => includes ? (amount - (amount / 1.18)) : 0

  const handleAmountChange = (val: string) => {
    const base = parseFloat(val) || 0
    const gst = formData.includes_gst ? calculateGST(base, true) : 0
    setFormData((p) => ({ ...p, amount: val, gst_amount: gst.toFixed(2) }))
  }

  const handleGSTToggle = (inc: boolean) => {
    const base = parseFloat(formData.amount) || 0
    const gst = inc ? calculateGST(base, true) : 0
    setFormData((p) => ({ ...p, includes_gst: inc, gst_amount: gst.toFixed(2) }))
  }

  const resetForm = () => {
    setEditing(null)
    setFormData({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      category: '',
      destination: '',
      vendor: '',
      includes_gst: false,
      gst_amount: '0',
      notes: '',
      attachment_url: '',
    })
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!formData.amount) {
        alert('Please enter amount')
        return
      }
      const payload = {
        date: formData.date,
        amount: parseFloat(formData.amount) || 0,
        category: formData.category || null,
        destination: formData.destination || null,
        vendor: formData.vendor || null,
        includes_gst: formData.includes_gst,
        gst_amount: parseFloat(formData.gst_amount) || 0,
        notes: formData.notes || null,
        attachment_url: formData.attachment_url || null,
      }
      if (editing) {
        const { error } = await supabase.from('expenses').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('expenses').insert([payload])
        if (error) throw error
      }
      setShowModal(false)
      resetForm()
      fetchExpenses()
    } catch (err: any) {
      alert('Error saving expense: ' + err.message)
    }
  }

  const onEdit = (exp: Expense) => {
    setEditing(exp)
    setFormData({
      date: exp.date,
      amount: String(exp.amount),
      category: exp.category || '',
      destination: exp.destination || '',
      vendor: exp.vendor || '',
      includes_gst: !!exp.includes_gst,
      gst_amount: String(exp.gst_amount || 0),
      notes: exp.notes || '',
      attachment_url: exp.attachment_url || '',
    })
    setShowModal(true)
  }

  const onDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
      fetchExpenses()
    } catch (err: any) {
      alert('Error deleting expense: ' + err.message)
    }
  }

  const filtered = useMemo(() => {
    let list = [...expenses]
    if (dateFrom) list = list.filter((e) => e.date >= dateFrom)
    if (dateTo) list = list.filter((e) => e.date <= dateTo)
    if (category !== 'all') list = list.filter((e) => (e.category || '') === category)
    if (destination !== 'all') list = list.filter((e) => (e.destination || '') === destination)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((e) =>
        (e.vendor || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q) ||
        (e.destination || '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      switch (sortBy) {
        case 'date_asc': return a.date.localeCompare(b.date)
        case 'amount_desc': return b.amount - a.amount
        case 'amount_asc': return a.amount - b.amount
        case 'date_desc':
        default: return b.date.localeCompare(a.date)
      }
    })
    return list
  }, [expenses, dateFrom, dateTo, category, destination, search, sortBy])

  const totals = useMemo(() => {
    const base = filtered.reduce((s, e) => s + (e.amount - (e.gst_amount || 0)), 0)
    const gst = filtered.reduce((s, e) => s + (e.includes_gst ? (e.gst_amount || 0) : 0), 0)
    const total = filtered.reduce((s, e) => s + e.amount, 0)
    return { base, gst, total, count: filtered.length }
  }, [filtered])

  const onExport = () => {
    const rows = filtered.map((e) => ({
      Date: e.date,
      Category: e.category || '',
      Destination: e.destination || '',
      Vendor: e.vendor || '',
      Base: (e.amount - (e.gst_amount || 0)).toFixed(2),
      GST: e.includes_gst ? (e.gst_amount || 0).toFixed(2) : '0.00',
      Total: e.amount.toFixed(2),
      Notes: e.notes || '',
    }))
    exportToCSV(rows, [
      { key: 'Date', header: 'Date' },
      { key: 'Category', header: 'Category' },
      { key: 'Destination', header: 'Destination' },
      { key: 'Vendor', header: 'Vendor' },
      { key: 'Base', header: 'Base' },
      { key: 'GST', header: 'GST' },
      { key: 'Total', header: 'Total' },
      { key: 'Notes', header: 'Notes' },
    ], `expenses-${dateFrom || 'all'}-to-${dateTo || 'all'}`)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-600 mt-1">Track operational expenses with GST breakdown.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onExport} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50">Export CSV</button>
          <button onClick={() => { resetForm(); setShowModal(true) }} className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg transition-all duration-200 hover:scale-105 shadow-sm font-semibold">Add Expense</button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 mb-4">
        <div className="grid md:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
              <option value="all">All</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Destination</label>
            <select value={destination} onChange={(e) => setDestination(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
              <option value="all">All</option>
              {destinationOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Search</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Vendor/Notes..." className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder:text-gray-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Sort</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
              <option value="date_desc">Date ↓</option>
              <option value="date_asc">Date ↑</option>
              <option value="amount_desc">Amount ↓</option>
              <option value="amount_asc">Amount ↑</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <div className="p-4 rounded-xl border bg-white">
          <div className="text-xs text-gray-500">Base</div>
          <div className="text-2xl font-bold">{formatCurrency(totals.base)}</div>
        </div>
        <div className="p-4 rounded-xl border bg-white">
          <div className="text-xs text-gray-500">GST (18%)</div>
          <div className="text-2xl font-bold">{formatCurrency(totals.gst)}</div>
        </div>
        <div className="p-4 rounded-xl border bg-white">
          <div className="text-xs text-gray-500">Total</div>
          <div className="text-2xl font-bold">{formatCurrency(totals.total)}</div>
        </div>
      </div>

      {/* List */}
      <DataTable
        title="Expenses"
        data={filtered}
        columns={columns}
        defaultSort={{ key: 'date', dir: 'desc' }}
        pageSize={20}
        exportFilename={`expenses-${dateFrom || 'all'}-to-${dateTo || 'all'}`}
        actionsRender={(e) => (
          <div className="whitespace-nowrap">
            <button onClick={() => onEdit(e)} className="text-orange-600 hover:text-orange-800 mr-3 font-semibold">Edit</button>
            <button onClick={() => onDelete(e.id)} className="text-red-600 hover:text-red-800 font-semibold">Delete</button>
          </div>
        )}
      />

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/10 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full overflow-hidden border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">{editing ? 'Edit Expense' : 'Add Expense'}</h3>
                <button onClick={() => { setShowModal(false); resetForm() }} className="text-gray-500 hover:text-gray-700 rounded-full p-1.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <form onSubmit={onSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-900">Date</label>
                <input type="date" value={formData.date} onChange={(e) => setFormData((p) => ({...p, date: e.target.value}))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-900">Amount <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" value={formData.amount} onChange={(e) => handleAmountChange(e.target.value)} required className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-900">Category</label>
                <select value={formData.category} onChange={(e) => setFormData((p) => ({...p, category: e.target.value}))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                  <option value="">Select</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-900">Destination</label>
                <select value={formData.destination} onChange={(e) => setFormData((p) => ({...p, destination: e.target.value}))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                  <option value="">Select</option>
                  {destinationOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-900">Vendor</label>
                <input value={formData.vendor} onChange={(e) => setFormData((p) => ({...p, vendor: e.target.value}))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input id="incgst" type="checkbox" checked={formData.includes_gst} onChange={(e) => handleGSTToggle(e.target.checked)} />
                <label htmlFor="incgst" className="text-sm">Includes GST (18%)</label>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-900">GST Amount</label>
                <input type="number" step="0.01" value={formData.gst_amount} onChange={(e) => setFormData((p) => ({...p, gst_amount: e.target.value}))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-semibold text-gray-900">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData((p) => ({...p, notes: e.target.value}))} rows={3} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder:text-gray-500" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-semibold text-gray-900">Attachment URL</label>
                <input value={formData.attachment_url} onChange={(e) => setFormData((p) => ({...p, attachment_url: e.target.value}))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
              </div>
              <div className="md:col-span-2 flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); resetForm() }} className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
