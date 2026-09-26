-- Migration: Clean up Navigator Batch and MIITJEE Booster Batch Question Papers
-- Date: 2026-09-13

DELETE FROM public.test_questions WHERE test_id IN ('a0000000-0000-0000-0000-000000000075', 'b0000000-0000-0000-0000-000000000180');
DELETE FROM public.test_attempts WHERE test_id IN ('a0000000-0000-0000-0000-000000000075', 'b0000000-0000-0000-0000-000000000180');
DELETE FROM public.tests WHERE id IN ('a0000000-0000-0000-0000-000000000075', 'b0000000-0000-0000-0000-000000000180');
DELETE FROM public.tests WHERE title IN ('Navigator Batch MIITJEE Question Paper', 'MIITJEE Booster Batch Question Paper');
