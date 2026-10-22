-- AETERNA PostgreSQL schema for Liara. Idempotent; execute with psql -f sql/schema.sql.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS aeterna;

CREATE TABLE IF NOT EXISTS aeterna.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  national_id text,
  phone text,
  age integer NOT NULL DEFAULT 0 CHECK (age BETWEEN 0 AND 130),
  sex text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patients_full_name ON aeterna.patients (full_name);

CREATE TABLE IF NOT EXISTS aeterna.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES aeterna.patients(id) ON DELETE SET NULL,
  access_code text REFERENCES aeterna.patients(access_code) ON DELETE SET NULL,
  patient_name text,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  chief_complaint text,
  summary text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visits_patient_date ON aeterna.visits (patient_id, visit_date DESC);

CREATE TABLE IF NOT EXISTS aeterna.lab_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code text NOT NULL REFERENCES aeterna.patients(access_code) ON UPDATE CASCADE ON DELETE CASCADE,
  visit_id uuid REFERENCES aeterna.visits(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_panels_access_code ON aeterna.lab_panels (access_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_panels_visit_id ON aeterna.lab_panels (visit_id);

CREATE TABLE IF NOT EXISTS aeterna.knowledge_base (
  chunk_id bigserial PRIMARY KEY,
  doc_title text,
  doc_source text,
  category text,
  content text NOT NULL,
  embedding vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON aeterna.knowledge_base (category);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ON aeterna.knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS aeterna.ai_recommendations (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  visit_id uuid REFERENCES aeterna.visits(id) ON DELETE SET NULL,
  query text NOT NULL,
  category text,
  grounded boolean NOT NULL DEFAULT false,
  refusal_reason text,
  answer text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_visit ON aeterna.ai_recommendations (visit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_grounded ON aeterna.ai_recommendations (grounded, created_at DESC);

CREATE TABLE IF NOT EXISTS aeterna.audit_events (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor text,
  action text NOT NULL,
  patient_access_code text,
  resource_type text,
  resource_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_events_time ON aeterna.audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_patient ON aeterna.audit_events (patient_access_code, occurred_at DESC);

CREATE OR REPLACE FUNCTION aeterna.match_knowledge_base(
  p_embedding vector(1536), p_category text DEFAULT NULL,
  p_threshold float8 DEFAULT 0.35, p_limit int DEFAULT 8
)
RETURNS TABLE (chunk_id bigint, doc_title text, doc_source text, content text, similarity float8)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT k.chunk_id, k.doc_title, k.doc_source, k.content,
         (1 - (k.embedding <=> p_embedding))::float8 AS similarity
  FROM aeterna.knowledge_base k
  WHERE k.embedding IS NOT NULL
    AND (p_category IS NULL OR k.category = p_category)
    AND 1 - (k.embedding <=> p_embedding) >= p_threshold
  ORDER BY k.embedding <=> p_embedding
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 100));
$$;

CREATE OR REPLACE FUNCTION aeterna.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS patients_touch_updated_at ON aeterna.patients;
CREATE TRIGGER patients_touch_updated_at BEFORE UPDATE ON aeterna.patients
FOR EACH ROW EXECUTE FUNCTION aeterna.touch_updated_at();

CREATE OR REPLACE FUNCTION aeterna.latest_lab_panel(p_access_code text)
RETURNS SETOF aeterna.lab_panels
LANGUAGE sql STABLE AS $$
  SELECT lp.* FROM aeterna.lab_panels lp
  WHERE lp.access_code = p_access_code ORDER BY lp.created_at DESC LIMIT 1;
$$;


-- ============================================================
-- SUPPLEMENT CATALOG (288 items: 273 from iran_supplements_all_three_sites
-- + 15 specialized items for stress management, sleep regulation,
-- and morning/daytime energy)
-- ============================================================
CREATE TABLE IF NOT EXISTS aeterna.supplements (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  generic_name text,
  category text,
  brand text,
  origin text NOT NULL DEFAULT 'core_catalog',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplements_category ON aeterna.supplements (category);
CREATE INDEX IF NOT EXISTS idx_supplements_name ON aeterna.supplements (name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplements_name_brand ON aeterna.supplements (name, COALESCE(brand, ''));

INSERT INTO aeterna.supplements (name, generic_name, category, brand, origin)
VALUES
  ('قرص آمی‌ویت', 'Amivit Tablet', 'ویتامین‌ها و مینرال‌ها', 'مکمل‌شاپ / داروسازی امید', 'core_catalog'),
  ('ویتامین C (اسید آسکوربیک)', 'Ascorbic Acid (Vitamin C)', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('ویتامین B7 (بیوتین)', 'Biotin (Vitamin B7)', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('کلسیم', 'Calcium', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('کپسول کلسیم + D3', 'Calcium + D3 Capsule', 'ویتامین‌ها و مینرال‌ها', 'داروکده / یوروویتال', 'core_catalog'),
  ('قرص کلسیم سیترات', 'Calcium Citrate Tablet', 'ویتامین‌ها و مینرال‌ها', 'داروکده / یوروویتال', 'core_catalog'),
  ('کروم', 'Chromium', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('کپسول کروم (کنترل قند)', 'Chromium Picolinate', 'ویتامین‌ها و مینرال‌ها', 'داروکده / نوتراکس', 'core_catalog'),
  ('کپسول کوآنزیم Q10', 'Coenzyme Q10 Capsule', 'ویتامین‌ها و مینرال‌ها', 'داروکده / هلث اید', 'core_catalog'),
  ('مس', 'Copper', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قرص مس', 'Copper Tablet', 'ویتامین‌ها و مینرال‌ها', 'داروکده / کاله', 'core_catalog'),
  ('ویتامین B12 (سیانوکوبالامین)', 'Cyanocobalamin (Vitamin B12)', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('فلوئورید', 'Fluoride', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('ویتامین B9 (اسید فولیک)', 'Folic Acid (Vitamin B9)', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قرص اسید فولیک 1mg', 'Folic Acid 1mg', 'ویتامین‌ها و مینرال‌ها', 'داروکده / کاله', 'core_catalog'),
  ('ید', 'Iodine', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قرص ید و پتاسیم یدید', 'Iodine / Potassium Iodide', 'ویتامین‌ها و مینرال‌ها', 'داروکده / کاله', 'core_catalog'),
  ('آهن', 'Iron', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قرص آهن فولیک (فروگلوبین)', 'Iron + Folic Acid', 'ویتامین‌ها و مینرال‌ها', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('قرص آهن + C (فروفوم)', 'Iron + Vitamin C Tablet', 'ویتامین‌ها و مینرال‌ها', 'داروکده / کاله', 'core_catalog'),
  ('قطره آهن (فولی‌ویر)', 'Iron Drops', 'ویتامین‌ها و مینرال‌ها', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('پلی‌ویتامین بدون آهن', 'Iron-Free Multivitamin', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('شربت آهن کودکان', 'Kids Iron Syrup', 'ویتامین‌ها و مینرال‌ها', 'داروکده / کاله', 'core_catalog'),
  ('شربت مولتی‌ویتامین کودکان', 'Kids Multivitamin Syrup', 'ویتامین‌ها و مینرال‌ها', 'داروکده / کاله', 'core_catalog'),
  ('منیزیم', 'Magnesium', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قرص منیزیم + B6', 'Magnesium + B6 Tablet', 'ویتامین‌ها و مینرال‌ها', 'داروکده / کاله', 'core_catalog'),
  ('منگنز', 'Manganese', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قرص منگنز', 'Manganese Tablet', 'ویتامین‌ها و مینرال‌ها', 'داروکده / کاله', 'core_catalog'),
  ('مولیبدن', 'Molybdenum', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('مولتی‌ویتامین', 'Multivitamin', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قطره مولتی‌ویتامین (مولتی‌می)', 'Multivitamin Drops', 'ویتامین‌ها و مینرال‌ها', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('قرص مولتی‌ویتامین مینرال (سنتروم)', 'Multivitamin Mineral Tablet', 'ویتامین‌ها و مینرال‌ها', 'داروکده / یوروویتال', 'core_catalog'),
  ('قرص دفلاوریت (واحد زیست‌فناوری)', 'Multivitamin Tablet', 'ویتامین‌ها و مینرال‌ها', 'مکمل‌شاپ / یوروویتال', 'core_catalog'),
  ('مولتی‌ویتامین و مینرال', 'Multivitamin and Minerals', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('ویتامین B3 (نیاسین)', 'Niacin (Vitamin B3)', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('کپسول امگا 3 (روغن ماهی)', 'Omega 3 Fish Oil', 'ویتامین‌ها و مینرال‌ها', 'داروکده / هلث اید', 'core_catalog'),
  ('کپسول امگا 3-6-9', 'Omega 3-6-9 Capsule', 'ویتامین‌ها و مینرال‌ها', 'داروکده / هلث اید', 'core_catalog'),
  ('ویتامین B5 (اسید پانتوتنیک)', 'Pantothenic Acid (Vitamin B5)', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('مولتی‌ویتامین کودکان', 'Pediatric Multivitamin', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('فسفر', 'Phosphorus', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('پتاسیم', 'Potassium', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قرص پتاسیم', 'Potassium Tablet', 'ویتامین‌ها و مینرال‌ها', 'داروکده / کاله', 'core_catalog'),
  ('مولتی‌ویتامین مخصوص بارداری', 'Prenatal Multivitamin', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('ویتامین B6 (پیریدوکسین)', 'Pyridoxine (Vitamin B6)', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('ویتامین B2 (ریبوفلاوین)', 'Riboflavin (Vitamin B2)', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('سلنیوم', 'Selenium', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('مولتی‌ویتامین سالمندان', 'Senior Multivitamin', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('مولتی‌ویتامین ورزشی', 'Sport Multivitamin', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('ویتامین B1 (تیامین)', 'Thiamine (Vitamin B1)', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('ویتامین A', 'Vitamin A', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قرص ویتامین A', 'Vitamin A Tablet', 'ویتامین‌ها و مینرال‌ها', 'داروکده / کاله', 'core_catalog'),
  ('کمپلکس ویتامین B', 'Vitamin B Complex', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قرص ویتامین B-کمپلکس', 'Vitamin B-Complex', 'ویتامین‌ها و مینرال‌ها', 'داروکده / یوروویتال', 'core_catalog'),
  ('قرص ویتامین C جوشان (ویتال سی)', 'Vitamin C Effervescent', 'ویتامین‌ها و مینرال‌ها', 'مکمل‌شاپ / یوروویتال', 'core_catalog'),
  ('ویتامین D', 'Vitamin D', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قرص ویتامین D3 50000', 'Vitamin D3 50000 IU', 'ویتامین‌ها و مینرال‌ها', 'داروکده / یوروویتال', 'core_catalog'),
  ('قطره ویتامین D۳ (دیس‌دراپ)', 'Vitamin D3 Drops', 'ویتامین‌ها و مینرال‌ها', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('قطره ویتامین D3 کودکان', 'Vitamin D3 Drops Kids', 'ویتامین‌ها و مینرال‌ها', 'داروکده / کاله', 'core_catalog'),
  ('ویتامین E', 'Vitamin E', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قرص ویتامین E 400', 'Vitamin E 400 IU', 'ویتامین‌ها و مینرال‌ها', 'داروکده / یوروویتال', 'core_catalog'),
  ('ژلوفان ویتامین E', 'Vitamin E Softgel', 'ویتامین‌ها و مینرال‌ها', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('ویتامین K', 'Vitamin K', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('کپسول ویتامین K2', 'Vitamin K2 Capsule', 'ویتامین‌ها و مینرال‌ها', 'داروکده / هلث اید', 'core_catalog'),
  ('روی', 'Zinc', 'ویتامین‌ها و مینرال‌ها', 'دارویاب', 'core_catalog'),
  ('قرص روی (زینک)', 'Zinc Tablet', 'ویتامین‌ها و مینرال‌ها', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('آرژینین', 'Arginine', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('آرژینین و سیترولین (پمپ)', 'Arginine + Citrulline', 'ورزشی و بدنسازی', 'داروکده / کارن', 'core_catalog'),
  ('BCAA پودری ( آمینو اسید شاخه‌دار)', 'BCAA Powder', 'ورزشی و بدنسازی', 'داروکده / پوورس', 'core_catalog'),
  ('بتا آلانین', 'Beta-Alanine', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('برنچد چین آمینو اسید (BCAA)', 'Branched-Chain Amino Acids (BCAA)', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('کافئین ورزشی', 'Caffeine (Sports)', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('کافئین تبلت', 'Caffeine Tablet', 'ورزشی و بدنسازی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('کرب‌بلاستر (گینر)', 'Carb Blaster (Gainer)', 'ورزشی و بدنسازی', 'مکمل‌شاپ / یوروویتال', 'core_catalog'),
  ('کازئین', 'Casein Protein', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('کازئین پروتئین شبانه', 'Casein Protein', 'ورزشی و بدنسازی', 'داروکده / پوورس', 'core_catalog'),
  ('کلاژن', 'Collagen', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('کراتین', 'Creatine', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('کریاتین کپسولی', 'Creatine Capsule', 'ورزشی و بدنسازی', 'داروکده / کاله', 'core_catalog'),
  ('کراتین هیدروکلراید (HCL)', 'Creatine HCL', 'ورزشی و بدنسازی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('کراتین مونوهیدرات', 'Creatine Monohydrate', 'ورزشی و بدنسازی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('کریاتین مونوهیدرات پودری', 'Creatine Monohydrate', 'ورزشی و بدنسازی', 'داروکده / کارن', 'core_catalog'),
  ('داچ فیلتر (فوتبالیست‌ها)', 'Dutch Filter', 'ورزشی و بدنسازی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('پروتئین تخم‌مرغ', 'Egg Protein', 'ورزشی و بدنسازی', 'داروکده / کارن', 'core_catalog'),
  ('EAA آمینو اسید ضروری', 'Essential Amino Acids (EAA)', 'ورزشی و بدنسازی', 'داروکده / کارن', 'core_catalog'),
  ('گلوتامین', 'Glutamine', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('گلوتامین ورزشی', 'Glutamine (Sports)', 'ورزشی و بدنسازی', 'مکمل‌شاپ / یوروویتال', 'core_catalog'),
  ('گلوتامین پودری', 'Glutamine Powder', 'ورزشی و بدنسازی', 'داروکده / پوورس', 'core_catalog'),
  ('کپسول HMB', 'HMB Capsule', 'ورزشی و بدنسازی', 'داروکده / یوروویتال', 'core_catalog'),
  ('ال-آرژینین ورزشی', 'L-Arginine (Sports)', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('ال-کارنیتین', 'L-Carnitine', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('لکارنیتین ۳۰۰۰ (مایع)', 'L-Carnitine 3000 Liquid', 'ورزشی و بدنسازی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('ال-سیستئین', 'L-Cysteine', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('ال-لایسین', 'L-Lysine', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('ژل ل کارنیتین لیکویید', 'Liquid L-Carnitine', 'ورزشی و بدنسازی', 'داروکده / پوورس', 'core_catalog'),
  ('کربوهیدرات ورزشی (مالتودکسترین)', 'Maltodextrin (Sports Carbohydrate)', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('پودر کربوهیدرات مالتودکسترین', 'Maltodextrin Carb Powder', 'ورزشی و بدنسازی', 'داروکده / کاله', 'core_catalog'),
  ('گینر حجم‌دهنده (مگسام گینر)', 'Mass Gainer', 'ورزشی و بدنسازی', 'داروکده / یوروویتال', 'core_catalog'),
  ('متیونین', 'Methionine', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('گیاه‌ پروتئین (پروتئین گیاهی)', 'Plant Protein', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('پروتئین گیاهی (سویا/نخود)', 'Plant Protein', 'ورزشی و بدنسازی', 'داروکده / کاله', 'core_catalog'),
  ('پس‌تمرین (پست‌ورک‌اوت)', 'Post-Workout', 'ورزشی و بدنسازی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('پیش‌تمرین (پره‌ورک‌اوت)', 'Pre-Workout', 'ورزشی و بدنسازی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('پری ورک‌اوت (آماده‌سازی تمرین)', 'Pre-Workout', 'ورزشی و بدنسازی', 'داروکده / کارن', 'core_catalog'),
  ('بیکربنات سدیم', 'Sodium Bicarbonate', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('پروتئین سویا', 'Soy Protein', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('شارژر کربوهیدرات ورزشی', 'Sports Carbohydrate Charger', 'ورزشی و بدنسازی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('ترئونین', 'Threonine', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('کپسول تریبولوس ترستریس', 'Tribulus Terrestris', 'ورزشی و بدنسازی', 'داروکده / کارن', 'core_catalog'),
  ('تریپتوفان', 'Tryptophan', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('پروتئین وی کنستانتره', 'Whey Concentrate', 'ورزشی و بدنسازی', 'مکمل‌شاپ / یوروویتال', 'core_catalog'),
  ('پروتئین وی ایزولیت', 'Whey Isolate', 'ورزشی و بدنسازی', 'مکمل‌شاپ / یوروویتال', 'core_catalog'),
  ('پروتئین وی ماس (Mass Gainer Whey)', 'Whey Mass Gainer', 'ورزشی و بدنسازی', 'داروکده / پوورس', 'core_catalog'),
  ('پروتئین وی', 'Whey Protein', 'ورزشی و بدنسازی', 'دارویاب', 'core_catalog'),
  ('پودر وی کونسنتریت (Whey Concentrate)', 'Whey Protein Concentrate', 'ورزشی و بدنسازی', 'داروکده / پوورس', 'core_catalog'),
  ('پودر وی ایزولیت (Whey Isolate)', 'Whey Protein Isolate', 'ورزشی و بدنسازی', 'داروکده / کاله', 'core_catalog'),
  ('کپسول زینک منیزیوم B6 (ZMA)', 'ZMA (Zinc Magnesium B6)', 'ورزشی و بدنسازی', 'داروکده / کارن', 'core_catalog'),
  ('قرص و شامپوی ضد ریزش مو (تورتافر)', 'Anti-Hair Loss Tablets & Shampoo', 'پوست، مو و ناخن', 'مکمل‌شاپ / درمکس', 'core_catalog'),
  ('بیوتین (قرص تقویت مو)', 'Biotin (Hair)', 'پوست، مو و ناخن', 'مکمل‌شاپ / درمکس', 'core_catalog'),
  ('کپسول بیوتیین (تقویت مو)', 'Biotin Capsule', 'پوست، مو و ناخن', 'داروکده / کاله', 'core_catalog'),
  ('کلاژن + ویتامین C (پودری)', 'Collagen + Vitamin C', 'پوست، مو و ناخن', 'مکمل‌شاپ / درمکس', 'core_catalog'),
  ('پودر کلاژن + ویتامین C', 'Collagen + Vitamin C Powder', 'پوست، مو و ناخن', 'داروکده / کاله', 'core_catalog'),
  ('کپسول هیر و نیل (مو و ناخن)', 'Hair & Nail Capsule', 'پوست، مو و ناخن', 'داروکده / درمکس', 'core_catalog'),
  ('کپسول کلاژن هیدرولیز شده', 'Hydrolyzed Collagen', 'پوست، مو و ناخن', 'داروکده / یوروویتال', 'core_catalog'),
  ('کپسول سلامت ناخن', 'Nail Health Capsule', 'پوست، مو و ناخن', 'مکمل‌شاپ / درمکس', 'core_catalog'),
  ('کپسول امگا 7 (پوست و مخاطات)', 'Omega 7', 'پوست، مو و ناخن', 'داروکده / هلث اید', 'core_catalog'),
  ('قرص پنتوژن (ضد ریزش مو)', 'Pantogen (Anti Hair Loss)', 'پوست، مو و ناخن', 'داروکده / درمکس', 'core_catalog'),
  ('کپسول سی‌لیل (سیلیسیم پوست و مو)', 'Silica (Cysile)', 'پوست، مو و ناخن', 'داروکده / درمکس', 'core_catalog'),
  ('کپسول مولتی‌ویتامین پوست و مو', 'Skin & Hair Multivitamin', 'پوست، مو و ناخن', 'داروکده / اپیدی‌فارما', 'core_catalog'),
  ('کپسول پوست (هیدرودرم)', 'Skin Capsule', 'پوست، مو و ناخن', 'مکمل‌شاپ / درمکس', 'core_catalog'),
  ('قرص روی پوست و آکنه', 'Zinc for Skin & Acne', 'پوست، مو و ناخن', 'داروکده / کاله', 'core_catalog'),
  ('کپسول آووکادوی سویا (مفاصل)', 'Avocado Soybean Unsaponifiables', 'مفاصل و استخوان', 'داروکده / هلث اید', 'core_catalog'),
  ('قرص کلسیم + ویتامین D (کال‌د)', 'Calcium + Vitamin D', 'مفاصل و استخوان', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('قطره کلسیم + ویتامین D (کالدی‌دراپ)', 'Calcium + Vitamin D Drops', 'مفاصل و استخوان', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('قرص کلسیم کربنات', 'Calcium Carbonate', 'مفاصل و استخوان', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('سیترات کلسیم', 'Calcium Citrate', 'مفاصل و استخوان', 'دارویاب', 'core_catalog'),
  ('فسفات کلسیم', 'Calcium Phosphate', 'مفاصل و استخوان', 'دارویاب', 'core_catalog'),
  ('ژلوفان کلسیم (کلسید)', 'Calcium Softgel', 'مفاصل و استخوان', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('کلسیم و ویتامین D', 'Calcium and Vitamin D', 'مفاصل و استخوان', 'دارویاب', 'core_catalog'),
  ('کندرویتین', 'Chondroitin', 'مفاصل و استخوان', 'دارویاب', 'core_catalog'),
  ('کپسول کلاژن نوع 2 مفاصل', 'Collagen Type 2 (Joints)', 'مفاصل و استخوان', 'داروکده / یوروویتال', 'core_catalog'),
  ('کپسول ژلاتین + کلسیم', 'Gelatin + Calcium', 'مفاصل و استخوان', 'داروکده / کاله', 'core_catalog'),
  ('گلوکوزامین', 'Glucosamine', 'مفاصل و استخوان', 'دارویاب', 'core_catalog'),
  ('قرص گلوکزامین + کوندرویتین', 'Glucosamine + Chondroitin', 'مفاصل و استخوان', 'داروکده / هلث اید', 'core_catalog'),
  ('گلوکوزامین و کندرویتین', 'Glucosamine and Chondroitin', 'مفاصل و استخوان', 'دارویاب', 'core_catalog'),
  ('کلاژن هیدرولیز شده', 'Hydrolyzed Collagen', 'مفاصل و استخوان', 'دارویاب', 'core_catalog'),
  ('قرص هیدروکسی‌آپاتیت (استخوان)', 'Hydroxyapatite Bone', 'مفاصل و استخوان', 'داروکده / یوروویتال', 'core_catalog'),
  ('کمپلکس مفصلی (گلوکوزامین + کندرویتین + ام اس ام)', 'Joint Complex', 'مفاصل و استخوان', 'مکمل‌شاپ / هلث اید', 'core_catalog'),
  ('شربت کلسیم + D3 کودکان', 'Kids Calcium D3 Syrup', 'مفاصل و استخوان', 'داروکده / کاله', 'core_catalog'),
  ('ام اس ام', 'MSM (Methylsulfonylmethane)', 'مفاصل و استخوان', 'دارویاب', 'core_catalog'),
  ('قرص یوریکال (MSM مفصلی)', 'MSM Joint Tablet', 'مفاصل و استخوان', 'داروکده / کاله', 'core_catalog'),
  ('قرص متیل سولفونیل متان (MSM)', 'Methylsulfonylmethane (MSM)', 'مفاصل و استخوان', 'داروکده / کارن', 'core_catalog'),
  ('کپسول اسیدولین (معده)', 'Acidoline Capsule', 'گوارش و پروبیوتیک', 'داروکده / کاله', 'core_catalog'),
  ('قرص آنتی‌اسید و بیکربنات', 'Antacid Tablets', 'گوارش و پروبیوتیک', 'داروکده / کاله', 'core_catalog'),
  ('ژلوفان سیر (گارلیک)', 'Garlic Softgel', 'گوارش و پروبیوتیک', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('شربت پروبیوتیک کودکان', 'Kids Probiotic Syrup', 'گوارش و پروبیوتیک', 'داروکده / کاله', 'core_catalog'),
  ('مکمل باکتری‌های اسید لاکتیک', 'Lactic Acid Bacteria Supplement', 'گوارش و پروبیوتیک', 'دارویاب', 'core_catalog'),
  ('کمپلکس پروبیوتیک ۱۰ ویرو‌ها', 'Multi-Strain Probiotic', 'گوارش و پروبیوتیک', 'مکمل‌شاپ / زیست‌تخمیر', 'core_catalog'),
  ('کپسول پروبیوتیک چند‌سویه', 'Multi-Strain Probiotic', 'گوارش و پروبیوتیک', 'داروکده / کاله', 'core_catalog'),
  ('کپسول لوزالمعده‌ای (پانکراتین)', 'Pancreatin Enzyme Capsule', 'گوارش و پروبیوتیک', 'داروکده / کاله', 'core_catalog'),
  ('کپسول پری‌بیوتیک اینولین', 'Prebiotic Inulin', 'گوارش و پروبیوتیک', 'داروکده / یوروویتال', 'core_catalog'),
  ('پری‌بیوتیک', 'Prebiotics', 'گوارش و پروبیوتیک', 'دارویاب', 'core_catalog'),
  ('پروبیوتیک بانداژ', 'Probiotic (Bandage)', 'گوارش و پروبیوتیک', 'مکمل‌شاپ / هلث اید', 'core_catalog'),
  ('پروبیوتیک ۲۰ میلیارد (هاردکپسول)', 'Probiotic 20 Billion', 'گوارش و پروبیوتیک', 'مکمل‌شاپ / هلث اید', 'core_catalog'),
  ('پروبیوتیک (ساشه/فارکول)', 'Probiotic Sachet', 'گوارش و پروبیوتیک', 'مکمل‌شاپ / زیست‌تخمیر', 'core_catalog'),
  ('پروبیوتیک', 'Probiotics', 'گوارش و پروبیوتیک', 'دارویاب', 'core_catalog'),
  ('قرص فیبر رژیمی (پسیلیوم)', 'Psyllium Fiber Tablet', 'گوارش و پروبیوتیک', 'داروکده / نوتراکس', 'core_catalog'),
  ('قطره سیلیکون (نفخ و دفع گاز)', 'Simethicone Drops', 'گوارش و پروبیوتیک', 'داروکده / کاله', 'core_catalog'),
  ('سین‌بیوتیک', 'Synbiotics', 'گوارش و پروبیوتیک', 'دارویاب', 'core_catalog'),
  ('قرص کروم پیکولینات لاغری', 'Chromium Picolinate Slim', 'لاغری و تناسب اندام', 'داروکده / نوتراکس', 'core_catalog'),
  ('کپسول کلاسوفول (چربی سوز)', 'Clasofol Fat Burner', 'لاغری و تناسب اندام', 'داروکده / کاله', 'core_catalog'),
  ('کپسول لاغری (چربی‌سوز)', 'Fat Burner', 'لاغری و تناسب اندام', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('قرص گارسی‌نیا (لاغری)', 'Garcinia Cambogia', 'لاغری و تناسب اندام', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('کپسول گارسینیا کمبوجیا', 'Garcinia Cambogia', 'لاغری و تناسب اندام', 'داروکده / کارن', 'core_catalog'),
  ('قرص گرین کافی (عصاره قهوه سبز)', 'Green Coffee Bean Extract', 'لاغری و تناسب اندام', 'داروکده / کارن', 'core_catalog'),
  ('کپسول هودرودین (هودیا)', 'Hoodia (Appetite Suppressant)', 'لاغری و تناسب اندام', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('کپسول لیپوکات (چربی‌سوز)', 'Lipocat Fat Burner', 'لاغری و تناسب اندام', 'داروکده / یوروویتال', 'core_catalog'),
  ('شیک جایگزین وعده غذایی', 'Meal Replacement Shake', 'لاغری و تناسب اندام', 'داروکده / پوورس', 'core_catalog'),
  ('قرص اکس‌اس‌ال (ضد اشتها)', 'XSL Appetite Control', 'لاغری و تناسب اندام', 'داروکده / یوروویتال', 'core_catalog'),
  ('قرص فروگلوبین بارداری', 'Feroglobin Pregnancy', 'بارداری و شیردهی', 'داروکده / کاله', 'core_catalog'),
  ('قرص کلسیم شیردهی', 'Lactation Calcium Tablet', 'بارداری و شیردهی', 'داروکده / کاله', 'core_catalog'),
  ('قرص اومگا 3 شیردهی', 'Lactation Omega 3', 'بارداری و شیردهی', 'داروکده / هلث اید', 'core_catalog'),
  ('کپسول DHA بارداری (روغن جگر ماهی)', 'Pregnancy DHA Capsule', 'بارداری و شیردهی', 'داروکده / هلث اید', 'core_catalog'),
  ('شربت فولیک اسید + آهن بارداری', 'Pregnancy Iron Folic Syrup', 'بارداری و شیردهی', 'داروکده / کاله', 'core_catalog'),
  ('قرص پره‌ناتال مولتی‌ویتامین', 'Prenatal Multivitamin', 'بارداری و شیردهی', 'داروکده / یوروویتال', 'core_catalog'),
  ('شربت آپتامیل کودک', 'Aptamil Kids Syrup', 'مادر و کودک', 'داروکده / آپتامیل', 'core_catalog'),
  ('شیر خشک پیگیر (۶ ماه+)', 'Follow-on Formula Stage 2', 'مادر و کودک', 'داروکده / کاله', 'core_catalog'),
  ('شیر خشک نوزادی (استاندارد)', 'Infant Formula Stage 1', 'مادر و کودک', 'داروکده / کاله', 'core_catalog'),
  ('قطره آهن نوزاد (فروس سولفات)', 'Infant Iron Drops', 'مادر و کودک', 'داروکده / کاله', 'core_catalog'),
  ('قطره مولتی‌ویتامین نوزاد', 'Infant Multivitamin Drops', 'مادر و کودک', 'داروکده / کاله', 'core_catalog'),
  ('قرص مولتی‌ویتامین یائسگی', 'Menopause Multivitamin', 'مادر و کودک', 'داروکده / یوروویتال', 'core_catalog'),
  ('کپسول سویا ایزوفلاون یائسگی', 'Soy Isoflavone Menopause', 'مادر و کودک', 'داروکده / هلث اید', 'core_catalog'),
  ('کپسول آنتی‌اکسیدان (انتروکس)', 'Antioxidant Capsule', 'گیاهی و عصاره‌های دارویی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('کپسول اشواگاندا', 'Ashwagandha Capsule', 'گیاهی و عصاره‌های دارویی', 'داروکده / کارن', 'core_catalog'),
  ('عصاره شاتوت', 'Bilberry Extract', 'گیاهی و عصاره‌های دارویی', 'دارویاب', 'core_catalog'),
  ('کپسول گل گاوزبان', 'Borage Extract Capsule', 'گیاهی و عصاره‌های دارویی', 'داروکده / کاله', 'core_catalog'),
  ('کپسول سیستوس‌فور (شاخ بز)', 'Cystus', 'گیاهی و عصاره‌های دارویی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('روغن شب‌پره (روغن گل راعی)', 'Evening Primrose Oil', 'گیاهی و عصاره‌های دارویی', 'دارویاب', 'core_catalog'),
  ('کپسول فور‌تی‌پلاس', 'Forty Plus Capsule', 'گیاهی و عصاره‌های دارویی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('کپسول سیر (کاردل گارلیک)', 'Garlic Capsule', 'گیاهی و عصاره‌های دارویی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('سیر', 'Garlic Extract', 'گیاهی و عصاره‌های دارویی', 'دارویاب', 'core_catalog'),
  ('کپسول زنجبیل (مسکن طبیعی)', 'Ginger Extract Capsule', 'گیاهی و عصاره‌های دارویی', 'داروکده / کاله', 'core_catalog'),
  ('کپسول ژینکو بیلوبا', 'Ginkgo Biloba', 'گیاهی و عصاره‌های دارویی', 'داروکده / هلث اید', 'core_catalog'),
  ('قرص جینکو بیلوبا (مموری)', 'Ginkgo Biloba (Memory)', 'گیاهی و عصاره‌های دارویی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('جینکو بیلوبا', 'Ginkgo Biloba Extract', 'گیاهی و عصاره‌های دارویی', 'دارویاب', 'core_catalog'),
  ('کپسول جینسینگ (پاورجین)', 'Ginseng Capsule', 'گیاهی و عصاره‌های دارویی', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('جینسینگ', 'Ginseng Extract', 'گیاهی و عصاره‌های دارویی', 'دارویاب', 'core_catalog'),
  ('کپسول عصاره چای سبز', 'Green Tea Extract', 'گیاهی و عصاره‌های دارویی', 'داروکده / کارن', 'core_catalog'),
  ('عصاره خالص گیاهی', 'Herbal Extract', 'گیاهی و عصاره‌های دارویی', 'دارویاب', 'core_catalog'),
  ('کپسول ریحان مقدس (اوکیموم)', 'Holy Basil Extract', 'گیاهی و عصاره‌های دارویی', 'داروکده / کاله', 'core_catalog'),
  ('شربت عسل و گل سرخ کودک', 'Honey & Rose Syrup Kids', 'گیاهی و عصاره‌های دارویی', 'داروکده / کاله', 'core_catalog'),
  ('لوسیتین', 'Lecithin', 'گیاهی و عصاره‌های دارویی', 'دارویاب', 'core_catalog'),
  ('کپسول خار مریم (سیلی‌مارین)', 'Milk Thistle (Silymarin)', 'گیاهی و عصاره‌های دارویی', 'داروکده / یوروویتال', 'core_catalog'),
  ('قرص پیاز + فیناستراید (تیکسیل)', 'Onion Extract (Hair)', 'گیاهی و عصاره‌های دارویی', 'مکمل‌شاپ / درمکس', 'core_catalog'),
  ('کپسول جینسینگ قرمز کره‌ای', 'Red Korean Ginseng', 'گیاهی و عصاره‌های دارویی', 'داروکده / کارن', 'core_catalog'),
  ('کپسول ساو پالم (پروستات)', 'Saw Palmetto', 'گیاهی و عصاره‌های دارویی', 'داروکده / کارن', 'core_catalog'),
  ('روغن سوسیس (روغن سویا)', 'Soybean Oil', 'گیاهی و عصاره‌های دارویی', 'دارویاب', 'core_catalog'),
  ('کپسول زردچوبه کورکومین', 'Turmeric Curcumin', 'گیاهی و عصاره‌های دارویی', 'داروکده / کارن', 'core_catalog'),
  ('کپسول استخودوس (آشفته‌خواب)', 'Valerian Extract', 'گیاهی و عصاره‌های دارویی', 'داروکده / هلث اید', 'core_catalog'),
  ('روغن جوانه گندم', 'Wheat Germ Oil', 'گیاهی و عصاره‌های دارویی', 'دارویاب', 'core_catalog'),
  ('قرص آدنوزین (قلب)', 'Adenosine Heart Tablet', 'قلب و عروق و امگا', 'داروکده / کاله', 'core_catalog'),
  ('روغن سیاه‌دانه (کاردل)', 'Black Seed Oil', 'قلب و عروق و امگا', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('روغن کبد ماهی', 'Cod Liver Oil', 'قلب و عروق و امگا', 'دارویاب', 'core_catalog'),
  ('کپسول روغن جگر ماهی', 'Cod Liver Oil Capsule', 'قلب و عروق و امگا', 'داروکده / هلث اید', 'core_catalog'),
  ('کپسول روغن بنفشه (امگا 3 گیاهی)', 'Evening Primrose Oil', 'قلب و عروق و امگا', 'داروکده / هلث اید', 'core_catalog'),
  ('امگا ۳ گیاهی (روغن کتان)', 'Flaxseed Oil (Plant Omega-3)', 'قلب و عروق و امگا', 'دارویاب', 'core_catalog'),
  ('کپسول روغن دانه کتان', 'Flaxseed Oil Capsule', 'قلب و عروق و امگا', 'داروکده / کاله', 'core_catalog'),
  ('قرص فولیک اسید', 'Folic Acid', 'قلب و عروق و امگا', 'مکمل‌شاپ / داروسازی شهید قاضی', 'core_catalog'),
  ('قرص آسپرین ضد پلاکت (کم دوز)', 'Low Dose Aspirin', 'قلب و عروق و امگا', 'داروکده / کاله', 'core_catalog'),
  ('امگا ۳-۶-۹', 'Omega 3-6-9', 'قلب و عروق و امگا', 'دارویاب', 'core_catalog'),
  ('اسید اومگا ۳ (روغن ماهی)', 'Omega-3 Fatty Acids (Fish Oil)', 'قلب و عروق و امگا', 'دارویاب', 'core_catalog'),
  ('امگا ۳ (جکافیش/فیش‌اویل)', 'Omega-3 Fish Oil', 'قلب و عروق و امگا', 'مکمل‌شاپ / هلث اید', 'core_catalog'),
  ('کپسول 5-HTP (خواب و آرامش)', '5-HTP Capsule', 'هورمون‌ها و اختلالات خواب', 'داروکده / کارن', 'core_catalog'),
  ('دی هیدرو اپی آندروسترون (DHEA)', 'DHEA', 'هورمون‌ها و اختلالات خواب', 'دارویاب', 'core_catalog'),
  ('قرص دی‌اچ‌ای (DHEA 25)', 'DHEA 25mg', 'هورمون‌ها و اختلالات خواب', 'داروکده / کارن', 'core_catalog'),
  ('قرص دی‌ای‌ای (DHEA)', 'DHEA Tablet', 'هورمون‌ها و اختلالات خواب', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('کپسول مکا (انرژی و قوای جنسی)', 'Maca Root Capsule', 'هورمون‌ها و اختلالات خواب', 'داروکده / کارن', 'core_catalog'),
  ('قرص مکائو (مکا، انرژی زایی)', 'Maca Tablet', 'هورمون‌ها و اختلالات خواب', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('ملاتونین', 'Melatonin', 'هورمون‌ها و اختلالات خواب', 'دارویاب', 'core_catalog'),
  ('قرص ملاتونین 5mg', 'Melatonin 5mg', 'هورمون‌ها و اختلالات خواب', 'داروکده / یوروویتال', 'core_catalog'),
  ('قرص ملاتونین (خواب)', 'Melatonin Tablet', 'هورمون‌ها و اختلالات خواب', 'مکمل‌شاپ / هلث اید', 'core_catalog'),
  ('کپسول مولتی‌ویتامین مردان', 'Men''s Multivitamin', 'هورمون‌ها و اختلالات خواب', 'داروکده / یوروویتال', 'core_catalog'),
  ('قرص پمپ‌گرم (پامپل)', 'Pumpkin Seed', 'هورمون‌ها و اختلالات خواب', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('قرص زینکسی‌پرو (بهبود خواب)', 'Sleep Aid', 'هورمون‌ها و اختلالات خواب', 'مکمل‌شاپ / هلث اید', 'core_catalog'),
  ('کپسول تستو‌جک (تقویت تستوسترون)', 'Testojack Capsule', 'هورمون‌ها و اختلالات خواب', 'داروکده / کارن', 'core_catalog'),
  ('کپسول مولتی‌ویتامین زنان', 'Women''s Multivitamin', 'هورمون‌ها و اختلالات خواب', 'داروکده / یوروویتال', 'core_catalog'),
  ('استیل ال-کارنیتین', 'Acetyl L-Carnitine', 'آنتی‌اکسیدان و تقویتی', 'دارویاب', 'core_catalog'),
  ('آلفا لیپوئیک اسید', 'Alpha Lipoic Acid', 'آنتی‌اکسیدان و تقویتی', 'دارویاب', 'core_catalog'),
  ('کپسول ALA آلفا لیپوئیک', 'Alpha Lipoic Acid (ALA)', 'آنتی‌اکسیدان و تقویتی', 'داروکده / کارن', 'core_catalog'),
  ('کپسول آستیگزانتین', 'Astaxanthin Capsule', 'آنتی‌اکسیدان و تقویتی', 'داروکده / هلث اید', 'core_catalog'),
  ('کوآنزیم Q10', 'Coenzyme Q10', 'آنتی‌اکسیدان و تقویتی', 'دارویاب', 'core_catalog'),
  ('کوانول (کوآنزیم Q10)', 'Coenzyme Q10 (Ubiquinol)', 'آنتی‌اکسیدان و تقویتی', 'دارویاب', 'core_catalog'),
  ('کپسول کورکومین مفصلی و تقویتی', 'Curcumin Booster', 'آنتی‌اکسیدان و تقویتی', 'داروکده / کارن', 'core_catalog'),
  ('کپسول رزوراترول', 'Resveratrol Capsule', 'آنتی‌اکسیدان و تقویتی', 'داروکده / هلث اید', 'core_catalog'),
  ('قرص ضد استرس و اضطراب (کارم‌آب)', 'Anti-Stress Tablet', 'سایر مکمل‌های تغذیه‌ای', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('کپسول ارگونین و کارنیتین ورزشی', 'Arginine Carnitine Sport', 'سایر مکمل‌های تغذیه‌ای', 'داروکده / کارن', 'core_catalog'),
  ('قرص کنگره‌فرنگی (کیلیاک)', 'Artichoke Tablet', 'سایر مکمل‌های تغذیه‌ای', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('کلین', 'Choline', 'سایر مکمل‌های تغذیه‌ای', 'دارویاب', 'core_catalog'),
  ('DMG (دی‌متیل گلیسین)', 'Dimethylglycine (DMG)', 'سایر مکمل‌های تغذیه‌ای', 'دارویاب', 'core_catalog'),
  ('قرص شاف‌سوفت (ضد مشکلات چشم)', 'Eye Health Tablet', 'سایر مکمل‌های تغذیه‌ای', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('هوموسیستئین', 'Homocysteine Reducer', 'سایر مکمل‌های تغذیه‌ای', 'دارویاب', 'core_catalog'),
  ('قرص هایپرزین (حافظه و تمرکز)', 'Hyperzine (Memory)', 'سایر مکمل‌های تغذیه‌ای', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('اینوزیتول', 'Inositol', 'سایر مکمل‌های تغذیه‌ای', 'دارویاب', 'core_catalog'),
  ('کپسول لوکووین (ضد کم‌خونی)', 'Locowin Anti-Anemia', 'سایر مکمل‌های تغذیه‌ای', 'داروکده / کاله', 'core_catalog'),
  ('قرص لوتئین و زآکسانتین چشم', 'Lutein + Zeaxanthin Eye', 'سایر مکمل‌های تغذیه‌ای', 'داروکده / هلث اید', 'core_catalog'),
  ('کپسول لینوکسیل (تقویت حافظه)', 'Memory Booster Capsule', 'سایر مکمل‌های تغذیه‌ای', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('قرص فسفاتو (تقویت استخوان)', 'Phosphato Bone Booster', 'سایر مکمل‌های تغذیه‌ای', 'داروکده / یوروویتال', 'core_catalog'),
  ('سویا ایزوفلاون', 'Soy Isoflavones', 'سایر مکمل‌های تغذیه‌ای', 'دارویاب', 'core_catalog'),
  ('قرص سوپر اسلیک', 'Super Slim Tablet', 'سایر مکمل‌های تغذیه‌ای', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('قطره مولتی‌ویتامین کودکان', 'Children Multivitamin Drops', 'بارداری، زنان و کودکان', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('قرص اسید فولیک بارداری', 'Folic Acid (Pregnancy)', 'بارداری، زنان و کودکان', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('شیر خشک مدیکال (تخصصی)', 'Medical Milk Powder', 'بارداری، زنان و کودکان', 'مکمل‌شاپ / کاله', 'core_catalog'),
  ('قرص کمپلکس یائسگی (میداس)', 'Menopause Complex', 'بارداری، زنان و کودکان', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('قرص به‌بود تحرک و کیفیت اسپرم', 'Sperm Quality Supplement', 'بارداری، زنان و کودکان', 'مکمل‌شاپ / کارن', 'core_catalog'),
  ('کپسول آشواگاندا KSM-66 (مدیریت استرس)', 'Ashwagandha KSM-66 Extract (Stress Management)', 'مدیریت استرس', 'داروکده / یوروویتال', 'specialized_stress_sleep_energy'),
  ('قرص رودیولا رزه‌آ (ضداسترس)', 'Rhodiola Rosea Extract (Anti-Stress)', 'مدیریت استرس', 'مکمل‌شاپ / نوتراکس', 'specialized_stress_sleep_energy'),
  ('کپسول لسیتین فسفاتیدیل‌سرین', 'Phosphatidylserine Capsule (Cortisol Balance)', 'مدیریت استرس', 'داروکده / هلث اید', 'specialized_stress_sleep_energy'),
  ('قرص ملاتونین ۳ میلی‌گرم (تنظیم خواب)', 'Melatonin 3 mg Tablet (Sleep Regulation)', 'تنظیم خواب', 'دارویاب', 'specialized_stress_sleep_energy'),
  ('کپسول ملاتونین ۱ میلی‌گرم آهسته‌رهش', 'Melatonin 1 mg Sustained-Release Capsule', 'تنظیم خواب', 'مکمل‌شاپ / یوروویتال', 'specialized_stress_sleep_energy'),
  ('قرص منیزیم گلیسینات (بهبود خواب)', 'Magnesium Glycinate Tablet (Sleep Support)', 'تنظیم خواب', 'داروکده / نوتراکس', 'specialized_stress_sleep_energy'),
  ('کپسول ال-تئانین ۲۰۰ میلی‌گرم', 'L-Theanine 200 mg Capsule (Calm & Sleep Quality)', 'تنظیم خواب', 'مکمل‌شاپ / هلث اید', 'specialized_stress_sleep_energy'),
  ('قرص والرین (عناب تلخ) خواب‌آور گیاهی', 'Valerian Root Tablet (Herbal Sleep Aid)', 'تنظیم خواب', 'دارویاب', 'specialized_stress_sleep_energy'),
  ('کپسول گزنه و بابونه شب', 'Chamomile & Passionflower Night Capsule', 'تنظیم خواب', 'داروکده / یوروویتال', 'specialized_stress_sleep_energy'),
  ('کپسول ویتامین B12 متیل‌کوبالامین (انرژی صبحگاهی)', 'Methylcobalamin B12 Capsule (Morning Energy)', 'انرژی صبح و روز', 'مکمل‌شاپ / داروسازی امید', 'specialized_stress_sleep_energy'),
  ('قرص آهن بیس‌گلیسینات (انرژی روزانه)', 'Iron Bisglycinate Tablet (Daytime Energy)', 'انرژی صبح و روز', 'داروکده / نوتراکس', 'specialized_stress_sleep_energy'),
  ('کپسول ویتامین D3 5000 IU (انرژی و خلق)', 'Vitamin D3 5000 IU Capsule (Energy & Mood)', 'انرژی صبح و روز', 'دارویاب', 'specialized_stress_sleep_energy'),
  ('کپسول MCT روغن نارگیل (انرژی سریع صبحگاهی)', 'MCT Oil Capsule (Fast Morning Energy)', 'انرژی صبح و روز', 'مکمل‌شاپ / یوروویتال', 'specialized_stress_sleep_energy'),
  ('قرص تیروزین (تمرکز و انرژی ذهنی روزانه)', 'L-Tyrosine Tablet (Daytime Mental Energy)', 'انرژی صبح و روز', 'داروکده / هلث اید', 'specialized_stress_sleep_energy'),
  ('کپسول B-Complex فعال (انرژی روز و کاهش خستگی)', 'Active B-Complex Capsule (Day Energy & Fatigue Relief)', 'انرژی صبح و روز', 'مکمل‌شاپ / داروسازی امید', 'specialized_stress_sleep_energy')
ON CONFLICT DO NOTHING;

-- ============================================================
-- BIOMARKER SUPPLEMENT RULES: intelligent mapping between lab
-- biomarkers and supplement recommendations
-- ============================================================
CREATE TABLE IF NOT EXISTS aeterna.biomarker_supplement_rules (
  id bigserial PRIMARY KEY,
  biomarker_key text NOT NULL,
  biomarker_label text,
  operator text NOT NULL DEFAULT '>' CHECK (operator IN ('>', '>=', '<', '<=', '==', '!=', 'outside_range')),
  threshold_num double precision,
  threshold_min double precision,
  threshold_max double precision,
  severity text NOT NULL DEFAULT 'moderate' CHECK (severity IN ('mild','moderate','severe')),
  supplement_names text[] NOT NULL DEFAULT '{}',
  rationale text,
  evidence_category text,
  priority int NOT NULL DEFAULT 5,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_biomarker_rules_key ON aeterna.biomarker_supplement_rules (biomarker_key, active);

INSERT INTO aeterna.biomarker_supplement_rules
  (biomarker_key, biomarker_label, operator, threshold_num, threshold_min, threshold_max, severity, supplement_names, rationale, evidence_category, priority)
VALUES
  ('cortisol_levels', 'کورتیزول', '>', 18, NULL, NULL, 'severe',
    ARRAY['کپسول آشواگاندا KSM-66 (مدیریت استرس)','کپسول لسیتین فسفاتیدیل‌سرین','قرص رودیولا رزه‌آ (ضداسترس)','منیزیم'],
    'کورتیزول بالا نشانه استرس مزمن است؛ آشواگاندا و فسفاتیدیل‌سرین کاهش کورتیزول را پشتیبانی می‌کنند.', 'adaptogens', 1),
  ('cortisol_levels', 'کورتیزول', '>', 14, NULL, NULL, 'moderate',
    ARRAY['کپسول آشواگاندا KSM-66 (مدیریت استرس)','منیزیم گلیسینات','ویتامین C'],
    'کورتیزول مرزی بالا؛ مکمل‌های تطبیقی و منیزیم برای تعادل HPA محور.', 'adaptogens', 2),
  ('stress_score', 'امتیاز استرس', '>', 70, NULL, NULL, 'severe',
    ARRAY['کپسول آشواگاندا KSM-66 (مدیریت استرس)','کپسول ال-تئانین ۲۰۰ میلی‌گرم','قرص رودیولا رزه‌آ (ضداسترس)','منیزیم'],
    'استرس شدید؛ ترکیب آداپتوژن و ال-تئانین برای آرامش بدون خواب‌آلودگی.', 'adaptogens', 1),
  ('stress_score', 'امتیاز استرس', '>', 50, NULL, NULL, 'moderate',
    ARRAY['کپسول ال-تئانین ۲۰۰ میلی‌گرم','منیزیم گلیسینات','ویتامین B-Complex فعال (انرژی روز و کاهش خستگی)'],
    'استرس متوسط؛ پشتیبانی از سیستم عصبی و حفظ ذخایر ویتامین‌های B.', 'adaptogens', 2),
  ('sleep_quality', 'کیفیت خواب', '<', 60, NULL, NULL, 'severe',
    ARRAY['قرص ملاتونین ۳ میلی‌گرم (تنظیم خواب)','قرص منیزیم گلیسینات (بهبود خواب)','قرص والرین (عناب تلخ) خواب‌آور گیاهی'],
    'کیفیت خواب ضعیف؛ ملاتونین + منیزیم + گیاهان خواب‌آور.', 'sleep', 1),
  ('sleep_quality', 'کیفیت خواب', '<', 75, NULL, NULL, 'moderate',
    ARRAY['کپسول ملاتونین ۱ میلی‌گرم آهسته‌رهش','کپسول ال-تئانین ۲۰۰ میلی‌گرم','کپسول گزنه و بابونه شب'],
    'اختلال خواب خفیف؛ دوز کم ملاتونین آهسته‌رهش و گیاهان آرام‌بخش.', 'sleep', 2),
  ('morning_fatigue', 'خستگی صبحگاهی', '>', 60, NULL, NULL, 'severe',
    ARRAY['کپسول ویتامین B12 متیل‌کوبالامین (انرژی صبحگاهی)','قرص آهن بیس‌گلیسینات (انرژی روزانه)','کپسول MCT روغن نارگیل (انرژی سریع صبحگاهی)','ویتامین D3'],
    'خستگی صبحگاهی شدید؛ ارزیابی کم‌خونی/B12 و پشتیبانی انرژی میتوکندریایی.', 'energy', 1),
  ('morning_fatigue', 'خستگی صبحگاهی', '>', 40, NULL, NULL, 'moderate',
    ARRAY['کپسول B-Complex فعال (انرژی روز و کاهش خستگی)','کپسول ویتامین D3 5000 IU (انرژی و خلق)'],
    'خستگی متوسط؛ کمپلکس B فعال و ویتامین D برای انرژی روزانه.', 'energy', 2),
  ('hrv_score', 'HRV (تغییرپذیری ضربان قلب)', '<', 40, NULL, NULL, 'severe',
    ARRAY['کپسول آشواگاندا KSM-66 (مدیریت استرس)','کپسول کوآنزیم Q10','امگا ۳ (EPA/DHA)'],
    'HRV پایین نشانه بار استرس اتونومیک؛ آداپتوژن و کوآنزیم Q10 برای بازیابی.', 'cardiovascular', 1),
  ('hrv_score', 'HRV (تغییرپذیری ضربان قلب)', '<', 55, NULL, NULL, 'moderate',
    ARRAY['امگا ۳ (EPA/DHA)','منیزیم گلیسینات'],
    'HRV مرزی؛ امگا۳ و منیزیم برای سلامت قلبی-عروقی و تعادل اتونومیک.', 'cardiovascular', 2),
  ('vitamin_d', 'ویتامین D', '<', 30, NULL, NULL, 'moderate',
    ARRAY['کپسول ویتامین D3 5000 IU (انرژی و خلق)','کپسول کلسیم + D3'],
    'کمبود ویتامین D با خستگی و ضعف خواب مرتبط است.', 'vitamins', 1),
  ('vitamin_b12', 'ویتامین B12', '<', 300, NULL, NULL, 'moderate',
    ARRAY['کپسول ویتامین B12 متیل‌کوبالامین (انرژی صبحگاهی)','کپسول B-Complex فعال (انرژی روز و کاهش خستگی)'],
    'B12 پایین علت شایع خستگی و اختلال خواب است.', 'vitamins', 1),
  ('ferritin', 'فریتین', '<', 30, NULL, NULL, 'moderate',
    ARRAY['قرص آهن بیس‌گلیسینات (انرژی روزانه)','ویتامین C'],
    'ذخایر آهن پایین؛ آهن بیس‌گلیسینات با جذب بالا همراه ویتامین C.', 'minerals', 1),
  ('magnesium', 'منیزیم', '<', 1.8, NULL, NULL, 'moderate',
    ARRAY['قرص منیزیم گلیسینات (بهبود خواب)','منیزیم سیترات'],
    'کمبود منیزیم با بی‌خوابی و استرس مرتبط است.', 'minerals', 1),
  ('testosterone', 'تستوسترون', '<', 300, NULL, NULL, 'moderate',
    ARRAY['روی (Zinc)','ویتامین D3','آشواگاندا'],
    'تستوسترون پایین؛ روی و ویتامین D در سنتز هورمونی نقش دارند.', 'hormones', 2),
  ('thyroid_tsh', 'TSH', '>', 4, NULL, NULL, 'moderate',
    ARRAY['ید (Iodine)','سلنیوم','روی (Zinc)'],
    'TSH بالا (هیپوتیروئیدی مرزی)؛ پشتیبانی از تولید هورمون تیروئید.', 'hormones', 2),
  ('fasting_glucose', 'قند خون ناشتا', '>', 100, NULL, NULL, 'moderate',
    ARRAY['کروم پیکولینات','آلفا لیپوئیک اسید','منیزیم'],
    'قند ناشتا مرزی؛ کروم و ALA برای حساسیت به انسولین.', 'metabolic', 2),
  ('sleep_onset_minutes', 'زمان به‌خواب‌رفتن (دقیقه)', '>', 30, NULL, NULL, 'moderate',
    ARRAY['قرص ملاتونین ۳ میلی‌گرم (تنظیم خواب)','کپسول ال-تئانین ۲۰۰ میلی‌گرم'],
    'تاخیر در به‌خواب‌رفتن؛ ملاتونین و ال-تئانین کوتاه‌کردن latency خواب.', 'sleep', 1),
  ('wakeup_count', 'تعداد بیدارشدن شبانه', '>', 2, NULL, NULL, 'moderate',
    ARRAY['کپسول ملاتونین ۱ میلی‌گرم آهسته‌رهش','قرص منیزیم گلیسینات (بهبود خواب)'],
    'بیداری‌های شبانه مکرر؛ ملاتونین آهسته‌رهش حفظ خواب را پشتیبانی می‌کند.', 'sleep', 2)
ON CONFLICT DO NOTHING;

-- ============================================================
-- PL/pgSQL: intelligent recommendation & personalized prescription
-- ============================================================
CREATE OR REPLACE FUNCTION aeterna.match_biomarker_rules(
  p_biomarker_key text, p_value double precision
)
RETURNS TABLE (
  rule_id bigint, supplement_names text[], severity text,
  rationale text, priority int
)
LANGUAGE sql STABLE AS $$
  SELECT r.id, r.supplement_names, r.severity, r.rationale, r.priority
  FROM aeterna.biomarker_supplement_rules r
  WHERE r.active
    AND r.biomarker_key = p_biomarker_key
    AND CASE r.operator
          WHEN '>'  THEN p_value >  r.threshold_num
          WHEN '>=' THEN p_value >= r.threshold_num
          WHEN '<'  THEN p_value <  r.threshold_num
          WHEN '<=' THEN p_value <= r.threshold_num
          WHEN '==' THEN p_value =  r.threshold_num
          WHEN '!=' THEN p_value <> r.threshold_num
          WHEN 'outside_range' THEN p_value < r.threshold_min OR p_value > r.threshold_max
        END
  ORDER BY r.priority, r.id;
$$;

CREATE OR REPLACE FUNCTION aeterna.generate_recommendations(
  p_access_code text
)
RETURNS TABLE (biomarker_key text, supplement_names text[], rationale text, severity text)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r RECORD;
  v RECORD;
BEGIN
  SELECT data INTO r FROM aeterna.lab_panels
  WHERE access_code = p_access_code ORDER BY created_at DESC LIMIT 1;
  IF r IS NULL THEN RETURN; END IF;

  FOR v IN
    SELECT key, CASE
             WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::double precision
             ELSE NULL END AS num
    FROM jsonb_each(r.data)
  LOOP
    IF v.num IS NOT NULL THEN
      RETURN QUERY
      SELECT m.biomarker_key, m.supplement_names, m.rationale, m.severity
      FROM aeterna.match_biomarker_rules(v.key, v.num) m;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION aeterna.generate_personalized_prescription(
  p_access_code text
)
RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_patient RECORD;
  v_rec RECORD;
  v_lines text[] := '{}';
  v_seen text[] := '{}';
  v_result text;
BEGIN
  SELECT full_name, age, sex INTO v_patient
  FROM aeterna.patients WHERE access_code = p_access_code;
  IF NOT FOUND THEN RETURN NULL; END IF;

  FOR v_rec IN SELECT * FROM aeterna.generate_recommendations(p_access_code)
               ORDER BY severity, biomarker_key
  LOOP
    FOR i IN 1 .. array_length(v_rec.supplement_names, 1) LOOP
      IF NOT (v_rec.supplement_names[i] = ANY (v_seen)) THEN
        v_seen := v_seen || v_rec.supplement_names[i];
        v_lines := v_lines || format('- %s (به‌خاطر: %s — %s)',
          v_rec.supplement_names[i], v_rec.biomarker_key, v_rec.rationale);
      END IF;
    END LOOP;
  END LOOP;

  IF array_length(v_lines, 1) IS NULL THEN
    RETURN format('نسخه شخصی‌سازی‌شده برای %s: هیچ مکمل خاصی بر اساس آخرین آزمایش‌ها یافت نشد.', v_patient.full_name);
  END IF;

  v_result := format(
    E'نسخه شخصی‌سازی‌شده مکمل برای %s (سن: %s، جنسیت: %s)
بر اساس آخرین پنل آزمایش:
%s

توجه: پیش از مصرف با پزشک مشورت کنید.',
    v_patient.full_name, v_patient.age, COALESCE(v_patient.sex, 'نامشخص'),
    array_to_string(v_lines, E'
'));
  RETURN v_result;
END;
$$;
