import json
import re
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

def parse_options_from_text(text):
    # Handles lines like:
    # (A) opt1 (B) opt2
    # (C) opt3 (D) opt4
    # or single options like: (A) opt1
    opts = []
    # Pattern to match (A)... (B)... (C)... (D)...
    parts = re.split(r'\(([A-D])\)', text)
    if len(parts) > 1:
        # parts[0] is text before first (A), parts[1] is 'A', parts[2] is text of A, parts[3] is 'B', parts[4] is text of B...
        for idx in range(1, len(parts), 2):
            letter = parts[idx]
            content = parts[idx+1].strip()
            opts.append((letter, content))
    return opts

def parse_physics(json_path):
    with open(json_path, 'r', encoding='utf-8') as f:
        items = json.load(f)

    questions = []
    current_q = None

    for it in items:
        text = it['text'].strip()
        images = it['images']

        if not text and not images:
            continue

        # Check for Q1. Q2. ... Q45.
        m = re.match(r'^Q(\d+)\.\s*(.*)', text, re.IGNORECASE)
        if m:
            if current_q:
                questions.append(current_q)
            q_num = int(m.group(1))
            current_q = {
                'doc_num': q_num,
                'position': q_num,
                'subject': 'Physics',
                'prompt': m.group(2).strip(),
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
            else:
                parsed_opts = parse_options_from_text(text)
                if parsed_opts:
                    for ltr, opt_val in parsed_opts:
                        current_q['options'].append(opt_val)
                else:
                    if not current_q['options'] and current_q['correct'] is None:
                        current_q['prompt'] = (current_q['prompt'] + '\n' + text).strip()
                    else:
                        current_q['raw_lines'].append(text)

    if current_q:
        questions.append(current_q)

    return questions

def parse_chemistry(json_path):
    with open(json_path, 'r', encoding='utf-8') as f:
        items = json.load(f)

    questions = []
    current_q = None

    for it in items:
        text = it['text'].strip()
        images = it['images']

        if not text and not images:
            continue

        # Check for (46), (47), ... (90) or 46., 47. ...
        m = re.match(r'^\((\d+)\)\s*(.*)', text) or re.match(r'^Q?(\d+)\.\s*(.*)', text)
        if m and int(m.group(1)) >= 46 and int(m.group(1)) <= 90:
            if current_q:
                questions.append(current_q)
            q_num = int(m.group(1))
            current_q = {
                'doc_num': q_num,
                'position': q_num,
                'subject': 'Chemistry',
                'prompt': m.group(2).strip(),
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
            else:
                parsed_opts = parse_options_from_text(text)
                if parsed_opts:
                    for ltr, opt_val in parsed_opts:
                        current_q['options'].append(opt_val)
                else:
                    if not current_q['options'] and current_q['correct'] is None:
                        current_q['prompt'] = (current_q['prompt'] + '\n' + text).strip()
                    else:
                        current_q['raw_lines'].append(text)

    if current_q:
        questions.append(current_q)

    return questions

def parse_biology(json_path):
    with open(json_path, 'r', encoding='utf-8') as f:
        items = json.load(f)

    questions = []
    current_q = None

    for it in items:
        text = it['text'].strip()
        images = it['images']

        if not text and not images:
            continue

        # Check for Q91. Q92. ... Q180.
        m = re.match(r'^Q?(\d+)\.\s*(.*)', text, re.IGNORECASE) or re.match(r'^\((\d+)\)\s*(.*)', text)
        if m and int(m.group(1)) >= 91 and int(m.group(1)) <= 180:
            if current_q:
                questions.append(current_q)
            q_num = int(m.group(1))
            current_q = {
                'doc_num': q_num,
                'position': q_num,
                'subject': 'Biology',
                'prompt': m.group(2).strip(),
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
            else:
                parsed_opts = parse_options_from_text(text)
                if parsed_opts:
                    for ltr, opt_val in parsed_opts:
                        current_q['options'].append(opt_val)
                else:
                    if not current_q['options'] and current_q['correct'] is None:
                        current_q['prompt'] = (current_q['prompt'] + '\n' + text).strip()
                    else:
                        current_q['raw_lines'].append(text)

    if current_q:
        questions.append(current_q)

    return questions

phys_qs = parse_physics(r'D:\Downloads\miitjee-mobile\question paper\extracted_physics_booster.json')
chem_qs = parse_chemistry(r'D:\Downloads\miitjee-mobile\question paper\extracted_chem_booster.json')
bio_qs = parse_biology(r'D:\Downloads\miitjee-mobile\question paper\extracted_bio_booster.json')

print(f"Physics: {len(phys_qs)} questions (Q{phys_qs[0]['doc_num']} to Q{phys_qs[-1]['doc_num'] if phys_qs else 'N/A'})")
print(f"Chemistry: {len(chem_qs)} questions (Q{chem_qs[0]['doc_num']} to Q{chem_qs[-1]['doc_num'] if chem_qs else 'N/A'})")
print(f"Biology: {len(bio_qs)} questions (Q{bio_qs[0]['doc_num']} to Q{bio_qs[-1]['doc_num'] if bio_qs else 'N/A'})")
total = len(phys_qs) + len(chem_qs) + len(bio_qs)
print(f"TOTAL QUESTIONS: {total}")

all_qs = phys_qs + chem_qs + bio_qs
with open(r'D:\Downloads\miitjee-mobile\question paper\parsed_booster_180.json', 'w', encoding='utf-8') as f:
    json.dump(all_qs, f, indent=2, ensure_ascii=False)
print("Saved parsed_booster_180.json")
