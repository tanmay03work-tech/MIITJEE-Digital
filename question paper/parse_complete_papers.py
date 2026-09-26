import zipfile, xml.etree.ElementTree as ET, os, json, sys, re, base64

sys.stdout.reconfigure(encoding='utf-8')

def parse_docx_questions(docx_path, img_dir, paper_name):
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

    print(f"\n======================================")
    print(f"Parsing: {paper_name}")
    print(f"Total non-empty paragraphs: {len(extracted_paras)}")

    current_subject = 'Physics'
    current_section = 'Section A (MCQ)'
    current_q = None
    questions = []

    for item in extracted_paras:
        t = item['text']
        imgs = item['images']

        # Subject detection
        if 'Physics' in t and not t.startswith('Q') and not t.startswith('('):
            current_subject = 'Physics'
        elif 'Chemistry' in t and not t.startswith('Q') and not t.startswith('('):
            current_subject = 'Chemistry'
        elif 'Mathematics' in t and not t.startswith('Q') and not t.startswith('('):
            current_subject = 'Mathematics'
        elif ('Biology' in t or 'Botany' in t or 'Zoology' in t) and not t.startswith('Q') and not t.startswith('('):
            current_subject = 'Biology'

        if 'Section A' in t:
            current_section = 'Section A (MCQ)'
        elif 'Section B' in t:
            current_section = 'Section B (Numeric)'

        # Question start regex: Q1., Q2., Q100., etc.
        m = re.match(r'^Q(\d+)\.\s*(.*)', t)
        if m:
            if current_q:
                questions.append(current_q)
            q_num = int(m.group(1))
            q_rest = m.group(2).strip()
            current_q = {
                'q_num': q_num,
                'subject': current_subject,
                'section': current_section,
                'text': q_rest,
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

            # Option detection: (A), (B), (C), (D) or (a), (b), (c), (d)
            opt_m = re.match(r'^\(([A-Da-d])\)\s*(.*)', t)
            corr_m = re.match(r'^Correct Answer:\s*\(?([A-Da-d0-9\.\-]+)\)?', t)
            
            if opt_m:
                opt_key = opt_m.group(1).upper()
                current_q['options'][opt_key] = opt_m.group(2).strip()
            elif corr_m:
                current_q['correct_answer'] = corr_m.group(1).strip().upper()
            elif t.startswith('Correct Answer:'):
                ans_val = t.replace('Correct Answer:', '').strip().strip('()')
                current_q['correct_answer'] = ans_val.upper()
            else:
                if not current_q['options'] and not current_q['correct_answer']:
                    if t:
                        if current_q['text']:
                            current_q['text'] += '\n' + t
                        else:
                            current_q['text'] = t

    if current_q:
        questions.append(current_q)

    print(f"Total parsed questions: {len(questions)}")
    
    # Validation & stats
    missing_ans = [q['q_num'] for q in questions if not q['correct_answer']]
    missing_opts = [q['q_num'] for q in questions if q['type'] == 'MCQ' and len(q['options']) < 4]
    with_imgs = [q['q_num'] for q in questions if q['images']]
    
    print(f"Questions with images ({len(with_imgs)}): {with_imgs}")
    print(f"Missing answers ({len(missing_ans)}): {missing_ans}")
    print(f"Incomplete options (<4) ({len(missing_opts)}): {missing_opts}")

    # Convert images to base64 map
    img_b64 = {}
    if os.path.exists(img_dir):
        for fname in os.listdir(img_dir):
            if fname.lower().endswith(('.png', '.jpg', '.jpeg')):
                fpath = os.path.join(img_dir, fname)
                with open(fpath, 'rb') as f:
                    b64 = base64.b64encode(f.read()).decode('utf-8')
                    img_b64[fname] = f"data:image/png;base64,{b64}"

    return questions, img_b64

nav_q, nav_imgs = parse_docx_questions(
    r'D:\Downloads\miitjee-mobile\question paper\Navigator_Batch_MIITJEE_QuestionPaper.docx',
    r'D:\Downloads\miitjee-mobile\question paper\extracted_navigator',
    'Navigator Batch'
)

boost_q, boost_imgs = parse_docx_questions(
    r'D:\Downloads\miitjee-mobile\question paper\MIITJEE_Booster_Batch_Question_Paper.docx',
    r'D:\Downloads\miitjee-mobile\question paper\extracted_booster',
    'MIITJEE Booster Batch'
)
