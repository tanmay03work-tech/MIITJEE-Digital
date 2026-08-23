import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'D:\Downloads\miitjee-mobile\question paper\extracted_chem_booster.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

for i, it in enumerate(items[-30:]):
    print(f"{i:2d}: [imgs: {it['images']}] {it['text']}")
