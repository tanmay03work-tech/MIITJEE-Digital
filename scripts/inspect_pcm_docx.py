import zipfile
import xml.etree.ElementTree as ET
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

docx_path = r'D:\Downloads\miitjee-mobile\question paper\MIITJEE_Navigator_FullQuestionBank_PCM (1).docx'
z = zipfile.ZipFile(docx_path)
doc_xml = z.read('word/document.xml')
rels_xml = z.read('word/_rels/document.xml.rels')

tree = ET.fromstring(doc_xml)
rels_tree = ET.fromstring(rels_xml)

ns = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture'
}

rel_map = {}
for rel in rels_tree:
    rId = rel.attrib.get('Id')
    target = rel.attrib.get('Target')
    if rId and target:
        rel_map[rId] = target

paragraphs = []
for p in tree.findall('.//w:p', ns):
    p_text = ''.join(t.text for t in p.findall('.//w:t', ns) if t.text)
    p_images = []
    for blip in p.findall('.//a:blip', ns):
        embed_id = blip.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
        if embed_id and embed_id in rel_map:
            p_images.append(rel_map[embed_id])
    paragraphs.append({'text': p_text.strip(), 'images': p_images})

non_empty = [p for p in paragraphs if p['text'] or p['images']]
print(f'Total paragraphs extracted: {len(paragraphs)}')
print(f'Non-empty elements count: {len(non_empty)}')

# Extract media files to extracted_images
os.makedirs(r'D:\Downloads\miitjee-mobile\question paper\extracted_images', exist_ok=True)
for filename in z.namelist():
    if filename.startswith('word/media/'):
        basename = os.path.basename(filename)
        out_path = os.path.join(r'D:\Downloads\miitjee-mobile\question paper\extracted_images', basename)
        with open(out_path, 'wb') as f:
            f.write(z.read(filename))
        print(f'Extracted image: {basename}')

with open(r'D:\Downloads\miitjee-mobile\question paper\extracted_doc_pcm.json', 'w', encoding='utf-8') as f:
    json.dump(non_empty, f, indent=2, ensure_ascii=False)

print('Saved extracted_doc_pcm.json')
