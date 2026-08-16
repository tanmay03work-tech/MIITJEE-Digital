-- Migration: 20260816030000_pdf_native_questions_regions.sql
-- Description: Add regions JSONB column to pdf_native_questions for authoritative multi-region and multi-page boundary persistence

alter table public.pdf_native_questions
add column if not exists regions jsonb;
