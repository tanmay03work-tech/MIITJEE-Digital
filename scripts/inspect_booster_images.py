import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'D:\Downloads\miitjee-mobile\question paper\parsed_booster_180.json', 'r', encoding='utf-8') as f:
    questions = json.load(f)

print(f"Loaded {len(questions)} parsed questions.")
questions_with_images = [q for q in questions if q['images']]
print(f"Questions with images: {len(questions_with_images)}")
for q in questions_with_images:
    print(f"Q{q['doc_num']} [{q['subject']}]: {q['images']}")
    print(f"  Prompt: {q['prompt'][:100]}")
    print(f"  Options: {q['options']}")
    print(f"  Correct: {q['correct']}")
    print('-'*50)

# Check for any missing options or correct answers
print("\n--- Validating options and answer keys ---")
for q in questions:
    if len(q['options']) != 4:
        print(f"WARNING: Q{q['doc_num']} [{q['subject']}] has {len(q['options'])} options! (Expected 4)")
        print(f"  Options: {q['options']}")
        print(f"  Raw: {q.get('raw_lines')}")
    if not q['correct']:
        print(f"WARNING: Q{q['doc_num']} [{q['subject']}] is missing correct answer!")
