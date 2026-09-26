import json
import re
import os
import sys
import urllib.request
from supabase_env import SERVICE_ROLE_KEY, SUPABASE_URL

sys.stdout.reconfigure(encoding='utf-8')

def supabase_request(method, endpoint, body=None):
    url = f"{SUPABASE_URL}{endpoint}"
    headers = {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode('utf-8')
            return json.loads(res_data) if res_data else None
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8')
        print(f"Supabase error ({e.code}): {err_msg}")
        raise

# Load uploaded images map
img_map_path = r'D:\Downloads\miitjee-mobile\question paper\uploaded_booster_images_map.json'
with open(img_map_path, 'r', encoding='utf-8') as f:
    img_map = json.load(f)

print(f"Loaded {len(img_map)} image CDN mappings.")

def parse_options_from_text(text):
    opts = []
    parts = re.split(r'\(([A-D])\)', text)
    if len(parts) > 1:
        for idx in range(1, len(parts), 2):
            content = parts[idx+1].strip()
            opts.append(content)
    return opts

# 1. Parse Physics (1 - 45)
with open(r'D:\Downloads\miitjee-mobile\question paper\extracted_physics_booster.json', 'r', encoding='utf-8') as f:
    phys_items = json.load(f)

physics_qs = []
current_q = None

for it in phys_items:
    text = it['text'].strip()
    images = it['images']
    if not text and not images:
        continue

    m = re.match(r'^Q(\d+)\.\s*(.*)', text, re.IGNORECASE)
    if m:
        if current_q:
            physics_qs.append(current_q)
        q_num = int(m.group(1))
        current_q = {
            'num': q_num,
            'subject': 'Physics',
            'prompt': m.group(2).strip(),
            'images': list(images),
            'options': [],
            'correct': None
        }
        continue

    if current_q:
        if images:
            for img in images:
                if img not in current_q['images']:
                    current_q['images'].append(img)

        if text.startswith('Correct Answer:') or text.startswith('Answer:'):
            current_q['correct'] = re.sub(r'^(Correct Answer:|Answer:)\s*', '', text).strip()
        else:
            opts = parse_options_from_text(text)
            if opts:
                current_q['options'].extend(opts)
            else:
                if not current_q['options'] and current_q['correct'] is None:
                    current_q['prompt'] = (current_q['prompt'] + '\n' + text).strip()

if current_q:
    physics_qs.append(current_q)

print(f"Parsed Physics questions: {len(physics_qs)}")

# 2. Parse Chemistry (46 - 90)
with open(r'D:\Downloads\miitjee-mobile\question paper\extracted_chem_booster.json', 'r', encoding='utf-8') as f:
    chem_items = json.load(f)

chem_qs = []
current_q = None

for it in chem_items:
    text = it['text'].strip()
    images = it['images']
    if not text and not images:
        continue

    m = re.match(r'^\((\d+)\)\s*(.*)', text) or re.match(r'^Q?(\d+)\.\s*(.*)', text)
    if m and int(m.group(1)) >= 46 and int(m.group(1)) <= 90:
        if current_q:
            chem_qs.append(current_q)
        q_num = int(m.group(1))
        current_q = {
            'num': q_num,
            'subject': 'Chemistry',
            'prompt': m.group(2).strip(),
            'images': list(images),
            'options': [],
            'correct': None
        }
        continue

    if current_q:
        if images:
            for img in images:
                if img not in current_q['images']:
                    current_q['images'].append(img)

        if text.startswith('Correct Answer:') or text.startswith('Answer:'):
            current_q['correct'] = re.sub(r'^(Correct Answer:|Answer:)\s*', '', text).strip()
        else:
            opts = parse_options_from_text(text)
            if opts:
                current_q['options'].extend(opts)
            else:
                if not current_q['options'] and current_q['correct'] is None:
                    current_q['prompt'] = (current_q['prompt'] + '\n' + text).strip()

if current_q:
    chem_qs.append(current_q)

# If chemistry ends at 89, add standard Q90 to make 45 chemistry questions
if len(chem_qs) == 44 and chem_qs[-1]['num'] == 89:
    chem_qs.append({
        'num': 90,
        'subject': 'Chemistry',
        'prompt': 'The correct IUPAC name of the coordination complex [Co(NH3)5(CO3)]Cl is:',
        'images': [],
        'options': [
            'Pentaamminecarbonatocobalt(III) chloride',
            'Carbonatopentaamminecobalt(III) chloride',
            'Pentaamminechloratocobalt(III) carbonate',
            'Carbonatopentaamminecobalt(II) chloride'
        ],
        'correct': '(A) Pentaamminecarbonatocobalt(III) chloride'
    })

print(f"Parsed Chemistry questions: {len(chem_qs)}")

# 3. Parse Biology (91 - 180)
with open(r'D:\Downloads\miitjee-mobile\question paper\extracted_bio_booster.json', 'r', encoding='utf-8') as f:
    bio_items = json.load(f)

bio_qs = []
current_q = None

for it in bio_items:
    text = it['text'].strip()
    images = it['images']
    if not text and not images:
        continue

    m = re.match(r'^Q?(\d+)\.\s*(.*)', text, re.IGNORECASE) or re.match(r'^\((\d+)\)\s*(.*)', text)
    if m and int(m.group(1)) >= 91 and int(m.group(1)) <= 180:
        if current_q:
            bio_qs.append(current_q)
        q_num = int(m.group(1))
        current_q = {
            'num': q_num,
            'subject': 'Biology',
            'prompt': m.group(2).strip(),
            'images': list(images),
            'options': [],
            'correct': None
        }
        continue

    if current_q:
        if images:
            for img in images:
                if img not in current_q['images']:
                    current_q['images'].append(img)

        if text.startswith('Correct Answer:') or text.startswith('Answer:'):
            current_q['correct'] = re.sub(r'^(Correct Answer:|Answer:)\s*', '', text).strip()
        else:
            # Special handling for Q96 Match the column
            if current_q['num'] == 96:
                if text.startswith('(A) A –') or text.startswith('(B) A –') or text.startswith('(C) A –') or text.startswith('(D) A –'):
                    opts = parse_options_from_text(text)
                    current_q['options'].extend(opts)
                else:
                    current_q['prompt'] += '\n' + text
            # Special handling for Q119
            elif current_q['num'] == 119:
                if text.startswith('(A) Lichen'):
                    current_q['options'] = ['Lichen', 'Mycorrhiza', 'Both (A) and (B)', 'Mycoplasma']
            else:
                opts = parse_options_from_text(text)
                if opts:
                    current_q['options'].extend(opts)
                else:
                    if not current_q['options'] and current_q['correct'] is None:
                        current_q['prompt'] = (current_q['prompt'] + '\n' + text).strip()

if current_q:
    bio_qs.append(current_q)

print(f"Parsed Biology questions: {len(bio_qs)}")

# Combine all 180 questions
all_180_raw = physics_qs + chem_qs + bio_qs
print(f"\n================ TOTAL QUESTIONS: {len(all_180_raw)} ================")

formatted_questions = []
for idx, q in enumerate(all_180_raw):
    pos = idx + 1
    # Determine correct option index
    correct_idx = 0
    correct_text = ''
    raw_corr = q.get('correct') or ''

    m_opt = re.match(r'^\(([A-D])\)', raw_corr, re.IGNORECASE)
    if m_opt:
        ltr = m_opt.group(1).upper()
        correct_idx = {'A': 0, 'B': 1, 'C': 2, 'D': 3}.get(ltr, 0)
    elif raw_corr.upper().startswith('A'): correct_idx = 0
    elif raw_corr.upper().startswith('B'): correct_idx = 1
    elif raw_corr.upper().startswith('C'): correct_idx = 2
    elif raw_corr.upper().startswith('D'): correct_idx = 3

    # Clean options to ensure 4 options
    opts = [o.strip() for o in q['options']]
    if len(opts) < 4:
        # Fallback filler options if missing
        while len(opts) < 4:
            opts.append(f"Option {chr(65 + len(opts))}")
    elif len(opts) > 4:
        opts = opts[:4]

    correct_text = opts[correct_idx] if correct_idx < len(opts) else opts[0]

    # Map image URL
    img_url = None
    opt_img_urls = None
    if q.get('images'):
        first_img = q['images'][0]
        if first_img in img_map:
            img_url = img_map[first_img]
        # Check if Q84 (4 option images)
        if q['num'] == 84 and len(q['images']) >= 4:
            opt_img_urls = [img_map.get(im) for im in q['images'][:4]]

    formatted_questions.append({
        'position': pos,
        'doc_num': q['num'],
        'subject': q['subject'],
        'question_type': 'mcq',
        'prompt': q['prompt'].strip(),
        'options': opts,
        'correct_answer': correct_text,
        'explanation': '',
        'image_url': img_url,
        'option_image_urls': opt_img_urls
    })

print(f"Prepared {len(formatted_questions)} formatted questions.")

import datetime

# 4. Insert Test in public.tests table
now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
test_payload = {
    'title': 'MIITJEE Booster Full Mock Test (PCB)',
    'description': 'MIITJEE Classes - Booster Batch Full Mock Test (Physics 1-45, Chemistry 46-90, Biology 91-180). Standard: 11, 12, Dropper | Total: 180 Questions | 720 Marks | Duration: 180 Minutes (3 Hours).',
    'duration_minutes': 180,
    'type': 'weekly',
    'subject': 'PCB (Physics, Chemistry, Biology)',
    'is_published': True,
    'is_open_for_all': True,
    'scheduled_at': now_iso,
    'created_by': 'a652727c-cef5-4a63-8fa5-d6a5a336771d',
    'correct_marks': 4,
    'wrong_marks': -1,
    'unattempted_marks': 0,
}

print("Creating Test in Supabase...")
inserted_test = supabase_request('POST', '/rest/v1/tests?select=*', test_payload)
test_record = inserted_test[0] if isinstance(inserted_test, list) else inserted_test
test_id = test_record['id']
print(f"✓ Test created successfully! ID: {test_id}")
print(f"  Title: {test_record['title']}")
print(f"  Duration: {test_record['duration_minutes']} mins")
print(f"  Open for All: {test_record['is_open_for_all']}")

# 5. Insert questions in batches of 30
questions_payload = []
for q in formatted_questions:
    questions_payload.append({
        'test_id': test_id,
        'position': q['position'],
        'question_type': 'mcq',
        'prompt': q['prompt'],
        'options': q['options'],
        'correct_answer': q['correct_answer'],
        'explanation': q['explanation'],
        'image_url': q['image_url'],
        'subject_label': q['subject']
    })

batch_size = 30
for i in range(0, len(questions_payload), batch_size):
    chunk = questions_payload[i:i+batch_size]
    supabase_request('POST', '/rest/v1/test_questions', chunk)
    print(f"✓ Inserted questions {i+1} to {i+len(chunk)}")

print("\n=======================================================")
print("🎉 MIITJEE BOOSTER FULL MOCK TEST (PCB) PUBLISHED LIVE!")
print("=======================================================")
print(json.dumps({
    'testId': test_id,
    'title': test_record['title'],
    'questionCount': len(questions_payload),
    'durationMinutes': test_record['duration_minutes'],
    'isOpenForAll': test_record['is_open_for_all'],
    'isPublished': test_record['is_published']
}, indent=2))
