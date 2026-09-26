import json, base64, os, sys
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

img_dir = r'D:\Downloads\miitjee-mobile\question paper\extracted'
json_path = os.path.join(img_dir, 'questions.json')

with open(json_path, 'r', encoding='utf-8') as f:
    questions = json.load(f)

img_b64 = {}
for i in range(1, 9):
    fn = f"image{i}.png"
    fp = os.path.join(img_dir, fn)
    if os.path.exists(fp):
        with open(fp, 'rb') as img_f:
            b64_str = base64.b64encode(img_f.read()).decode('utf-8')
            img_b64[fn] = f"data:image/png;base64,{b64_str}"

print(f"Loaded {len(img_b64)} images.")

test_id = "a0000000-0000-0000-0000-000000000075"

cleaned_questions = []
for q in questions:
    q_num = q['q_num']
    sub = q['subject']
    sec = q['section']
    q_type = 'mcq' if q['type'] == 'MCQ' else 'integer'
    prompt = q['text'].strip()
    prompt = '\n'.join([line for line in prompt.split('\n') if line.strip() != 'undefined'])
    
    opts = []
    if q_type == 'mcq':
        for k in ['A', 'B', 'C', 'D']:
            val = q['options'].get(k, '')
            if val is None:
                val = ''
            opts.append(str(val).strip())
            
    corr_ans = str(q['correct_answer']).strip().upper() if q.get('correct_answer') is not None else 'A'
    int_ans = None
    if q_type == 'integer':
        try:
            int_ans = int(float(corr_ans))
            corr_ans = str(int_ans)
        except:
            int_ans = 0
            corr_ans = '0'
            
    img_url = None
    if q['images']:
        first_img = q['images'][0]
        if first_img in img_b64:
            img_url = img_b64[first_img]
            
    cleaned_questions.append({
        'test_id': test_id,
        'position': q_num,
        'subject_label': sub,
        'question_type': q_type,
        'prompt': prompt,
        'options': opts,
        'correct_answer': corr_ans,
        'integer_answer': int_ans,
        'explanation': f"Correct answer is {corr_ans}.",
        'image_url': img_url
    })

print(f"Prepared {len(cleaned_questions)} questions.")

SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co'
SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o'

headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=representation'
}

# 1. Upsert test into public.tests
test_payload = {
    "id": test_id,
    "title": "Navigator Batch MIITJEE Question Paper",
    "description": "Weekly Grand Test: Physics, Chemistry & Mathematics (75 Questions, 300 Marks). Open for all batches.",
    "duration_minutes": 180,
    "batch_id": None,
    "created_by": "a652727c-cef5-4a63-8fa5-d6a5a336771d",
    "type": "weekly",
    "subject": "Physics, Chemistry, Mathematics",
    "scheduled_at": "2026-09-06T00:00:00.000Z",
    "is_published": True,
    "is_started": True,
    "started_at": "2026-09-06T00:00:00.000Z",
    "is_open_for_all": True,
    "deleted_at": None,
    "share_code": "NAVIGTR1",
    "correct_marks": 4,
    "wrong_marks": -1,
    "unattempted_marks": 0
}

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/tests",
    data=json.dumps([test_payload]).encode('utf-8'),
    headers=headers,
    method='POST'
)
try:
    with urllib.request.urlopen(req) as response:
        print("Upserted test:", response.status)
except urllib.error.HTTPError as e:
    print("Test upsert error:", e.code, e.read().decode('utf-8'))

# Also update d1099f8b-3b3d-4a53-94cf-58375dabd8fe so it is also active if anyone opens it
patch_req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/tests?id=eq.d1099f8b-3b3d-4a53-94cf-58375dabd8fe",
    data=json.dumps({
        "deleted_at": None,
        "is_published": True,
        "is_started": True,
        "started_at": "2026-09-06T00:00:00.000Z",
        "is_open_for_all": True
    }).encode('utf-8'),
    headers={**headers, 'Prefer': 'return=minimal'},
    method='PATCH'
)
try:
    with urllib.request.urlopen(patch_req) as response:
        print("Un-archived d1099f8b:", response.status)
except urllib.error.HTTPError as e:
    print("Patch error:", e.code, e.read().decode('utf-8'))

# 2. Delete existing questions for test_id to prevent duplicates
del_req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/test_questions?test_id=eq.{test_id}",
    headers={**headers, 'Prefer': 'return=minimal'},
    method='DELETE'
)
try:
    with urllib.request.urlopen(del_req) as response:
        print("Cleaned old questions:", response.status)
except urllib.error.HTTPError as e:
    print("Delete error:", e.code, e.read().decode('utf-8'))

# 3. Insert all 75 questions in batches of 15
batch_size = 15
for i in range(0, len(cleaned_questions), batch_size):
    chunk = cleaned_questions[i:i+batch_size]
    chunk_req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/test_questions",
        data=json.dumps(chunk).encode('utf-8'),
        headers=headers,
        method='POST'
    )
    try:
        with urllib.request.urlopen(chunk_req) as response:
            print(f"Inserted questions {i+1} to {i+len(chunk)}: {response.status}")
    except urllib.error.HTTPError as e:
        print(f"Question insert error for chunk {i}:", e.code, e.read().decode('utf-8'))

print("All done!")
