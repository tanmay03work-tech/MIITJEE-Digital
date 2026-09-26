import zipfile, xml.etree.ElementTree as ET, os, json, sys, re, base64

sys.stdout.reconfigure(encoding='utf-8')

def parse_docx(docx_path, out_img_dir):
    os.makedirs(out_img_dir, exist_ok=True)
    with zipfile.ZipFile(docx_path, 'r') as z:
        xml_content = z.read('word/document.xml')
        rels_content = z.read('word/_rels/document.xml.rels')
        
        # Extract images
        for fname in z.namelist():
            if fname.startswith('word/media/'):
                img_name = os.path.basename(fname)
                with open(os.path.join(out_img_dir, img_name), 'wb') as img_out:
                    img_out.write(z.read(fname))

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

    print(f"[{os.path.basename(docx_path)}] Total extracted paras: {len(extracted_paras)}")
    return extracted_paras

booster_paras = parse_docx(r'D:\Downloads\miitjee-mobile\question paper\MIITJEE_Booster_Batch_Question_Paper.docx', r'D:\Downloads\miitjee-mobile\question paper\extracted_booster')
navigator_paras = parse_docx(r'D:\Downloads\miitjee-mobile\question paper\Navigator_Batch_MIITJEE_QuestionPaper.docx', r'D:\Downloads\miitjee-mobile\question paper\extracted_navigator')

print("\n--- Booster Batch First 50 Paras ---")
for i, p in enumerate(booster_paras[:50]):
    print(f"{i:2d}: {p['text']} | IMGS: {p['images']}")
