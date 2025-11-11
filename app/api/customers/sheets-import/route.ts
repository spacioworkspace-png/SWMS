import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { supabase } from '@/lib/supabase'
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

  // Explicit mapping for provided headers
  const first_name =
    obj.full_name_first_name || obj.first_name || obj.firstname || ''
  const last_name =
    obj.full_name_last_name || obj.last_name || obj.lastname || ''
  const email = obj.email_address || obj.email || ''
  const mobile_number =
    obj.mobile_number || obj.phone || obj.mobile || obj.phone_number || ''
  const aadhaar_card_url = obj.upload_aadhaar_card || obj.aadhaar_card_url || ''
  const street_address =
    obj.residential_address_street_address || obj.street_address || obj.address || ''
  const street_address_line2 =
    obj.residential_address_street_address_line_2 ||
    obj.residential_address_street_address_line2 ||
    obj.street_address_line2 ||
    ''
  const city = obj.residential_address_city || obj.city || ''
  const state_province =
    obj.residential_address_state_province || obj.state_province || obj.state || ''
  const postal_code =
    obj.residential_address_postal_zip_code || obj.postal_code || obj.zip || obj.pincode || ''
  const country = obj.residential_address_country || obj.country || ''

  let registration_type_raw =
    obj.are_you_registering_as_an_individual_or_a_company || obj.registration_type || obj.type || ''
  registration_type_raw = String(registration_type_raw).toLowerCase()
  const registration_type: 'individual' | 'company' =
    registration_type_raw.includes('company') ? 'company' : 'individual'

  const company_name = obj.company_name || obj.company || ''
  const company_gstin =
    obj.company_gstin_goods_and_services_tax_identification_number ||
    obj.company_gstin ||
    obj.gstin ||
    obj.tax_id ||
    ''
  const nature_of_business = obj.nature_of_business || obj.business_nature || ''
  const company_registration_doc_url =
    obj.upload_company_registration_documents_optional ||
    obj.company_registration_doc_url ||
    ''

  const pays_gst = registration_type === 'company' ||
    String(obj.pays_gst || obj.gst || '').toLowerCase() === 'true' ||
    String(obj.pays_gst || obj.gst || '').toLowerCase() === 'yes'

  const form: any = {
    first_name,
    last_name,
    email,
    mobile_number,
    aadhaar_card_url,
    street_address,
    street_address_line2,
    city,
    state_province,
    postal_code,
    country,
    registration_type,
    company_name,
    company_gstin,
    nature_of_business,
    company_registration_doc_url,
    pays_gst,
  }

  return form
}

function toCustomerInsert(form: any) {
  return {
    name: `${form.first_name || ''} ${form.last_name || ''}`.trim(),
    first_name: form.first_name || null,
    last_name: form.last_name || null,
    email: form.email || null,
    mobile_number: form.mobile_number || null,
    phone: form.mobile_number || null,
    aadhaar_card_url: form.aadhaar_card_url || null,
    street_address: form.street_address || null,
    street_address_line2: form.street_address_line2 || null,
    city: form.city || null,
    state_province: form.state_province || null,
    postal_code: form.postal_code || null,
    country: form.country || null,
    registration_type: form.registration_type || null,
    company: form.registration_type === 'company' ? form.company_name : null,
    company_gstin: form.company_gstin || null,
    nature_of_business: form.nature_of_business || null,
    company_registration_doc_url: form.company_registration_doc_url || null,
    tax_id: form.company_gstin || null,
    pays_gst: !!(form.pays_gst || form.registration_type === 'company'),
  }
}

export async function POST(_req: NextRequest) {
  try {
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

    const usingKeyFile = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE)
    if ((!SHEET_ID) || (!usingKeyFile && (!CLIENT_EMAIL || !PRIVATE_KEY))) {
      const missing: string[] = []
      if (!SHEET_ID) missing.push('GOOGLE_SHEETS_ID')
      if (!usingKeyFile && !CLIENT_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL')
      if (!usingKeyFile && !PRIVATE_KEY) missing.push('GOOGLE_SERVICE_ACCOUNT_KEY')
      return NextResponse.json({ error: `Missing Google Sheets env config: ${missing.join(', ')}` }, { status: 500 })
    }

    if (!usingKeyFile) {
      // Normalize key just in case
      PRIVATE_KEY = PRIVATE_KEY.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      if (!PRIVATE_KEY.includes('-----BEGIN PRIVATE KEY-----')) {
        throw new Error('Invalid service account private key format')
      }
    }

    let sheets
    if (usingKeyFile) {
      const auth = new google.auth.GoogleAuth({
        keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      })
      sheets = google.sheets({ version: 'v4', auth })
    } else {
      const auth = new google.auth.GoogleAuth({
        credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      })
      sheets = google.sheets({ version: 'v4', auth })
    }
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: SHEET_RANGE,
    })

    const values: string[][] = (resp.data.values as string[][]) || []
    if (values.length === 0) {
      return NextResponse.json({ inserted: 0, skipped: 0, totalRows: 0 })
    }

    const headers: string[] = (values[0] as string[]) || []
    const rows: string[][] = values.slice(1) as string[][]

    // Build current unique sets from DB (email and phone)
    const { data: existing, error: fetchErr } = await supabase
      .from('customers')
      .select('email, mobile_number, phone')

    if (fetchErr) throw fetchErr

    const emails = new Set(
      (existing || [])
        .map((c: any) => (c.email ? String(c.email).trim().toLowerCase() : ''))
        .filter(Boolean)
    )
    const phones = new Set(
      (existing || [])
        .map((c: any) => (c.mobile_number || c.phone ? String(c.mobile_number || c.phone).replace(/\s+/g, '') : ''))
        .filter(Boolean)
    )

    const toInsert = [] as any[]
    let skipped = 0

    for (const row of rows) {
      const form = mapRowToForm(headers, row)
      const email = (form.email || '').trim().toLowerCase()
      const phone = (form.mobile_number || '').replace(/\s+/g, '')

      const hasEmail = email && emails.has(email)
      const hasPhone = phone && phones.has(phone)
      if (hasEmail || hasPhone) {
        skipped++
        continue
      }

      const insertObj = toCustomerInsert(form)
      toInsert.push(insertObj)

      if (email) emails.add(email)
      if (phone) phones.add(phone)
    }

    let inserted = 0
    if (toInsert.length > 0) {
      // Batch in chunks to avoid payload limits
      const chunkSize = 200
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize)
        const { error: insertErr, count } = await supabase
          .from('customers')
          .insert(chunk, { count: 'exact' })
        if (insertErr) throw insertErr
        inserted += count || chunk.length
      }
    }

    return NextResponse.json({ inserted, skipped, totalRows: rows.length })
  } catch (err: any) {
    console.error('Sheets import error:', err?.message || err)
    return NextResponse.json({ error: 'Sheets import failed' }, { status: 500 })
  }
}
