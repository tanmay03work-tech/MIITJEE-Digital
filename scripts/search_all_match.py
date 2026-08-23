import json
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

for name, pth in [
    ('Physics', r'D:\Downloads\miitjee-mobile\question paper\extracted_physics_booster.json'),
    ('Chemistry', r'D:\Downloads\miitjee-mobile\question paper\extracted_chem_booster.json'),
    ('Biology', r'D:\Downloads\miitjee-mobile\question paper\extracted_bio_booster.json'),
]:
    items = json.load(open(pth, encoding='utf-8'))
    for idx, it in enumerate(items):
        t = it['text'].lower()
        if 'match' in t or 'column' in t or 'list-i' in t or 'list i' in t:
            print(f"[{name}] Index {idx}: {it['text']}")
