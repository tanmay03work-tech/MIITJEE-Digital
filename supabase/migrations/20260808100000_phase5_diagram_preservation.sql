-- Phase 5: Diagram / Image Preservation Migration
-- Add option_image_urls, source_page, and source_region columns to test_questions and question_bank

ALTER TABLE public.test_questions
  ADD COLUMN IF NOT EXISTS option_image_urls JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_page INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_region TEXT DEFAULT NULL;

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS option_image_urls JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_page INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_region TEXT DEFAULT NULL;
