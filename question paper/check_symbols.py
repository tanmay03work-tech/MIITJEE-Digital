import zipfile, xml.etree.ElementTree as ET, os, json, sys

sys.stdout.reconfigure(encoding='utf-8')

docx_path = r'D:\Downloads\miitjee-mobile\question paper\Navigator_Batch_MIITJEE_QuestionPaper.docx'
with zipfile.ZipFile(docx_path, 'r') as z:
    xml_content = z.read('word/document.xml')

tree = ET.fromstring(xml_content)
ns = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
}

# Let's check all runs (w:r) to see font, sym, etc.
for p in tree.findall('.//w:p', ns):
    p_text = ''
    has_sym = False
    for r in p.findall('.//w:r', ns):
        sym = r.find('.//w:sym', ns)
        if sym is not None:
            has_sym = True
            font = sym.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}font')
            char = sym.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}char')
            p_text += f'[SYM font={font} char={char}]'
        for t in r.findall('.//w:t', ns):
            if t.text:
                p_text += t.text
    if '\ufffd' in p_text or has_sym or '' in p_text:
        print(f"Special text run found: {p_text}")
