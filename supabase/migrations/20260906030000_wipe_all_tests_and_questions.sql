-- Migration: Wipe all tests, test questions, attempts, and reviews to clean up space
-- This leaves user accounts, batches, and system configurations intact while resetting test data to 0.

-- 1. Wipe attempts, answers, violations, reattempt requests
DELETE FROM public.test_attempt_answers;
DELETE FROM public.test_attempt_summaries;
DELETE FROM public.reattempt_requests;
DELETE FROM public.auto_submit_events;
DELETE FROM public.proctoring_violations;

-- 2. Wipe standard questions and tests
DELETE FROM public.test_questions;
DELETE FROM public.tests;

-- 3. Wipe PDF-Native attempts, questions, sets, tests
DELETE FROM public.pdf_native_attempts;
DELETE FROM public.pdf_native_questions;
DELETE FROM public.pdf_native_tests;
DELETE FROM public.question_bank_questions;
DELETE FROM public.question_bank_sets;
