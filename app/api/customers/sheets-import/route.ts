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

// Helper function to truncate strings to max length
function truncate(str: string | null | undefined, maxLength: number): string | null {
  if (!str) return null
  const s = String(str).trim()
  if (s.length <= maxLength) return s
  return s.substring(0, maxLength)
}

function toCustomerInsert(form: any) {
  // Truncate fields that have VARCHAR(255) limits in the database
  const name = `${form.first_name || ''} ${form.last_name || ''}`.trim()
  
  return {
    name: truncate(name, 255) || null,
    first_name: truncate(form.first_name, 255),
    last_name: truncate(form.last_name, 255),
    email: truncate(form.email, 255),
    mobile_number: truncate(form.mobile_number, 50), // phone fields are VARCHAR(50)
    phone: truncate(form.mobile_number, 50),
    aadhaar_card_url: form.aadhaar_card_url || null, // TEXT field, no limit
    street_address: truncate(form.street_address, 255),
    street_address_line2: truncate(form.street_address_line2, 255),
    city: truncate(form.city, 100), // city is VARCHAR(100)
    state_province: truncate(form.state_province, 100), // state_province is VARCHAR(100)
    postal_code: truncate(form.postal_code, 20), // postal_code is VARCHAR(20)
    country: truncate(form.country, 100), // country is VARCHAR(100)
    registration_type: truncate(form.registration_type, 50) || null, // registration_type is VARCHAR(50)
    company: form.registration_type === 'company' ? truncate(form.company_name, 255) : null,
    company_gstin: truncate(form.company_gstin, 100), // company_gstin is VARCHAR(100)
    nature_of_business: truncate(form.nature_of_business, 255),
    company_registration_doc_url: form.company_registration_doc_url || null, // TEXT field, no limit
    tax_id: truncate(form.company_gstin, 100),
    pays_gst: !!(form.pays_gst || form.registration_type === 'company'),
  }
}

export async function POST(_req: NextRequest) {
  try {
    const SHEET_ID = process.env.GOOGLE_SHEETS_ID
    const SHEET_TAB = process.env.GOOGLE_SHEETS_TAB || 'entry'
    // Properly quote tab name if it contains spaces or special characters
    const quotedTab = SHEET_TAB.includes(' ') || SHEET_TAB.includes('-') ? `'${SHEET_TAB}'` : SHEET_TAB
    const SHEET_RANGE = process.env.GOOGLE_SHEETS_RANGE || `${quotedTab}!A:Z`
    
    console.log('Sheet import config:', {
      SHEET_ID: SHEET_ID ? `${SHEET_ID.substring(0, 10)}...` : 'MISSING',
      SHEET_TAB,
      SHEET_RANGE,
      usingKeyFile: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE),
    })
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
      const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
      if (!keyFilePath) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set')
      }
      const absKeyPath = path.isAbsolute(keyFilePath) ? keyFilePath : path.join(process.cwd(), keyFilePath)
      if (!fs.existsSync(absKeyPath)) {
        throw new Error(`Service account key file not found: ${absKeyPath}`)
      }
      const auth = new google.auth.GoogleAuth({
        keyFilename: absKeyPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      })
      sheets = google.sheets({ version: 'v4', auth })
    } else {
      if (!CLIENT_EMAIL || !PRIVATE_KEY) {
        throw new Error('Service account credentials are missing')
      }
      const auth = new google.auth.GoogleAuth({
        credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      })
      sheets = google.sheets({ version: 'v4', auth })
    }
    
    console.log('Fetching data from sheet:', SHEET_ID, 'Range:', SHEET_RANGE)
    let resp
    try {
      resp = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: SHEET_RANGE,
      })
    } catch (apiError: any) {
      console.error('Google Sheets API error:', apiError)
      if (apiError.code === 404) {
        throw new Error(`Sheet not found. Please check GOOGLE_SHEETS_ID and ensure the service account has access.`)
      } else if (apiError.code === 403) {
        throw new Error(`Access denied. Please ensure the service account has permission to read the sheet.`)
      } else if (apiError.message?.includes('Unable to parse range')) {
        throw new Error(`Invalid range format: ${SHEET_RANGE}. Please check GOOGLE_SHEETS_TAB and GOOGLE_SHEETS_RANGE.`)
      }
      throw new Error(`Google Sheets API error: ${apiError.message || apiError}`)
    }

    const values: string[][] = (resp.data.values as string[][]) || []
    if (values.length === 0) {
      console.warn('No data returned from sheet. Check if the sheet has data or if the range is correct.')
      return NextResponse.json({ inserted: 0, skipped: 0, totalRows: 0 })
    }
    
    console.log(`Fetched ${values.length} rows from sheet`)

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
    const validationErrors: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
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
        
        // Validate lengths before inserting
        const issues: string[] = []
        if (insertObj.name && insertObj.name.length > 255) issues.push(`name (${insertObj.name.length} chars)`)
        if (insertObj.street_address && insertObj.street_address.length > 255) issues.push(`street_address (${insertObj.street_address.length} chars)`)
        if (insertObj.street_address_line2 && insertObj.street_address_line2.length > 255) issues.push(`street_address_line2 (${insertObj.street_address_line2.length} chars)`)
        if (insertObj.nature_of_business && insertObj.nature_of_business.length > 255) issues.push(`nature_of_business (${insertObj.nature_of_business.length} chars)`)
        if (insertObj.company && insertObj.company.length > 255) issues.push(`company (${insertObj.company.length} chars)`)
        
        if (issues.length > 0) {
          validationErrors.push(`Row ${i + 2}: Fields too long after truncation: ${issues.join(', ')}`)
          skipped++
          continue
        }
        
        toInsert.push(insertObj)

        if (email) emails.add(email)
        if (phone) phones.add(phone)
      } catch (rowError: any) {
        validationErrors.push(`Row ${i + 2}: ${rowError.message || 'Unknown error'}`)
        skipped++
        continue
      }
    }
    
    if (validationErrors.length > 0) {
      console.warn('Validation errors:', validationErrors)
    }

    let inserted = 0
    const insertErrors: string[] = []
    
    if (toInsert.length > 0) {
      // Batch in chunks to avoid payload limits
      const chunkSize = 200
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize)
        try {
          const { error: insertErr, count } = await supabase
            .from('customers')
            .insert(chunk, { count: 'exact' })
          if (insertErr) {
            // Try to identify which field is causing the issue
            console.error('Insert error for chunk:', insertErr)
            // Try inserting one by one to identify the problematic record
            if (insertErr.code === '22001') { // value too long error
              for (let j = 0; j < chunk.length; j++) {
                try {
                  const { error: singleErr } = await supabase
                    .from('customers')
                    .insert([chunk[j]])
                  if (singleErr) {
                    insertErrors.push(`Record ${i + j + 1}: ${singleErr.message}`)
                    // Log the problematic record for debugging
                    console.error('Problematic record:', JSON.stringify(chunk[j], null, 2))
                  } else {
                    inserted++
                  }
                } catch (singleError: any) {
                  insertErrors.push(`Record ${i + j + 1}: ${singleError.message}`)
                }
              }
            } else {
              throw insertErr
            }
          } else {
            inserted += count || chunk.length
          }
        } catch (chunkError: any) {
          insertErrors.push(`Chunk ${Math.floor(i / chunkSize) + 1}: ${chunkError.message}`)
        }
      }
    }

    return NextResponse.json({ 
      inserted, 
      skipped, 
      totalRows: rows.length,
      ...(validationErrors.length > 0 && { validationErrors }),
      ...(insertErrors.length > 0 && { insertErrors })
    })
  } catch (err: any) {
    console.error('Sheets import error:', err)
    const errorMessage = err?.message || err?.toString() || 'Unknown error'
    const errorDetails = {
      message: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
    }
    return NextResponse.json({ 
      error: 'Sheets import failed',
      details: errorDetails.message,
      ...(process.env.NODE_ENV === 'development' && { fullError: errorDetails })
    }, { status: 500 })
  }
}
