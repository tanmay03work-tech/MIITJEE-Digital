import zipfile, xml.etree.ElementTree as ET, os, json, sys

sys.stdout.reconfigure(encoding='utf-8')

docx_path = r'D:\Downloads\miitjee-mobile\question paper\Navigator_Batch_MIITJEE_QuestionPaper.docx'
with zipfile.ZipFile(docx_path, 'r') as z:
    xml_content = z.read('word/document.xml')
    rels_content = z.read('word/_rels/document.xml.rels')

rels_tree = ET.fromstring(rels_content)
r_map = {rel.attrib['Id']: rel.attrib['Target'] for rel in rels_tree.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship')}

tree = ET.fromstring(xml_content)
ns = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'
}

paras = tree.findall('.//w:p', ns)
extracted_paras = []
for p in paras:
    text = ''.join(n.text for n in p.findall('.//w:t', ns) if n.text).strip()
    blips = p.findall('.//a:blip', ns)
    imgs = [os.path.basename(r_map[b.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed']]) for b in blips if '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed' in b.attrib]
    if text or imgs:
        extracted_paras.append({'text': text, 'images': imgs})

print(f'Total non-empty paras: {len(extracted_paras)}')

current_subject = 'Physics'
current_section = 'Section A (MCQ)'
current_q = None
questions = []

for item in extracted_paras:
    t = item['text']
    imgs = item['images']
    
    # Check subject header
    if 'Physics' in t and not t.startswith('Q') and not t.startswith('('):
        if 'Navigator physics' in t or t == 'Physics' or 'Subject   : Physics' in t:
            current_subject = 'Physics'
    if 'Chemistry' in t and not t.startswith('Q') and not t.startswith('('):
        current_subject = 'Chemistry'
    if 'Mathematics' in t and not t.startswith('Q') and not t.startswith('('):
        current_subject = 'Mathematics'
        
    if 'Section A' in t:
        current_section = 'Section A (MCQ)'
    elif 'Section B' in t:
        current_section = 'Section B (Numeric)'
        
    # Check if question start: Q1., Q2., etc.
    if t.startswith('Q') and len(t) > 1 and (t[1:4].replace('.', '').replace(' ', '').isdigit()):
        if current_q:
            questions.append(current_q)
        q_num_str = t.split('.')[0][1:].strip()
        q_text_rest = '.'.join(t.split('.')[1:]).strip()
        current_q = {
            'q_num': int(q_num_str),
            'subject': current_subject,
            'section': current_section,
            'text': q_text_rest,
            'images': list(imgs),
            'options': {},
            'correct_answer': None,
            'type': 'MCQ' if 'Section A' in current_section or 'MCQ' in current_section else 'NUMERICAL',
            'raw_lines': [t]
        }
        continue
    
    if current_q:
        current_q['raw_lines'].append(t)
        if imgs:
            current_q['images'].extend(imgs)
        
        # Check if option
        if t.startswith('(A)') or t.startswith('(a)'):
            current_q['options']['A'] = t[3:].strip()
        elif t.startswith('(B)') or t.startswith('(b)'):
            current_q['options']['B'] = t[3:].strip()
        elif t.startswith('(C)') or t.startswith('(c)'):
            current_q['options']['C'] = t[3:].strip()
        elif t.startswith('(D)') or t.startswith('(d)'):
            current_q['options']['D'] = t[3:].strip()
        elif t.startswith('Correct Answer:'):
            current_q['correct_answer'] = t.replace('Correct Answer:', '').strip()
        else:
            if not current_q['options'] and not current_q['correct_answer']:
                if t:
                    current_q['text'] += '\n' + t
            elif current_q['options'] and not current_q['correct_answer']:
                pass

if current_q:
    questions.append(current_q)

print(f'Total questions parsed: {len(questions)}')
for q in questions:
    img_info = f", images: {q['images']}" if q['images'] else ""
    print(f"Q{q['q_num']}: [{q['subject']} - {q['section']}] ({q['type']}) Correct: {q['correct_answer']}{img_info}")

with open(r'D:\Downloads\miitjee-mobile\question paper\extracted\questions.json', 'w', encoding='utf-8') as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

print('Saved to questions.json')
