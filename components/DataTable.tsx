"use client"

import React, { useMemo, useState } from 'react'
import { exportToCSV, CSVColumn } from '@/lib/export'

export type ColumnType = 'text' | 'number' | 'date' | 'select'

export type DataTableColumn<T> = {
  key: string
  header: string
  type?: ColumnType
  accessor?: (row: T) => React.ReactNode
  value?: (row: T) => any
  sortable?: boolean
  filterable?: boolean
  options?: string[]
  align?: 'left'|'right'|'center'
}

export type DataTableProps<T> = {
  data: T[]
  columns: DataTableColumn<T>[]
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  pageSize?: number
  actionsRender?: (row: T) => React.ReactNode
  title?: string
  exportFilename?: string
}

function compareValues(a: any, b: any) {
  if (a === b) return 0
  if (a === undefined || a === null) return 1
  if (b === undefined || b === null) return -1
  if (!isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) - Number(b)
  return String(a).localeCompare(String(b))
}

export default function DataTable<T>({ data, columns, defaultSort, pageSize = 20, actionsRender, title, exportFilename = 'export' }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc'|'desc' } | null>(defaultSort || null)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Record<string, any>>({})

  const filtered = useMemo(() => {
    let list = [...data]
    for (const col of columns) {
      if (!col.filterable) continue
      const val = filters[col.key]
      if (val === undefined || val === '' || val === 'all') continue
      switch (col.type) {
        case 'number': {
          const [min, max] = Array.isArray(val) ? val : [val, undefined]
          list = list.filter((row) => {
            const v = col.value ? col.value(row) : (row as any)[col.key]
            if (min !== undefined && min !== '' && Number(v) < Number(min)) return false
            if (max !== undefined && max !== '' && Number(v) > Number(max)) return false
            return true
          })
          break
        }
        case 'date': {
          const [from, to] = Array.isArray(val) ? val : [val, undefined]
          list = list.filter((row) => {
            const v = (col.value ? col.value(row) : (row as any)[col.key]) as string
            if (from && v < from) return false
            if (to && v > to) return false
            return true
          })
          break
        }
        case 'select': {
          list = list.filter((row) => String(col.value ? col.value(row) : (row as any)[col.key]) === String(val))
          break
        }
        case 'text':
        default: {
          const q = String(val).toLowerCase()
          list = list.filter((row) => String(col.value ? col.value(row) : (row as any)[col.key]).toLowerCase().includes(q))
          break
        }
      }
    }
    return list
  }, [data, columns, filters])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return filtered
    const list = [...filtered]
    list.sort((a, b) => {
      const va = col.value ? col.value(a) : (a as any)[col.key]
      const vb = col.value ? col.value(b) : (b as any)[col.key]
      const cmp = compareValues(va, vb)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return list
  }, [filtered, sort, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, page, pageSize])

  const setSortKey = (key: string) => {
    setPage(1)
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    })
  }

  const onExport = () => {
    const rows = sorted.map((row) => {
      const out: Record<string, any> = {}
      for (const c of columns) {
        out[c.header] = c.value ? c.value(row) : (row as any)[c.key]
      }
      return out
    })
    const cols: CSVColumn<any>[] = columns.map((c) => ({ key: c.header, header: c.header }))
    exportToCSV(rows, cols, exportFilename)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 flex items-center justify-between">
        <div className="font-semibold text-gray-900">{title}</div>
        <div className="flex items-center gap-2">
          <button onClick={onExport} className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-sm">Export CSV</button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 pb-3 grid gap-3 md:grid-cols-4">
        {columns.map((c) => (
          c.filterable ? (
            <div key={c.key} className="text-sm">
              <div className="text-xs font-semibold text-gray-700 mb-1">{c.header}</div>
              {c.type === 'select' ? (
                <select value={filters[c.key] ?? 'all'} onChange={(e) => { setPage(1); setFilters((p) => ({ ...p, [c.key]: e.target.value })) }} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                  <option value="all">All</option>
                  {(c.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : c.type === 'date' ? (
                <div className="flex gap-2">
                  <input type="date" value={(filters[c.key]?.[0] || '')} onChange={(e) => { const v = e.target.value; setPage(1); setFilters((p) => ({ ...p, [c.key]: [v, p[c.key]?.[1] || ''] })) }} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
                  <input type="date" value={(filters[c.key]?.[1] || '')} onChange={(e) => { const v = e.target.value; setPage(1); setFilters((p) => ({ ...p, [c.key]: [p[c.key]?.[0] || '', v] })) }} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
                </div>
              ) : c.type === 'number' ? (
                <div className="flex gap-2">
                  <input placeholder="Min" value={(filters[c.key]?.[0] || '')} onChange={(e) => { const v = e.target.value; setPage(1); setFilters((p) => ({ ...p, [c.key]: [v, p[c.key]?.[1] || ''] })) }} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
                  <input placeholder="Max" value={(filters[c.key]?.[1] || '')} onChange={(e) => { const v = e.target.value; setPage(1); setFilters((p) => ({ ...p, [c.key]: [p[c.key]?.[0] || '', v] })) }} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
                </div>
              ) : (
                <input placeholder="Search" value={filters[c.key] || ''} onChange={(e) => { setPage(1); setFilters((p) => ({ ...p, [c.key]: e.target.value })) }} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
              )}
            </div>
          ) : null
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-orange-50">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-2 text-left text-xs font-bold text-orange-700 uppercase ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                  <button disabled={!c.sortable} onClick={() => setSortKey(c.key)} className={`flex items-center gap-1 ${c.sortable ? '' : 'cursor-default'}`}>
                    <span>{c.header}</span>
                    {sort?.key === c.key ? (
                      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3l5 6H5l5-6zm0 14l-5-6h10l-5 6z"/></svg>
                    ) : null}
                  </button>
                </th>
              ))}
              {actionsRender ? <th className="px-4 py-2 text-left text-xs font-bold text-orange-700 uppercase">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {paged.length === 0 ? (
              <tr><td className="px-4 py-3 text-sm text-gray-500" colSpan={columns.length + (actionsRender ? 1 : 0)}>No data</td></tr>
            ) : paged.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2 text-sm ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                    {c.accessor ? c.accessor(row) : String((row as any)[c.key] ?? '')}
                  </td>
                ))}
                {actionsRender ? (
                  <td className="px-4 py-2 text-sm">{actionsRender(row)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-4 flex items-center justify-between text-sm">
        <div className="text-gray-600">Page {page} of {pageCount} • {sorted.length} items</div>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 border rounded-lg disabled:opacity-50">Prev</button>
          <button disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} className="px-3 py-1.5 border rounded-lg disabled:opacity-50">Next</button>
        </div>
      </div>
    </div>
  )
}
