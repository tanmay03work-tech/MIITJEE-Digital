import zipfile, xml.etree.ElementTree as ET, sys

sys.stdout.reconfigure(encoding='utf-8')

docx_path = r'D:\Downloads\miitjee-mobile\question paper\Navigator_Batch_MIITJEE_QuestionPaper.docx'
with zipfile.ZipFile(docx_path, 'r') as z:
    xml_content = z.read('word/document.xml')

tree = ET.fromstring(xml_content)
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

for p in tree.findall('.//w:p', ns):
    p_text = ''.join(n.text for n in p.findall('.//w:t', ns) if n.text).strip()
    if p_text.startswith('Q1.') or p_text.startswith('Q2.'):
        print(f"PARAGRAPH: {p_text}")
        for ch in p_text:
            if ord(ch) > 127:
                print(f"  Char: '{ch}' (ord: {ord(ch)}, hex: {hex(ord(ch))})")
