import json, sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'D:\Downloads\miitjee-mobile\question paper\extracted\questions.json', 'r', encoding='utf-8') as f:
    qs = json.load(f)

for q in qs:
    print(f"================== Q{q['q_num']} [{q['subject']} - {q['section']}] ({q['type']}) ==================")
    print("PROMPT:", q['text'])
    if q['images']:
        print("IMAGES:", q['images'])
    if q['options']:
        for k, v in q['options'].items():
            print(f"  ({k}) {v}")
    print("CORRECT:", q['correct_answer'])
    print()
