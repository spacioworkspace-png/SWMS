export type CSVColumn<T> = {
  key: string
  header: string
  accessor?: (row: T) => any
}

function toCSVValue(val: any): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function exportToCSV<T>(rows: T[], columns: CSVColumn<T>[], filename: string) {
  const headers = columns.map((c) => c.header)
  const lines: string[] = []
  lines.push(headers.map(toCSVValue).join(','))
  for (const row of rows) {
    const vals = columns.map((c) => {
      const v = c.accessor ? c.accessor(row) : (row as any)[c.key]
      return toCSVValue(v)
    })
    lines.push(vals.join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
