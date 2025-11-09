-- Migration v2: Add agreement fields and update pricing
-- Run this after the first migration

-- Add agreement fields to assignments
ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS agreement_pdf_url TEXT,
ADD COLUMN IF NOT EXISTS agreement_expiry_date DATE,
ADD COLUMN IF NOT EXISTS monthly_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS includes_gst BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payment_destination VARCHAR(255),
ADD COLUMN IF NOT EXISTS renewal_date DATE;

-- Create function to calculate renewal date (11 months after start date)
CREATE OR REPLACE FUNCTION calculate_renewal_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.start_date IS NOT NULL THEN
    NEW.renewal_date := (NEW.start_date + INTERVAL '11 months')::DATE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate renewal date
DROP TRIGGER IF EXISTS trigger_calculate_renewal_date ON assignments;
CREATE TRIGGER trigger_calculate_renewal_date
  BEFORE INSERT OR UPDATE ON assignments
  FOR EACH ROW
  WHEN (NEW.start_date IS NOT NULL)
  EXECUTE FUNCTION calculate_renewal_date();

-- Update spaces table - rename price_per_day to monthly_price for clarity
-- Note: We'll keep price_per_day for backward compatibility but treat it as monthly
-- You can manually update existing data if needed

-- Add comment to clarify pricing
COMMENT ON COLUMN spaces.price_per_day IS 'Monthly price for the space';

