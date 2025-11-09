-- Migration to add new features
-- Run this in Supabase SQL Editor after the initial schema

-- Add security deposit to assignments
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS security_deposit DECIMAL(10, 2) DEFAULT 0;

-- Expand customers table with detailed fields
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS aadhaar_card_url TEXT,
ADD COLUMN IF NOT EXISTS street_address VARCHAR(255),
ADD COLUMN IF NOT EXISTS street_address_line2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS state_province VARCHAR(100),
ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS country VARCHAR(100),
ADD COLUMN IF NOT EXISTS registration_type VARCHAR(50) DEFAULT 'individual',
ADD COLUMN IF NOT EXISTS company_gstin VARCHAR(100),
ADD COLUMN IF NOT EXISTS nature_of_business VARCHAR(255),
ADD COLUMN IF NOT EXISTS company_registration_doc_url TEXT;

-- Update existing name to first_name if name exists
UPDATE customers 
SET first_name = name 
WHERE first_name IS NULL AND name IS NOT NULL;

-- Create function to automatically mark space as occupied when assigned
CREATE OR REPLACE FUNCTION mark_space_occupied()
RETURNS TRIGGER AS $$
BEGIN
  -- Mark space as occupied when assignment is created with active status
  IF NEW.status = 'active' THEN
    UPDATE spaces SET is_available = false WHERE id = NEW.space_id;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create function to mark space as available when assignment ends
CREATE OR REPLACE FUNCTION mark_space_available()
RETURNS TRIGGER AS $$
BEGIN
  -- Mark space as available when assignment status changes to inactive or completed
  IF NEW.status IN ('inactive', 'completed') AND OLD.status = 'active' THEN
    UPDATE spaces SET is_available = true WHERE id = NEW.space_id;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to mark space occupied on assignment creation
DROP TRIGGER IF EXISTS trigger_mark_space_occupied ON assignments;
CREATE TRIGGER trigger_mark_space_occupied
  AFTER INSERT ON assignments
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION mark_space_occupied();

-- Create trigger to update space availability on assignment status change
DROP TRIGGER IF EXISTS trigger_mark_space_available ON assignments;
CREATE TRIGGER trigger_mark_space_available
  AFTER UPDATE ON assignments
  FOR EACH ROW
  EXECUTE FUNCTION mark_space_available();

-- Create trigger to mark space available when assignment is deleted
CREATE OR REPLACE FUNCTION mark_space_available_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE spaces SET is_available = true WHERE id = OLD.space_id;
  RETURN OLD;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_mark_space_available_on_delete ON assignments;
CREATE TRIGGER trigger_mark_space_available_on_delete
  AFTER DELETE ON assignments
  FOR EACH ROW
  EXECUTE FUNCTION mark_space_available_on_delete();

