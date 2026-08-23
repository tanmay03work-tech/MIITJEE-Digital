import zipfile
import xml.etree.ElementTree as ET
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

files = [
    {
        'subject': 'Physics',
        'path': r'D:\Downloads\miitjee-mobile\question paper\MIITJEE_Booster_Physics_QuestionBank.docx',
        'out_json': r'D:\Downloads\miitjee-mobile\question paper\extracted_physics_booster.json',
        'img_prefix': 'booster_phys'
    },
    {
        'subject': 'Chemistry',
        'path': r'D:\Downloads\miitjee-mobile\question paper\Booster_Batch_Chem_Booster.docx',
        'out_json': r'D:\Downloads\miitjee-mobile\question paper\extracted_chem_booster.json',
        'img_prefix': 'booster_chem'
    },
    {
        'subject': 'Biology',
        'path': r'D:\Downloads\miitjee-mobile\question paper\Booster Biology Section A - Question Paper with Answer Key.docx',
        'out_json': r'D:\Downloads\miitjee-mobile\question paper\extracted_bio_booster.json',
        'img_prefix': 'booster_bio'
    }
]

images_dir = r'D:\Downloads\miitjee-mobile\question paper\extracted_images'
os.makedirs(images_dir, exist_ok=True)

ns = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture'
}

for item in files:
    print(f"\n================ Processing {item['subject']} ================")
    if not os.path.exists(item['path']):
        print(f"ERROR: File not found: {item['path']}")
        continue

    z = zipfile.ZipFile(item['path'])
    doc_xml = z.read('word/document.xml')
    rels_xml = z.read('word/_rels/document.xml.rels')

    tree = ET.fromstring(doc_xml)
    rels_tree = ET.fromstring(rels_xml)

    rel_map = {}
    for rel in rels_tree:
        rId = rel.attrib.get('Id')
        target = rel.attrib.get('Target')
        if rId and target:
            rel_map[rId] = target

    # Extract images from docx
    for filename in z.namelist():
        if filename.startswith('word/media/'):
            basename = os.path.basename(filename)
            target_filename = f"{item['img_prefix']}_{basename}"
            out_img_path = os.path.join(images_dir, target_filename)
            with open(out_img_path, 'wb') as f:
                f.write(z.read(filename))
            print(f"Extracted image: {basename} -> {target_filename}")

    paragraphs = []
    for p in tree.findall('.//w:p', ns):
        p_text = ''.join(t.text for t in p.findall('.//w:t', ns) if t.text)
        p_images = []
        for blip in p.findall('.//a:blip', ns):
            embed_id = blip.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
            if embed_id and embed_id in rel_map:
                orig_target = rel_map[embed_id]
                basename = os.path.basename(orig_target)
                target_filename = f"{item['img_prefix']}_{basename}"
                p_images.append(target_filename)
        paragraphs.append({'text': p_text.strip(), 'images': p_images})

    non_empty = [p for p in paragraphs if p['text'] or p['images']]
    print(f"Total non-empty elements for {item['subject']}: {len(non_empty)}")

    with open(item['out_json'], 'w', encoding='utf-8') as f:
        json.dump(non_empty, f, indent=2, ensure_ascii=False)
    print(f"Saved {item['out_json']}")
