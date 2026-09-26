import json, sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'D:\Downloads\miitjee-mobile\question paper\extracted\questions.json', 'r', encoding='utf-8') as f:
    qs = json.load(f)

for q in qs:
    q_num = q['q_num']
    sub = q['subject']
    sec = q['section']
    q_type = q['type']
    ans = q['correct_answer']
    opts = list(q['options'].keys())
    imgs = q['images']
    
    # Validation
    if q_type == 'MCQ':
        if len(opts) != 4:
            print(f"WARNING: Q{q_num} has {len(opts)} options: {opts}")
        if ans not in ['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd']:
            print(f"WARNING: Q{q_num} MCQ has invalid answer: {ans}")
    else:
        if not ans:
            print(f"WARNING: Q{q_num} NUMERICAL has no answer!")
            
    if imgs:
        print(f"Q{q_num} [{sub}] images: {imgs}")
print("Validation complete!")
