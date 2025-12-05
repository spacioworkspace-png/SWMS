-- Create table for Zoho Books invoice imports
CREATE TABLE IF NOT EXISTS zoho_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(255) NOT NULL,
  invoice_date DATE NOT NULL,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  amount DECIMAL(10, 2) NOT NULL,
  base_amount DECIMAL(10, 2),
  gst_amount DECIMAL(10, 2) DEFAULT 0,
  includes_gst BOOLEAN DEFAULT false,
  payment_date DATE,
  payment_status VARCHAR(50),
  month_key VARCHAR(7), -- YYYY-MM format for grouping
  zoho_customer_id VARCHAR(255),
  notes TEXT,
  import_batch_id UUID, -- To group imports together
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(invoice_number, import_batch_id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_zoho_invoices_month_key ON zoho_invoices(month_key);
CREATE INDEX IF NOT EXISTS idx_zoho_invoices_customer_name ON zoho_invoices(customer_name);
CREATE INDEX IF NOT EXISTS idx_zoho_invoices_invoice_date ON zoho_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_zoho_invoices_import_batch_id ON zoho_invoices(import_batch_id);

-- Create trigger to update updated_at (drop if exists first)
DROP TRIGGER IF EXISTS update_zoho_invoices_updated_at ON zoho_invoices;
CREATE TRIGGER update_zoho_invoices_updated_at BEFORE UPDATE ON zoho_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create table for manual payment to invoice assignments
CREATE TABLE IF NOT EXISTS payment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  zoho_invoice_id UUID NOT NULL REFERENCES zoho_invoices(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(payment_id),
  UNIQUE(zoho_invoice_id)
);

-- Indexes for payment_assignments
CREATE INDEX IF NOT EXISTS idx_payment_assignments_payment_id ON payment_assignments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_assignments_zoho_invoice_id ON payment_assignments(zoho_invoice_id);

-- Create trigger to update updated_at (drop if exists first)
DROP TRIGGER IF EXISTS update_payment_assignments_updated_at ON payment_assignments;
CREATE TRIGGER update_payment_assignments_updated_at BEFORE UPDATE ON payment_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

