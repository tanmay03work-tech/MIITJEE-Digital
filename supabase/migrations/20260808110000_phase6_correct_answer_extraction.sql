-- Phase 6: Correct Answer Extraction & Review Flag Migration
-- Add ai_confidence, needs_review, and has_answer_key_match columns to test_questions and question_bank

ALTER TABLE public.test_questions
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_answer_key_match BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_answer_key_match BOOLEAN NOT NULL DEFAULT FALSE;
