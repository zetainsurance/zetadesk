# ZetaDesk — Setup Guide

A per-record insurance broking CRM. Unlike the old single-row design, every
record lives in its own database row, so no single action can ever blank the
book, and two people editing different records never collide.

## 1. Create a new Supabase project
- supabase.com → New Project. Note the Project URL and the anon public key
  (Settings → API).

## 2. Create the tables
- Supabase → SQL Editor → paste the entire contents of `supabase_setup.sql`
  → Run. This creates all tables, triggers, and the row-level security that
  restricts access to signed-in team members.

## 3. Turn on email logins
- Authentication → Providers → Email: enable it.
- Turn OFF "Confirm email" (so you can add teammates without email verification).

## 4. Add your team (up to 5)
- Authentication → Users → Add user → enter each person's email + a password.
- Share those credentials with your team. They sign in on the ZetaDesk login screen.

## 5. Deploy to Vercel
- Import this repo into Vercel.
- Settings → Environment Variables, add for **Production only**:
  - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon public key
- Deploy. Open the production URL and sign in.

## Backups
- Use **Export All** in the header regularly. Supabase's free tier has no
  automatic backups, so keep periodic exports somewhere safe.

## Notes
- Anyone not signed in sees only the login screen — data is not readable
  without a valid team login (enforced by row-level security in the database).
