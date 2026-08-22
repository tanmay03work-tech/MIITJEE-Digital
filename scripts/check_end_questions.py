import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'D:\Downloads\miitjee-mobile\question paper\extracted_doc_pcm.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

for i, it in enumerate(items[-40:]):
    print(f'{i:2d}: {it.get("text")}')
