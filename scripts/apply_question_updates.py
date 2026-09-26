import json
import urllib.request
import os
import sys
from supabase_env import SERVICE_ROLE_KEY, SUPABASE_URL

sys.stdout.reconfigure(encoding='utf-8')

def supabase_request(method, endpoint, body=None):
    url = f"{SUPABASE_URL}{endpoint}"
    headers = {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode('utf-8')
            return json.loads(res_data) if res_data else None
    except urllib.error.HTTPError as e:
        print(f"Error {e.code}: {e.read().decode('utf-8')}")
        raise

# 1. Upload Q84 full image
q84_local_img = r'C:\Users\tanma\.gemini\antigravity-ide\brain\49c53adc-26e1-4aac-8764-c3e63f94461f\.user_uploaded\media_1787457824723.png'
with open(q84_local_img, 'rb') as f:
    img_data = f.read()

upload_url = f"{SUPABASE_URL}/storage/v1/object/exam-assets/images/booster_q84_full_structures_v2.png"
req = urllib.request.Request(
    upload_url,
    data=img_data,
    headers={
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
        'Content-Type': 'image/png',
        'x-upsert': 'true'
    },
    method='POST'
)
with urllib.request.urlopen(req) as response:
    print("✓ Uploaded Q84 full image to Supabase Storage.")

q84_public_url = f"{SUPABASE_URL}/storage/v1/object/public/exam-assets/images/booster_q84_full_structures_v2.png"
print(f"Q84 Public URL: {q84_public_url}")

# 2. Update Booster PCB Test (ba08beb3-3094-442b-866a-dc7cb8f6a341)
booster_test_id = 'ba08beb3-3094-442b-866a-dc7cb8f6a341'

# Update Q84
res84 = supabase_request(
    'PATCH',
    f'/rest/v1/test_questions?test_id=eq.{booster_test_id}&position=eq.84',
    {
        'prompt': 'The structure of the compound whose IUPAC name is 3-ethyl-2-hydroxy-4-methylhex-3-en-5-ynoic acid is:',
        'image_url': q84_public_url,
        'options': ['(A)', '(B)', '(C)', '(D)'],
        'correct_answer': '(D)'
    }
)
print("✓ Updated Booster Q84 successfully.")

# Update Q53 (Match the oxide)
q53_prompt = (
    "Match the oxide given in Column A with its property given in Column B:\n\n"
    "Column A | Column B\n"
    "--------------------\n"
    "(i) Na₂O   | (a) Neutral\n"
    "(ii) Al₂O₃ | (b) Basic\n"
    "(iii) N₂O  | (c) Acidic\n"
    "(iv) Cl₂O₇ | (d) Amphoteric\n\n"
    "Which of the following options has all correct pairs?"
)
res53 = supabase_request(
    'PATCH',
    f'/rest/v1/test_questions?test_id=eq.{booster_test_id}&position=eq.53',
    {
        'prompt': q53_prompt,
        'options': [
            '(i)-(b), (ii)-(a), (iii)-(d), (iv)-(c)',
            '(i)-(c), (ii)-(b), (iii)-(a), (iv)-(d)',
            '(i)-(a), (ii)-(d), (iii)-(b), (iv)-(c)',
            '(i)-(b), (ii)-(d), (iii)-(a), (iv)-(c)'
        ],
        'correct_answer': '(i)-(b), (ii)-(d), (iii)-(a), (iv)-(c)'
    }
)
print("✓ Updated Booster Q53 successfully.")

# Update Q54 (Match the following)
q54_prompt = (
    "Match the following oxides with their nature:\n\n"
    "Oxide (Column I) | Nature (Column II)\n"
    "------------------------------------\n"
    "(a) CO           | (i) Basic\n"
    "(b) BaO          | (ii) Neutral\n"
    "(c) Al₂O₃        | (iii) Acidic\n"
    "(d) Cl₂O₇        | (iv) Amphoteric\n\n"
    "Which of the following is the correct option?"
)
res54 = supabase_request(
    'PATCH',
    f'/rest/v1/test_questions?test_id=eq.{booster_test_id}&position=eq.54',
    {
        'prompt': q54_prompt,
        'options': [
            'a-iv, b-iii, c-ii, d-i',
            'a-i, b-ii, c-iii, d-iv',
            'a-ii, b-i, c-iv, d-iii',
            'a-iii, b-iv, c-i, d-ii'
        ],
        'correct_answer': 'a-ii, b-i, c-iv, d-iii'
    }
)
print("✓ Updated Booster Q54 successfully.")

# Update Q96 (Housefly classification)
q96_prompt = (
    "Match Column-I with Column-II for housefly classification and select the correct option using the codes given below:\n\n"
    "Column-I   | Column-II\n"
    "-----------------------\n"
    "(A) Family | (i) Diptera\n"
    "(B) Order  | (ii) Arthropoda\n"
    "(C) Class  | (iii) Muscidae\n"
    "(D) Phylum | (iv) Insecta"
)
res96 = supabase_request(
    'PATCH',
    f'/rest/v1/test_questions?test_id=eq.{booster_test_id}&position=eq.96',
    {
        'prompt': q96_prompt,
        'options': [
            'A – (iii), B – (i), C – (iv), D – (ii)',
            'A – (iii), B – (ii), C – (iv), D – (i)',
            'A – (iv), B – (iii), C – (ii), D – (i)',
            'A – (iv), B – (ii), C – (i), D – (iii)'
        ],
        'correct_answer': 'A – (iii), B – (i), C – (iv), D – (ii)'
    }
)
print("✓ Updated Booster Q96 successfully.")

# Update Q105 (Taxonomy match)
q105_prompt = (
    "Match Column-I with Column-II and choose the correct option:\n\n"
    "Column-I    | Column-II\n"
    "------------------------\n"
    "(A) Family  | (I) tuberosum\n"
    "(B) Kingdom | (II) Polymoniales\n"
    "(C) Order   | (III) Solanum\n"
    "(D) Species | (IV) Plantae\n"
    "(E) Genus   | (V) Solanaceae"
)
res105 = supabase_request(
    'PATCH',
    f'/rest/v1/test_questions?test_id=eq.{booster_test_id}&position=eq.105',
    {
        'prompt': q105_prompt,
        'options': [
            'A – IV, B – III, C – V, D – II, E – I',
            'A – V, B – IV, C – II, D – I, E – III',
            'A – IV, B – V, C – II, D – I, E – III',
            'A – V, B – III, C – II, D – I, E – IV'
        ],
        'correct_answer': 'A – V, B – IV, C – II, D – I, E – III'
    }
)
print("✓ Updated Booster Q105 successfully.")


# 3. Update Navigator PCM Test (d1099f8b-3b3d-4a53-94cf-58375dabd8fe) - Question 75
navigator_test_id = 'd1099f8b-3b3d-4a53-94cf-58375dabd8fe'

q75_prompt = "Evaluate lim as n → ∞ [n²[x] / (n³ + 1)], where n ∈ N and [x] denotes the greatest integer less than or equal to x."
res75 = supabase_request(
    'PATCH',
    f'/rest/v1/test_questions?test_id=eq.{navigator_test_id}&position=eq.75',
    {
        'prompt': q75_prompt,
        'options': [
            'Has value −1',
            'Has value 0',
            'Has value 1',
            'Does not exist'
        ],
        'correct_answer': 'Has value −1'
    }
)
print("✓ Updated Navigator Q75 successfully.")

print("\n==========================================")
print("ALL REQUESTED QUESTION UPDATES ARE APPLIED!")
print("==========================================")
