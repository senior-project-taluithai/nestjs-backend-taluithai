-- Fix incorrect English names for Thai provinces
-- Issue: Some province name_en values were incorrectly auto-translated
-- Example: "กระบี่" (Krabi province) was translated as "Sword" instead of "Krabi"

-- Start transaction
BEGIN;

-- Fix Krabi province (id: 344)
-- "กระบี่" in Thai can mean "sword" but as a province name, it's "Krabi"
UPDATE provinces 
SET name_en = 'Krabi' 
WHERE id = 344 AND name = 'กระบี่' AND name_en = 'Sword';

-- Fix Phrae province (id: 113)
-- "แพร่" in Thai can mean "spread" but as a province name, it's "Phrae"
UPDATE provinces 
SET name_en = 'Phrae' 
WHERE id = 113 AND name = 'แพร่' AND name_en = 'spread';

-- Verify the changes
SELECT id, name, name_en, region_name FROM provinces WHERE id IN (113, 344);

COMMIT;