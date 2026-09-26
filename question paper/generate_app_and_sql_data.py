import os, json, sys, re, base64
from parse_complete_papers import nav_q, nav_imgs, boost_q, boost_imgs

sys.stdout.reconfigure(encoding='utf-8')

NAVIGATOR_ID = "a0000000-0000-0000-0000-000000000075"
BOOSTER_ID = "b0000000-0000-0000-0000-000000000180"

def clean_question_list(q_list, img_map, target_test_id):
    cleaned = []
    for q in q_list:
        q_num = q['q_num']
        sub = q['subject']
        q_type = 'mcq' if q['type'] == 'MCQ' else 'integer'
        prompt = q['text'].strip()
        prompt = '\n'.join([line for line in prompt.split('\n') if line.strip() != 'undefined'])
        
        opts = []
        if q_type == 'mcq':
            for k in ['A', 'B', 'C', 'D']:
                opts.append(q['options'].get(k, ''))
                
        corr_ans = str(q['correct_answer']).strip() if q['correct_answer'] is not None else ''
        int_ans = None
        if q_type == 'integer':
            try:
                int_ans = int(float(corr_ans))
            except:
                int_ans = None
                
        img_url = None
        if q['images']:
            first_img = q['images'][0]
            if first_img in img_map:
                img_url = img_map[first_img]
                
        cleaned.append({
            'id': f"{target_test_id}_q_{q_num}",
            'testId': target_test_id,
            'type': q_type,
            'prompt': prompt,
            'options': opts,
            'correctAnswer': corr_ans,
            'integerAnswer': int_ans,
            'explanation': f"Correct answer is {corr_ans}.",
            'subjectLabel': sub,
            'imageUrl': img_url
        })
    return cleaned

nav_cleaned = clean_question_list(nav_q, nav_imgs, NAVIGATOR_ID)
boost_cleaned = clean_question_list(boost_q, boost_imgs, BOOSTER_ID)

print(f"Cleaned Navigator Questions: {len(nav_cleaned)}")
print(f"Cleaned Booster Questions: {len(boost_cleaned)}")

# Generate TypeScript file: src/services/api/publishedGrandTests.ts
ts_out_path = r'D:\Downloads\miitjee-mobile\src\services\api\publishedGrandTests.ts'
with open(ts_out_path, 'w', encoding='utf-8') as f:
    f.write("""import { TestItem, TestQuestion } from '../../types';

export const NAVIGATOR_BATCH_TEST_ID = 'a0000000-0000-0000-0000-000000000075';
export const BOOSTER_BATCH_TEST_ID = 'b0000000-0000-0000-0000-000000000180';

export function isGrandTest(id?: string | null, title?: string | null): boolean {
  if (!id && !title) return false;
  const cleanId = (id || '').toLowerCase();
  const cleanTitle = (title || '').toLowerCase();
  return (
    cleanId === NAVIGATOR_BATCH_TEST_ID.toLowerCase() ||
    cleanId === BOOSTER_BATCH_TEST_ID.toLowerCase() ||
    cleanId.includes('navigator') ||
    cleanId.includes('booster') ||
    cleanTitle.includes('navigator') ||
    cleanTitle.includes('booster') ||
    cleanTitle.includes('75 question') ||
    cleanTitle.includes('180 question')
  );
}

export function isNavigatorBatchTest(id?: string | null, title?: string | null): boolean {
  if (!id && !title) return false;
  const cleanId = (id || '').toLowerCase();
  const cleanTitle = (title || '').toLowerCase();
  return (
    cleanId === NAVIGATOR_BATCH_TEST_ID.toLowerCase() ||
    cleanId.includes('navigator') ||
    cleanTitle.includes('navigator') ||
    cleanTitle.includes('75 question')
  );
}

export function isBoosterBatchTest(id?: string | null, title?: string | null): boolean {
  if (!id && !title) return false;
  const cleanId = (id || '').toLowerCase();
  const cleanTitle = (title || '').toLowerCase();
  return (
    cleanId === BOOSTER_BATCH_TEST_ID.toLowerCase() ||
    cleanId.includes('booster') ||
    cleanTitle.includes('booster') ||
    cleanTitle.includes('180 question')
  );
}

export const NAVIGATOR_BATCH_TEST_ITEM: TestItem = {
  id: NAVIGATOR_BATCH_TEST_ID,
  title: 'Navigator Batch MIITJEE Question Paper',
  description: 'Weekly Grand Test: Physics (Q1–25), Chemistry (Q26–50) & Mathematics (Q51–75). Total 75 Questions, 300 Marks. Open for all batches.',
  durationMinutes: 180,
  questionCount: 75,
  type: 'weekly',
  subject: 'Physics, Chemistry, Mathematics',
  scheduledAt: new Date(Date.now() - 3600000).toISOString(),
  isPublished: true,
  isStarted: true,
  startedAt: new Date(Date.now() - 3600000).toISOString(),
  isOpenForAll: true,
  accessMode: 'OPEN_FOR_ALL',
  correctMarks: 4,
  wrongMarks: 1,
  unattemptedMarks: 0,
};

export const BOOSTER_BATCH_TEST_ITEM: TestItem = {
  id: BOOSTER_BATCH_TEST_ID,
  title: 'MIITJEE Booster Batch Question Paper',
  description: 'Grand Test: Physics (Q1–45), Chemistry (Q46–90) & Biology (Q91–180). Total 180 Questions, 720 Marks. Open for all batches.',
  durationMinutes: 180,
  questionCount: 180,
  type: 'weekly',
  subject: 'Physics, Chemistry, Biology',
  scheduledAt: new Date(Date.now() - 3600000).toISOString(),
  isPublished: true,
  isStarted: true,
  startedAt: new Date(Date.now() - 3600000).toISOString(),
  isOpenForAll: true,
  accessMode: 'OPEN_FOR_ALL',
  correctMarks: 4,
  wrongMarks: 1,
  unattemptedMarks: 0,
};

export function getGrandTestQuestions(testId: string, testTitle?: string): TestQuestion[] {
  if (isBoosterBatchTest(testId, testTitle)) {
    return BOOSTER_BATCH_QUESTIONS.map((q) => ({ ...q, testId }));
  }
  return NAVIGATOR_BATCH_QUESTIONS.map((q) => ({ ...q, testId }));
}

export function getNavigatorBatchQuestions(targetTestId?: string): TestQuestion[] {
  const activeTestId = targetTestId || NAVIGATOR_BATCH_TEST_ID;
  return NAVIGATOR_BATCH_QUESTIONS.map((q) => ({ ...q, testId: activeTestId }));
}

export function getBoosterBatchQuestions(targetTestId?: string): TestQuestion[] {
  const activeTestId = targetTestId || BOOSTER_BATCH_TEST_ID;
  return BOOSTER_BATCH_QUESTIONS.map((q) => ({ ...q, testId: activeTestId }));
}

""")
    f.write("export const NAVIGATOR_BATCH_QUESTIONS: TestQuestion[] = ")
    json.dump(nav_cleaned, f, indent=2, ensure_ascii=False)
    f.write(";\n\n")

    f.write("export const BOOSTER_BATCH_QUESTIONS: TestQuestion[] = ")
    json.dump(boost_cleaned, f, indent=2, ensure_ascii=False)
    f.write(";\n")

print(f"Generated {ts_out_path}")

# Generate SQL migration: supabase/migrations/20260906040000_publish_navigator_and_booster_tests.sql
sql_out_path = r'D:\Downloads\miitjee-mobile\supabase\migrations\20260906040000_publish_navigator_and_booster_tests.sql'
with open(sql_out_path, 'w', encoding='utf-8') as f:
    f.write("""-- Migration: Publish Navigator Batch and MIITJEE Booster Batch Question Papers for All Users
-- Date: 2026-09-06

-- 1. Ensure tests table has both grand tests with is_open_for_all = TRUE
DELETE FROM public.test_questions WHERE test_id IN ('a0000000-0000-0000-0000-000000000075', 'b0000000-0000-0000-0000-000000000180');
DELETE FROM public.tests WHERE id IN ('a0000000-0000-0000-0000-000000000075', 'b0000000-0000-0000-0000-000000000180');

INSERT INTO public.tests (
  id, title, description, duration_minutes, batch_id, type, subject, scheduled_at, is_published, is_started, started_at, is_open_for_all
) VALUES (
  'a0000000-0000-0000-0000-000000000075',
  'Navigator Batch MIITJEE Question Paper',
  'Weekly Grand Test: Physics (Q1–25), Chemistry (Q26–50) & Mathematics (Q51–75). Total 75 Questions, 300 Marks. Open for all batches.',
  180,
  NULL,
  'weekly',
  'Physics, Chemistry, Mathematics',
  timezone('utc', now()),
  true,
  true,
  timezone('utc', now()),
  true
), (
  'b0000000-0000-0000-0000-000000000180',
  'MIITJEE Booster Batch Question Paper',
  'Grand Test: Physics (Q1–45), Chemistry (Q46–90) & Biology (Q91–180). Total 180 Questions, 720 Marks. Open for all batches.',
  180,
  NULL,
  'weekly',
  'Physics, Chemistry, Biology',
  timezone('utc', now()),
  true,
  true,
  timezone('utc', now()),
  true
);

""")
    
    # Write Navigator questions
    f.write("-- 2. Insert Navigator Batch 75 Questions\n")
    for q in nav_cleaned:
        pos = int(q['id'].split('_')[-1])
        q_type = q['type']
        prompt_sql = q['prompt'].replace("'", "''")
        opts_sql = json.dumps(q['options']).replace("'", "''")
        corr_sql = q['correctAnswer'].replace("'", "''")
        int_sql = str(q['integerAnswer']) if q['integerAnswer'] is not None else "NULL"
        expl_sql = q['explanation'].replace("'", "''")
        img_sql = f"'{q['imageUrl']}'" if q['imageUrl'] else "NULL"
        sub_sql = q['subjectLabel'].replace("'", "''")
        
        f.write(f"INSERT INTO public.test_questions (test_id, position, question_type, prompt, options, correct_answer, integer_answer, explanation, image_url, subject_label) VALUES ('{NAVIGATOR_ID}', {pos}, '{q_type}', '{prompt_sql}', '{opts_sql}'::jsonb, '{corr_sql}', {int_sql}, '{expl_sql}', {img_sql}, '{sub_sql}');\n")

    # Write Booster questions
    f.write("\n-- 3. Insert MIITJEE Booster Batch 180 Questions\n")
    for q in boost_cleaned:
        pos = int(q['id'].split('_')[-1])
        q_type = q['type']
        prompt_sql = q['prompt'].replace("'", "''")
        opts_sql = json.dumps(q['options']).replace("'", "''")
        corr_sql = q['correctAnswer'].replace("'", "''")
        int_sql = str(q['integerAnswer']) if q['integerAnswer'] is not None else "NULL"
        expl_sql = q['explanation'].replace("'", "''")
        img_sql = f"'{q['imageUrl']}'" if q['imageUrl'] else "NULL"
        sub_sql = q['subjectLabel'].replace("'", "''")
        
        f.write(f"INSERT INTO public.test_questions (test_id, position, question_type, prompt, options, correct_answer, integer_answer, explanation, image_url, subject_label) VALUES ('{BOOSTER_ID}', {pos}, '{q_type}', '{prompt_sql}', '{opts_sql}'::jsonb, '{corr_sql}', {int_sql}, '{expl_sql}', {img_sql}, '{sub_sql}');\n")

print(f"Generated {sql_out_path}")
