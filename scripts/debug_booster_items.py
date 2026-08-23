import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

for name, path in [
    ('Physics', r'D:\Downloads\miitjee-mobile\question paper\extracted_physics_booster.json'),
    ('Chemistry', r'D:\Downloads\miitjee-mobile\question paper\extracted_chem_booster.json'),
    ('Biology', r'D:\Downloads\miitjee-mobile\question paper\extracted_bio_booster.json'),
]:
    print(f"\n=================== {name} (First 20 items) ===================")
    with open(path, 'r', encoding='utf-8') as f:
        items = json.load(f)
    for i, it in enumerate(items[:20]):
        print(f"{i:2d}: [imgs: {it['images']}] {it['text']}")
