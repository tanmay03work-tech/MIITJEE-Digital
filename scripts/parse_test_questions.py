import json
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('extracted_doc.json', 'r', encoding='utf-8') as f:
    paras = json.load(f)

questions = []
current_q = None

for p in paras:
    text = p['text'].strip()
    images = p['images']
    
    if not text and not images:
        continue
        
    if 'MIITJEE Classes' in text or 'Navigator Batch' in text or 'Section A' in text or 'Section B' in text:
        continue
        
    m = re.match(r'^(\d+)\.\s*(.*)', text)
    if m and not (current_q and len(current_q['options']) > 0 and current_q['correct'] is None and not text.startswith('26.') and not text.startswith('27.') and not text.startswith('28.') and not text.startswith('29.') and not text.startswith('30.') and not text.startswith('31.') and not text.startswith('32.') and not text.startswith('33.') and not text.startswith('34.') and not text.startswith('35.') and not text.startswith('36.') and not text.startswith('37.') and not text.startswith('38.') and not text.startswith('39.') and not text.startswith('40.') and not text.startswith('41.') and not text.startswith('42.') and not text.startswith('43.') and not text.startswith('44.') and not text.startswith('45.') and not text.startswith('46.') and not text.startswith('47.') and not text.startswith('48.') and not text.startswith('49.') and not text.startswith('50.')):
        if current_q:
            questions.append(current_q)
        q_num = int(m.group(1))
        q_text = m.group(2)
        current_q = {
            'num': q_num,
            'type': 'mcq' if q_num <= 45 else 'integer',
            'prompt': q_text,
            'images': list(images),
            'options': [],
            'correct': None,
            'raw_lines': []
        }
        continue
        
    if current_q:
        if images:
            current_q['images'].extend(images)
            
        if text.startswith('Correct Answer:'):
            current_q['correct'] = text.replace('Correct Answer:', '').strip()
        elif re.match(r'^\([A-D]\)', text):
            # Clean option text
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
for q in questions:
    print(f"Q{q['num']} ({q['type']}): images={q['images']} opt_count={len(q['options'])} correct={q['correct']}")
    print(f"  Prompt: {q['prompt'][:100]}...")
    if q['options']:
        print(f"  Options: {q['options']}")
    print('-'*50)

with open('parsed_chemistry_questions.json', 'w', encoding='utf-8') as f:
    json.dump(questions, f, indent=2, ensure_ascii=False)
