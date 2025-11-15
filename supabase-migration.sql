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

-- Also mark space occupied if status changes to active on update
DROP TRIGGER IF EXISTS trigger_mark_space_occupied_on_update ON assignments;
CREATE TRIGGER trigger_mark_space_occupied_on_update
  AFTER UPDATE ON assignments
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND (OLD.status IS DISTINCT FROM NEW.status))
  EXECUTE FUNCTION mark_space_occupied();

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


-- Auto-set assignment status to 'inactive' if end_date is in the past on insert/update
CREATE OR REPLACE FUNCTION set_assignment_status_from_end_date()
RETURNS TRIGGER AS $$
BEGIN
  -- If end_date is NULL or today/future, mark active; if past, mark inactive
  IF NEW.end_date IS NULL OR NEW.end_date >= CURRENT_DATE THEN
    NEW.status := 'active';
  ELSE
    NEW.status := 'inactive';
    -- When assignment has ended, zero out security deposit
    NEW.security_deposit := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_assignment_status_from_end_date ON assignments;
CREATE TRIGGER trigger_set_assignment_status_from_end_date
  BEFORE INSERT OR UPDATE OF end_date ON assignments
  FOR EACH ROW
  EXECUTE FUNCTION set_assignment_status_from_end_date();

-- One-time backfill to inactivate existing expired assignments
UPDATE assignments
SET status = 'inactive'
WHERE status = 'active' AND end_date IS NOT NULL AND end_date < CURRENT_DATE;

-- One-time backfill to activate assignments with null or future end dates
UPDATE assignments
SET status = 'active'
WHERE (end_date IS NULL OR end_date >= CURRENT_DATE) AND status <> 'active';

-- Backfill: zero security deposit for assignments that have ended
UPDATE assignments
SET security_deposit = 0
WHERE end_date IS NOT NULL AND end_date < CURRENT_DATE AND security_deposit IS DISTINCT FROM 0;


-- Expenses table to track operational expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(10,2) NOT NULL,
  category VARCHAR(100),
  destination VARCHAR(255),
  vendor VARCHAR(255),
  includes_gst BOOLEAN DEFAULT false,
  gst_amount DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  attachment_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for expenses
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_destination ON expenses(destination);

-- Unified space availability sync based on active assignments
CREATE OR REPLACE FUNCTION sync_space_availability()
RETURNS TRIGGER AS $$
DECLARE
  sid UUID;
BEGIN
  sid := COALESCE(NEW.space_id, OLD.space_id);
  IF sid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE spaces
  SET is_available = NOT EXISTS (
    SELECT 1 FROM assignments WHERE space_id = sid AND status = 'active'
  )
  WHERE id = sid;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop legacy triggers to avoid conflicts
DROP TRIGGER IF EXISTS trigger_mark_space_occupied ON assignments;
DROP TRIGGER IF EXISTS trigger_mark_space_available ON assignments;
DROP TRIGGER IF EXISTS trigger_mark_space_occupied_on_update ON assignments;
DROP TRIGGER IF EXISTS trigger_mark_space_available_on_delete ON assignments;

-- Create unified triggers for insert, update, delete
DROP TRIGGER IF EXISTS trigger_sync_space_availability_ins ON assignments;
CREATE TRIGGER trigger_sync_space_availability_ins
  AFTER INSERT ON assignments
  FOR EACH ROW
  EXECUTE FUNCTION sync_space_availability();

DROP TRIGGER IF EXISTS trigger_sync_space_availability_upd ON assignments;
CREATE TRIGGER trigger_sync_space_availability_upd
  AFTER UPDATE ON assignments
  FOR EACH ROW
  EXECUTE FUNCTION sync_space_availability();

DROP TRIGGER IF EXISTS trigger_sync_space_availability_del ON assignments;
CREATE TRIGGER trigger_sync_space_availability_del
  AFTER DELETE ON assignments
  FOR EACH ROW
  EXECUTE FUNCTION sync_space_availability();
