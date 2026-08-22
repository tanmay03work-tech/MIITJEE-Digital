import json
import re
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'D:\Downloads\miitjee-mobile\question paper\extracted_doc_pcm.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

current_subject = 'Physics'
questions = []
current_q = None

for i, it in enumerate(items):
    text = it['text'].strip()
    images = it['images']

    if not text and not images:
        continue

    # Detect subject headers
    if text.upper() == 'PHYSICS' or 'Physics - Section' in text:
        current_subject = 'Physics'
        continue
    elif text.upper() == 'CHEMISTRY' or 'Chemistry - Section' in text:
        current_subject = 'Chemistry'
        continue
    elif text.upper() == 'MATHEMATICS' or 'Mathematics - Section' in text or 'Maths - Section' in text:
        current_subject = 'Mathematics'
        continue

    if 'MIITJEE Classes' in text or 'Navigator Batch' in text or 'Standard:' in text or 'Total Questions:' in text or '(with Answer Key)' in text:
        continue

    # Check for question start: e.g. "1. ", "25. ", "75. "
    m = re.match(r'^(\d+)\.\s*(.*)', text)
    if m:
        q_num = int(m.group(1))
        # Determine if this is a new question number
        is_new_q = False
        if current_q is None:
            is_new_q = True
        elif q_num != current_q['num']:
            # Make sure it's not a numbered list inside a prompt (e.g. 1. 2. 3. statements) unless q_num matches sequence
            if q_num == current_q['num'] + 1 or q_num in (1, 26, 51) or (current_q['correct'] is not None):
                is_new_q = True

        if is_new_q:
            if current_q:
                questions.append(current_q)

            # Determine subject if not already set
            subj = current_subject
            if 1 <= q_num <= 25:
                subj = 'Physics'
            elif 26 <= q_num <= 50:
                subj = 'Chemistry'
            elif 51 <= q_num <= 75:
                subj = 'Mathematics'

            # Section A (MCQs) are typically 1-20 in each subject, Section B (Integers) 21-25 in JEE format, or check based on presence of options/type
            q_text = m.group(2)
            current_q = {
                'num': q_num,
                'subject': subj,
                'type': 'mcq', # will refine later
                'prompt': q_text,
                'images': list(images),
                'options': [],
                'correct': None,
                'raw_lines': []
            }
            continue

    if current_q:
        if images:
            for img in images:
                if img not in current_q['images']:
                    current_q['images'].append(img)

        if text.startswith('Correct Answer:'):
            current_q['correct'] = text.replace('Correct Answer:', '').strip()
        elif re.match(r'^\([A-D]\)', text):
            clean_opt = re.sub(r'^\([A-D]\)\s*', '', text).strip()
            current_q['options'].append(clean_opt)
        else:
            if not current_q['options'] and current_q['correct'] is None:
                current_q['prompt'] = (current_q['prompt'] + '\n' + text).strip()
            else:
                current_q['raw_lines'].append(text)

if current_q:
    questions.append(current_q)

print(f'Total questions parsed: {len(questions)}')

# Validate questions
for q in questions:
    if len(q['options']) == 0:
        q['type'] = 'integer'
    else:
        q['type'] = 'mcq'

    print(f"Q{q['num']:02d} [{q['subject']}] ({q['type']}): images={q['images']} opt_count={len(q['options'])} correct={q['correct']}")
    if q['images']:
        print(f"   --> HAS IMAGES: {q['images']}")
    if not q['correct']:
        print(f"   --> WARNING: Missing correct answer!")
    if q['type'] == 'mcq' and len(q['options']) != 4:
        print(f"   --> WARNING: Options count = {len(q['options'])} for MCQ!")

with open(r'D:\Downloads\miitjee-mobile\question paper\parsed_pcm_questions.json', 'w', encoding='utf-8') as f:
    json.dump(questions, f, indent=2, ensure_ascii=False)

print('Saved parsed_pcm_questions.json')
