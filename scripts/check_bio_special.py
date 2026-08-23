import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'D:\Downloads\miitjee-mobile\question paper\extracted_bio_booster.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

# Find Q96 and Q119
for i, it in enumerate(items):
    t = it['text']
    if 'Q96.' in t or 'Q119.' in t:
        print(f"\n--- Context for item {i} ---")
        for j in range(max(0, i-2), min(len(items), i+15)):
            print(f"{j:3d}: {items[j]['text']}")
