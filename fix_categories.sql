-- Fix categories: Replace 1,609 place-name entries with 5 proper TAT categories
-- These IDs match the category_ids stored in Qdrant place_recommendations vectors
BEGIN;

DELETE FROM place_categories;
DELETE FROM categories;

INSERT INTO categories (id, name, name_en) VALUES
  (2,  'ที่พัก', 'accommodation'),
  (3,  'สถานที่ท่องเที่ยว', 'attraction'),
  (6,  'ร้านค้า', 'shop'),
  (8,  'ร้านอาหาร กาแฟ เบเกอรี่', 'restaurant'),
  (13, 'สถานที่อื่นๆ', 'other');

SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));

INSERT INTO place_categories (place_id, category_id)
SELECT p.id, tp.category_id
FROM places p
JOIN tat.places tp ON tp.place_id = p.id
WHERE tp.category_id IN (2, 3, 6, 8, 13)
ON CONFLICT DO NOTHING;

INSERT INTO place_categories (place_id, category_id)
SELECT p.id, 13
FROM places p
WHERE NOT EXISTS (
  SELECT 1 FROM place_categories pc WHERE pc.place_id = p.id
)
ON CONFLICT DO NOTHING;

UPDATE users SET "preferredCategoryIds" = '{}' WHERE "preferredCategoryIds" != '{}';

COMMIT;
