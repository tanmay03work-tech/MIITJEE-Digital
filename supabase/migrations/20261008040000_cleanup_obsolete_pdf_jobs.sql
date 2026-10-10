-- Migration: 20261008040000_cleanup_obsolete_pdf_jobs.sql
-- Description: Drop unused legacy pdf_import_jobs table while preserving active Word-based question_sets and questions.

DROP TABLE IF EXISTS public.pdf_import_jobs CASCADE;
