-- Migration: Drop overloaded legacy create_test_with_questions signatures to eliminate RPC ambiguity
-- Date: 2026-10-10

-- 1. Drop older overloads that conflict with the canonical 11-argument function
DROP FUNCTION IF EXISTS public.create_test_with_questions(text, text, integer, text, public.test_type, text, jsonb);
DROP FUNCTION IF EXISTS public.create_test_with_questions(text, text, integer, text, public.test_type, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.create_test_with_questions(text, text, integer, text, public.test_type, text, text, text, jsonb, timestamp with time zone);
