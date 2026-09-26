import json, base64, os, sys

sys.stdout.reconfigure(encoding='utf-8')

img_dir = r'D:\Downloads\miitjee-mobile\question paper\extracted'
json_path = os.path.join(img_dir, 'questions.json')

with open(json_path, 'r', encoding='utf-8') as f:
    questions = json.load(f)

# Load images to base64
img_b64 = {}
for i in range(1, 9):
    fn = f"image{i}.png"
    fp = os.path.join(img_dir, fn)
    if os.path.exists(fp):
        with open(fp, 'rb') as img_f:
            b64_str = base64.b64encode(img_f.read()).decode('utf-8')
            img_b64[fn] = f"data:image/png;base64,{b64_str}"

test_id = 'navigator_batch_miitjee_test'

ts_code = [
    "import { TestItem, TestQuestion } from '../../types';",
    "",
    "export const NAVIGATOR_BATCH_TEST_ID = 'navigator_batch_miitjee_test';",
    "",
    "export const NAVIGATOR_BATCH_TEST_ITEM: TestItem = {",
    "  id: NAVIGATOR_BATCH_TEST_ID,",
    "  title: 'Navigator Batch MIITJEE Question Paper',",
    "  description: 'Weekly Grand Test: Physics, Chemistry & Mathematics (75 Questions, 300 Marks). Open for all batches.',",
    "  durationMinutes: 180,",
    "  questionCount: 75,",
    "  type: 'weekly',",
    "  subject: 'Physics, Chemistry, Mathematics',",
    "  scheduledAt: new Date(Date.now() - 3600000).toISOString(),",
    "  isPublished: true,",
    "  isStarted: true,",
    "  startedAt: new Date(Date.now() - 3600000).toISOString(),",
    "  isOpenForAll: true,",
    "  accessMode: 'OPEN_FOR_ALL',",
    "  correctMarks: 4,",
    "  wrongMarks: 1,",
    "  unattemptedMarks: 0,",
    "};",
    "",
    "export const NAVIGATOR_BATCH_QUESTIONS: TestQuestion[] = ["
]

for q in questions:
    q_num = q['q_num']
    sub = q['subject']
    sec = q['section']
    q_type = 'integer' if q['type'] == 'NUMERICAL' else 'mcq'
    prompt = q['text'].strip()
    prompt = '\n'.join([line for line in prompt.split('\n') if line.strip() != 'undefined'])
    
    opts = []
    if q_type == 'mcq':
        for k in ['A', 'B', 'C', 'D']:
            opts.append(q['options'].get(k, ''))
            
    corr_ans = str(q['correct_answer']).strip() if q['correct_answer'] is not None else ''
    
    img_url = None
    if q['images']:
        first_img = q['images'][0]
        if first_img in img_b64:
            img_url = img_b64[first_img]
            
    q_json = {
        'id': f'navigator_q_{q_num}',
        'testId': test_id,
        'type': q_type,
        'prompt': prompt,
        'options': opts,
        'correctAnswer': corr_ans,
        'explanation': f'Correct answer: {corr_ans}',
        'subjectLabel': sub,
    }
    
    if q_type == 'integer':
        try:
            q_json['integerAnswer'] = int(float(corr_ans))
        except:
            pass
            
    if img_url:
        q_json['imageUrl'] = img_url
    
    ts_code.append(f"  {json.dumps(q_json, ensure_ascii=False)},")

ts_code.append("];")

out_ts_path = r'D:\Downloads\miitjee-mobile\src\services\api\navigatorBatchTestData.ts'
with open(out_ts_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(ts_code) + '\n')

print(f"Generated {out_ts_path} with {len(questions)} questions.")
