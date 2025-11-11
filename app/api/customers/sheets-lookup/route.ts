import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'

function normalizeKey(key: string) {
  return key
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function mapRowToForm(headers: string[], row: string[]) {
  const obj: Record<string, any> = {}
  headers.forEach((h, i) => {
    obj[normalizeKey(h)] = row[i] ?? ''
  })

  // Build formData shape expected by Customers.tsx
  const form: any = {
    first_name: obj.first_name || obj.firstname || '',
    last_name: obj.last_name || obj.lastname || '',
    email: obj.email || '',
    mobile_number: obj.mobile_number || obj.phone || obj.mobile || obj.phonenumber || '',
    aadhaar_card_url: obj.aadhaar_card_url || obj.aadhaar || '',
    street_address: obj.street_address || obj.address || '',
    street_address_line2: obj.street_address_line2 || obj.address_line2 || '',
    city: obj.city || '',
    state_province: obj.state_province || obj.state || '',
    postal_code: obj.postal_code || obj.zip || obj.pincode || '',
    country: obj.country || '',
    registration_type: (obj.registration_type || obj.type || 'individual') as 'individual' | 'company',
    company_name: obj.company_name || obj.company || '',
    company_gstin: obj.company_gstin || obj.gstin || obj.tax_id || '',
    nature_of_business: obj.nature_of_business || obj.business_nature || '',
    company_registration_doc_url: obj.company_registration_doc_url || obj.company_registration || '',
    pays_gst: String(obj.pays_gst || obj.gst || '').toLowerCase() === 'true' || String(obj.pays_gst || obj.gst || '').toLowerCase() === 'yes',
  }

  return form
}

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase()
    const phone = req.nextUrl.searchParams.get('phone')?.replace(/\s+/g, '')

    if (!email && !phone) {
      return NextResponse.json({ error: 'Provide email or phone' }, { status: 400 })
    }

    const SHEET_ID = process.env.GOOGLE_SHEETS_ID
    const SHEET_TAB = process.env.GOOGLE_SHEETS_TAB || 'entry'
    const quotedTab = `'${SHEET_TAB}'`
    const SHEET_RANGE = process.env.GOOGLE_SHEETS_RANGE || `${quotedTab}!A:Z`
    let CLIENT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || ''
    let PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n') || ''

    const KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
    if (KEY_FILE) {
      try {
        const abs = path.isAbsolute(KEY_FILE) ? KEY_FILE : path.join(process.cwd(), KEY_FILE)
        const raw = fs.readFileSync(abs, 'utf8')
        const json = JSON.parse(raw)
        if (json.client_email) CLIENT_EMAIL = json.client_email
        if (json.private_key) PRIVATE_KEY = json.private_key
      } catch (e) {
        console.error('Failed to read key file:', e)
      }
    }

    if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
      const missing: string[] = []
      if (!SHEET_ID) missing.push('GOOGLE_SHEETS_ID')
      if (!CLIENT_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL')
      if (!PRIVATE_KEY) missing.push('GOOGLE_SERVICE_ACCOUNT_KEY')
      return NextResponse.json({ error: `Missing Google Sheets env config: ${missing.join(', ')}` }, { status: 500 })
    }

    const jwt = new google.auth.JWT({
      email: CLIENT_EMAIL,
      key: PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })

    const sheets = google.sheets({ version: 'v4', auth: jwt })

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: SHEET_RANGE,
    })

    const values: string[][] = (resp.data.values as string[][]) || []
    if (values.length === 0) {
      return NextResponse.json({ matches: [] })
    }

    const headers: string[] = (values[0] as string[]) || []
    const rows: string[][] = values.slice(1) as string[][]

    // Find header indices for matching
    const headerIndex = (names: string[]) => {
      const set = new Set(names.map((n) => normalizeKey(n)))
      for (let i = 0; i < headers.length; i++) {
        if (set.has(normalizeKey(headers[i]))) return i
      }
      return -1
    }

    const emailIdx = headerIndex(['email'])
    const phoneIdx = headerIndex(['mobile_number', 'phone', 'mobile', 'phone_number'])

    // Filter rows by email/phone
    const matches = rows.filter((row: string[]) => {
      let ok = true
      if (email && emailIdx >= 0) {
        ok = ok && String(row[emailIdx] || '').trim().toLowerCase() === email
      }
      if (phone && phoneIdx >= 0) {
        const cleaned = String(row[phoneIdx] || '').replace(/\s+/g, '')
        ok = ok && cleaned === phone
      }
      // If header not found, allow broader mapping later but don't match on that key
      return ok
    })

    const mapped = matches.map((row: string[]) => mapRowToForm(headers as string[], row as string[]))

    // If exactly one match, return a single object for convenience
    if (mapped.length === 1) {
      return NextResponse.json({ match: mapped[0], matches: mapped })
    }

    return NextResponse.json({ matches: mapped })
  } catch (err: any) {
    console.error('Sheets lookup error:', err?.message || err)
    return NextResponse.json({ error: 'Sheets lookup failed' }, { status: 500 })
  }
}
