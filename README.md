# Shammi Travels

Private back-office app: dashboard, invoices, quotations and service agreements (T&Cs), with history stored in a database. Static site (GitHub Pages) + Supabase (Postgres + login).

## Setup (one time)
1. Create a free project at supabase.com.
2. SQL Editor → paste and run `schema.sql`.
3. Authentication → Providers → Email: turn **off** "Allow new users to sign up". Then Authentication → Users → **Add user** (your email + password).
4. Project Settings → API: copy the Project URL and `anon` key into `config.js`. Edit the business details in the same file.
5. GitHub → Settings → Pages → Deploy from branch `main`, folder `/ (root)`.
6. Open the Pages URL and sign in.

## Notes
- The page code is public on Pages, but all data sits behind login (Row Level Security). The anon key is meant to be public.
- Print / Save PDF uses the browser's print dialog.
- Run locally: `python3 -m http.server 8000`, open http://localhost:8000.
