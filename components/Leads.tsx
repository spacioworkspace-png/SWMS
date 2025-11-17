'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const LEAD_SOURCES = ['call','visit','referral','website','google_ads','justdial','other'] as const
const LEAD_STATUSES = ['new','contacted','scheduled_visit','converted','lost','on_hold'] as const

type LeadSource = typeof LEAD_SOURCES[number]
type LeadStatus = typeof LEAD_STATUSES[number]

type Lead = {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: LeadSource
  status: LeadStatus
  notes: string | null
  next_follow_up_date: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

export default function Leads({ mode }: { mode?: 'full' | 'formOnly' } = {}) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(mode === 'formOnly')
  const [editing, setEditing] = useState<Lead | null>(null)
  const [viewing, setViewing] = useState<Lead | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | LeadSource>('all')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    source: '' as LeadSource | '',
    status: 'new' as LeadStatus,
    notes: '',
    next_follow_up_date: '',
    tags: '' as string,
  })

  useEffect(() => {
    fetchLeads()
  }, [])

  const fetchLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setLeads((data || []) as any)
    } catch (e: any) {
      alert('Error fetching leads: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setForm({
      name: '',
      phone: '',
      email: '',
      source: '',
      status: 'new',
      notes: '',
      next_follow_up_date: '',
      tags: '',
    })
  }

  const openNew = () => {
    setEditing(null)
    resetForm()
    setShowModal(true)
  }

  const openView = (lead: Lead) => {
    setViewing(lead)
  }

  const openEdit = (lead: Lead) => {
    setEditing(lead)
    setForm({
      name: lead.name,
      phone: lead.phone || '',
      email: lead.email || '',
      source: lead.source || '',
      status: lead.status || 'new',
      notes: lead.notes || '',
      next_follow_up_date: lead.next_follow_up_date || '',
      tags: (lead.tags || []).join(', '),
    })
    setShowModal(true)
  }

  const saveLead = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!form.name) {
        alert('Name is required')
        return
      }
      if (!form.source) {
        alert('Source is required')
        return
      }

      const payload: any = {
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        source: form.source,
        status: form.status,
        notes: form.notes || null,
        next_follow_up_date: form.next_follow_up_date || null,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      }

      if (editing) {
        const { error } = await supabase.from('leads').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('leads').insert([payload])
        if (error) throw error
      }

      setShowModal(false)
      setEditing(null)
      resetForm()
      fetchLeads()
    } catch (e: any) {
      alert('Error saving lead: ' + e.message)
    }
  }

  const deleteLead = async (id: string) => {
    if (!confirm('Delete this lead?')) return
    try {
      const { error } = await supabase.from('leads').delete().eq('id', id)
      if (error) throw error
      fetchLeads()
    } catch (e: any) {
      alert('Error deleting lead: ' + e.message)
    }
  }

  const filteredLeads = useMemo(() => {
    const s = search.trim().toLowerCase()
    return leads.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (sourceFilter !== 'all' && l.source !== sourceFilter) return false
      if (!s) return true
      return (
        l.name.toLowerCase().includes(s) ||
        (l.phone || '').toLowerCase().includes(s) ||
        (l.email || '').toLowerCase().includes(s) ||
        (l.notes || '').toLowerCase().includes(s)
      )
    })
  }, [leads, search, statusFilter, sourceFilter])

  const todayStr = new Date().toISOString().split('T')[0]
  const remindersCount = useMemo(() => {
    return leads.filter((l) => l.next_follow_up_date && l.next_follow_up_date <= todayStr).length
  }, [leads])

  const statusColors: Record<LeadStatus, { bg: string; text: string; icon: string }> = {
    'new': { bg: 'bg-blue-100', text: 'text-blue-700', icon: '🆕' },
    'contacted': { bg: 'bg-purple-100', text: 'text-purple-700', icon: '📞' },
    'scheduled_visit': { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '📅' },
    'converted': { bg: 'bg-green-100', text: 'text-green-700', icon: '✅' },
    'lost': { bg: 'bg-red-100', text: 'text-red-700', icon: '❌' },
    'on_hold': { bg: 'bg-gray-100', text: 'text-gray-700', icon: '⏸️' },
  }

  const sourceColors: Record<LeadSource, { bg: string; text: string }> = {
    'call': { bg: 'bg-cyan-100', text: 'text-cyan-700' },
    'visit': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
    'referral': { bg: 'bg-pink-100', text: 'text-pink-700' },
    'website': { bg: 'bg-blue-100', text: 'text-blue-700' },
    'google_ads': { bg: 'bg-orange-100', text: 'text-orange-700' },
    'justdial': { bg: 'bg-amber-100', text: 'text-amber-700' },
    'other': { bg: 'bg-gray-100', text: 'text-gray-700' },
  }

  const leadStats = useMemo(() => {
    return LEAD_STATUSES.map(status => ({
      status,
      count: filteredLeads.filter(l => l.status === status).length,
      color: statusColors[status]
    }))
  }, [filteredLeads])

  if (loading && mode !== 'formOnly') return <div className="p-8 text-center">Loading...</div>

  return (
    <div className="p-8 animate-fade-in">
      {mode !== 'formOnly' ? (
        <>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Leads</h2>
            <p className="text-sm text-gray-500 mt-1">Capture and manage new leads effectively</p>
          </div>
          <div className="flex items-center space-x-3">
            {remindersCount > 0 && <div className="px-4 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm font-semibold">⚠️ {remindersCount} follow-ups due today</div>}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex">
              <button onClick={() => setViewMode('table')} className={`px-4 py-2 text-sm font-semibold transition-all ${viewMode==='table' ? 'bg-orange-500 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>Table</button>
              <button onClick={() => setViewMode('kanban')} className={`px-4 py-2 text-sm font-semibold transition-all ${viewMode==='kanban' ? 'bg-orange-500 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>Kanban</button>
            </div>
            <button onClick={openNew} className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-6 py-2 rounded-lg transition-all duration-200 hover:scale-105 shadow-md font-semibold flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Lead
            </button>
            <Link href="/" className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition font-semibold">← Back</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          {leadStats.map((stat) => (
            <div key={stat.status} className={`${stat.color.bg} rounded-lg p-4 border-2 border-current/10`}>
              <div className="text-2xl font-bold text-gray-900 mb-1">{stat.count}</div>
              <div className="text-xs font-semibold text-gray-600 capitalize">{stat.status.replace('_', ' ')}</div>
            </div>
          ))}
        </div>
        </>
      ) : (
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Quick Add Lead (Public)</h2>
          <p className="text-sm text-gray-500">Use the form below to add a new lead.</p>
        </div>
      )}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads..." className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder:text-gray-500" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
            <option value="all">All Statuses</option>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as any)} className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
            <option value="all">All Sources</option>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
          <div className="text-sm text-gray-600 flex items-center">Total: <span className="ml-1 font-semibold">{filteredLeads.length}</span></div>
        </div>
      </div>

      {mode !== 'formOnly' ? (viewMode === 'table' ? (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-orange-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-orange-700 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-orange-700 uppercase">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-orange-700 uppercase">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-orange-700 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-orange-700 uppercase">Next Follow-up</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-orange-700 uppercase hidden sm:table-cell">Tags</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-orange-700 uppercase">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-orange-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{lead.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div>{lead.phone || '-'}</div>
                      <div className="text-gray-500">{lead.email || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${sourceColors[lead.source]?.bg || 'bg-gray-100'} ${sourceColors[lead.source]?.text || 'text-gray-700'}`}>{lead.source.replace('_',' ')}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[lead.status]?.bg} ${statusColors[lead.status]?.text}`}>{statusColors[lead.status]?.icon} {lead.status.replace('_',' ')}</span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${lead.next_follow_up_date && lead.next_follow_up_date <= todayStr ? 'text-amber-700 font-semibold' : 'text-gray-600'}`}>{lead.next_follow_up_date || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm hidden sm:table-cell">
                      {(lead.tags && lead.tags.length > 0) ? (
                        <div className="flex flex-wrap gap-1">
                          {lead.tags.map((t: string, idx: number) => (
                            <span key={idx} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">{t}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button onClick={() => openView(lead)} className="text-orange-600 hover:text-orange-800 mr-4 font-semibold">View</button>
                      <button onClick={() => openEdit(lead)} className="text-orange-600 hover:text-orange-800 mr-4 font-semibold">Edit</button>
                      <button onClick={() => deleteLead(lead.id)} className="text-red-600 hover:text-red-800 font-semibold">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {LEAD_STATUSES.map((status) => (
            <div key={status} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b bg-orange-50 text-sm font-bold text-orange-700 capitalize">{status.replace('_',' ')}</div>
              <div className="p-3 space-y-3 min-h-[200px]">
                {filteredLeads.filter((l) => l.status === status).map((lead) => (
                  <div key={lead.id} className={`rounded-lg border p-3 ${lead.next_follow_up_date && lead.next_follow_up_date <= todayStr ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{lead.name}</div>
                        <div className="text-xs text-gray-600">{lead.phone || '-'}{lead.email ? ` | ${lead.email}` : ''}</div>
                        <div className="mt-1 text-xs"><span className={`px-2 py-0.5 rounded-full font-semibold ${sourceColors[lead.source]?.bg || 'bg-gray-100'} ${sourceColors[lead.source]?.text || 'text-gray-700'}`}>{lead.source.replace('_',' ')}</span></div>
                        {(lead.tags && lead.tags.length > 0) && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {lead.tags.map((t: string, idx: number) => (
                              <span key={idx} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-3">
                        <button onClick={() => openView(lead)} className="text-orange-600 hover:text-orange-800 text-xs font-semibold">View</button>
                        <button onClick={() => openEdit(lead)} className="text-orange-600 hover:text-orange-800 text-xs font-semibold">Edit</button>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      Next follow-up: <span className={lead.next_follow_up_date && lead.next_follow_up_date <= todayStr ? 'text-amber-700 font-semibold' : ''}>{lead.next_follow_up_date || '-'}</span>
                    </div>
                  </div>
                ))}
                {filteredLeads.filter((l) => l.status === status).length === 0 && (
                  <div className="text-xs text-gray-500">No leads</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )) : null}

      {showModal && (
        <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-orange-100 animate-slide-up">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-500 to-orange-600">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">{editing ? 'Edit Lead' : 'Add Lead'}</h3>
                  <p className="text-sm text-orange-100 mt-1">Capture new lead information</p>
                </div>
                <button onClick={() => { setShowModal(false); setEditing(null); resetForm() }} className="text-white hover:bg-white/20 rounded-full p-1.5 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <form onSubmit={saveLead} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-semibold text-gray-900">Name <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder:text-gray-500" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-900">Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder:text-gray-500" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-900">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder:text-gray-500" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-900">Source <span className="text-red-500">*</span></label>
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as LeadSource })} required className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                  <option value="">Select source</option>
                  {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-900">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as LeadStatus })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-900">Next Follow-up</label>
                <input type="date" value={form.next_follow_up_date} onChange={(e) => setForm({ ...form, next_follow_up_date: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-semibold text-gray-900">Tags (comma separated)</label>
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder:text-gray-500" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-semibold text-gray-900">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder:text-gray-500" />
              </div>
              <div className="md:col-span-2 flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setEditing(null); resetForm() }} className="px-5 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-semibold text-gray-700 transition-all">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg font-semibold shadow-md transition-all duration-200">{editing ? 'Update Lead' : 'Create Lead'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
