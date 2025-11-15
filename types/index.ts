export type SpaceType = 'Cabin' | 'Desk' | 'Meeting Room' | 'Virtual Office' | 'Day Pass';
export type BillingCycle = 'daily' | 'monthly' | 'yearly';
export type RegistrationType = 'individual' | 'company';

export interface Space {
  id: string;
  name: string;
  type: SpaceType;
  capacity: number | null;
  price_per_day: number;
  description: string | null;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_number: string | null;
  company: string | null;
  address: string | null;
  tax_id: string | null;
  pays_gst: boolean;
  aadhaar_card_url: string | null;
  street_address: string | null;
  street_address_line2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  registration_type: RegistrationType | null;
  company_gstin: string | null;
  nature_of_business: string | null;
  company_registration_doc_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  customer_id: string;
  space_id: string;
  start_date: string;
  end_date: string | null;
  status: string;
  notes: string | null;
  security_deposit: number;
  monthly_price: number | null;
  includes_gst?: boolean;
  payment_destination?: string | null;
  agreement_pdf_url: string | null;
  agreement_expiry_date: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  space?: Space;
}

export interface Expense {
  id: string;
  date: string;
  amount: number;
  category: string | null;
  destination: string | null;
  includes_gst: boolean;
  gst_amount: number | null;
  vendor: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  customer_id: string;
  assignment_id: string | null;
  amount: number;
  payment_date: string;
  payment_for_date: string;
  includes_gst: boolean;
  gst_amount: number;
  destination: string | null;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  assignment?: Assignment;
}

