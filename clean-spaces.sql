-- Clean Spaces Table
-- This script will:
-- 1. Fix "Cbain" typo to "Cabin" (to match the enum type)
-- 2. Standardize all space names to "CABIN " + last 3 digits

-- Step 1: Fix "Cbain" typo to "Cabin" (matching the enum type 'Cabin')
UPDATE spaces
SET type = 'Cabin'
WHERE type = 'Cbain' OR type = 'cbain' OR LOWER(type) = 'cbain';

-- Step 2: Extract last 3 digits from space names and format as "CABIN " + last 3 digits
-- This uses reverse to find the first 3-digit sequence from the end, then reverses it back
UPDATE spaces
SET name = 'CABIN ' || REVERSE(SUBSTRING(REVERSE(name) FROM '[0-9]{3}'))
WHERE name ~ '[0-9]{3}';

-- Verify the changes (run this BEFORE the update to see what will change)
-- SELECT 
--   id, 
--   name as current_name,
--   'CABIN ' || REVERSE(SUBSTRING(REVERSE(name) FROM '[0-9]{3}')) as new_name,
--   type, 
--   price_per_day, 
--   is_available 
-- FROM spaces 
-- WHERE name ~ '[0-9]{3}'
-- ORDER BY name;

-- After running the updates, verify all changes
SELECT id, name, type, price_per_day, is_available 
FROM spaces 
ORDER BY name;
