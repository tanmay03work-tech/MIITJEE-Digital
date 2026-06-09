# Edge Function Setup

This project includes the `pdf-to-questions` Supabase Edge Function.

## Required Secrets

Set these in your Supabase project before deploying:

- `OCR_SPACE_API_KEY`
- `GEMINI_API_KEY`

Optional:

- `GEMINI_MODEL`

Recommended default:

- `GEMINI_MODEL=gemini-2.5-flash`

## CLI Commands

Run these from your project root:

```bash
supabase login
supabase link --project-ref uwuzdggimbbbfgcauzho
supabase secrets set OCR_SPACE_API_KEY=YOUR_OCR_SPACE_API_KEY
supabase secrets set GEMINI_API_KEY=YOUR_FULL_GEMINI_API_KEY
supabase secrets set GEMINI_MODEL=gemini-2.5-flash
supabase functions deploy pdf-to-questions
```

If you want local testing:

```bash
supabase functions serve pdf-to-questions --env-file supabase/functions/.env
```

## Important

- Do not commit real API keys into the repo.
- The Gemini key must be the full value, not a truncated one.
- If you prefer OpenAI later, the function already supports that pattern and can be extended by setting `provider: "openai"` in the request body.
