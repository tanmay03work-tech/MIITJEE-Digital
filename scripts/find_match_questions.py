import json
import urllib.request
import sys
from supabase_env import SERVICE_ROLE_KEY, SUPABASE_URL

sys.stdout.reconfigure(encoding='utf-8')

test_id = 'ba08beb3-3094-442b-866a-dc7cb8f6a341'
url = f"{SUPABASE_URL}/rest/v1/test_questions?test_id=eq.{test_id}&order=position.asc&select=*"
headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
}

req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as resp:
    questions = json.loads(resp.read().decode('utf-8'))

print(f"Fetched {len(questions)} questions from Booster PCB test.")

match_qs = []
for q in questions:
    p = q['prompt'].lower()
    if 'match' in p or 'column' in p or 'list i' in p or 'statement i' in p or any('a –' in str(opt).lower() or 'a -' in str(opt).lower() or 'a–' in str(opt).lower() for opt in q.get('options', [])):
        match_qs.append(q)

print(f"\nFound {len(match_qs)} Match/Column/Statement questions:")
for q in match_qs:
    print(f"\nPosition: {q['position']} [{q['subject_label']}] ID: {q['id']}")
    print(f"Prompt:\n{q['prompt']}")
    print(f"Options: {q['options']}")
    print(f"Correct: {q['correct_answer']}")
    print('-'*60)
