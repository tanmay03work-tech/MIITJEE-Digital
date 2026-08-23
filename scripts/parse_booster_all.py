import json
import re
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

def parse_subject_json(json_path, subject_name):
    with open(json_path, 'r', encoding='utf-8') as f:
        items = json.load(f)

    questions = []
    current_q = None

    for i, it in enumerate(items):
        text = it['text'].strip()
        images = it['images']

        if not text and not images:
            continue

        # Skip headers / doc titles
        if any(h in text for h in ['MIITJEE Classes', 'Booster Batch', 'Standard:', 'Total Questions:', '(with Answer Key)', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'Section A', 'Section B', 'Question Paper']):
            if not re.match(r'^\d+\.', text):
                continue

        # Check for question start: e.g. "1. ", "45. ", "90. "
        m = re.match(r'^(\d+)\.\s*(.*)', text)
        if m:
            q_num = int(m.group(1))
            is_new_q = False
            if current_q is None:
                is_new_q = True
            elif q_num != current_q['doc_num']:
                # Sequence match or answer was already found
                if q_num == current_q['doc_num'] + 1 or q_num == 1 or current_q['correct'] is not None:
                    is_new_q = True

            if is_new_q:
                if current_q:
                    questions.append(current_q)
                current_q = {
                    'doc_num': q_num,
                    'subject': subject_name,
                    'type': 'mcq',
                    'prompt': m.group(2),
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

            if text.startswith('Correct Answer:') or text.startswith('Answer:') or text.startswith('Ans.'):
                current_q['correct'] = re.sub(r'^(Correct Answer:|Answer:|Ans\.)\s*', '', text).strip()
            elif re.match(r'^\([A-D1-4]\)', text) or re.match(r'^[A-D1-4]\.\s', text):
                clean_opt = re.sub(r'^\([A-D1-4]\)\s*|^[A-D1-4]\.\s*', '', text).strip()
                current_q['options'].append(clean_opt)
            else:
                if not current_q['options'] and current_q['correct'] is None:
                    current_q['prompt'] = (current_q['prompt'] + '\n' + text).strip()
                else:
                    # Check if text contains embedded option or correct answer
                    ans_match = re.search(r'Correct Answer:\s*(.*)', text)
                    if ans_match:
                        current_q['correct'] = ans_match.group(1).strip()
                    else:
                        current_q['raw_lines'].append(text)

    if current_q:
        questions.append(current_q)

    return questions

phys_qs = parse_subject_json(r'D:\Downloads\miitjee-mobile\question paper\extracted_physics_booster.json', 'Physics')
chem_qs = parse_subject_json(r'D:\Downloads\miitjee-mobile\question paper\extracted_chem_booster.json', 'Chemistry')
bio_qs = parse_subject_json(r'D:\Downloads\miitjee-mobile\question paper\extracted_bio_booster.json', 'Biology')

print(f"Parsed counts: Physics={len(phys_qs)}, Chemistry={len(chem_qs)}, Biology={len(bio_qs)}")
print(f"Total merged questions: {len(phys_qs) + len(chem_qs) + len(bio_qs)}")

# Detail check Physics
print("\n--- Physics sample ---")
for q in phys_qs[:5]:
    print(f"Q{q['doc_num']}: imgs={q['images']} opt_count={len(q['options'])} correct={q['correct']}")
    print(f"  Prompt: {q['prompt'][:80]}...")
    print(f"  Options: {q['options']}")

# Detail check Chemistry
print("\n--- Chemistry sample ---")
for q in chem_qs[:5]:
    print(f"Q{q['doc_num']}: imgs={q['images']} opt_count={len(q['options'])} correct={q['correct']}")
    print(f"  Prompt: {q['prompt'][:80]}...")
    print(f"  Options: {q['options']}")

# Detail check Biology
print("\n--- Biology sample ---")
for q in bio_qs[:5]:
    print(f"Q{q['doc_num']}: imgs={q['images']} opt_count={len(q['options'])} correct={q['correct']}")
    print(f"  Prompt: {q['prompt'][:80]}...")
    print(f"  Options: {q['options']}")
