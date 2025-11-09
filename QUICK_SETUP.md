# Quick Setup Guide

## Step 1: Create Supabase Project
1. Go to https://supabase.com
2. Sign in or create account
3. Click "New Project"
4. Fill in project details and wait for setup to complete

## Step 2: Run SQL Script
1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `supabase-schema.sql`
4. Paste into the SQL Editor
5. Click **Run** (or press Cmd/Ctrl + Enter)
6. Verify success message appears

## Step 3: Get Your Credentials
1. Go to **Settings** → **API**
2. Copy:
   - **Project URL** (looks like: https://xxxxx.supabase.co)
   - **anon public** key (long string starting with eyJ...)

## Step 4: Create .env.local File
Create a file named `.env.local` in the project root with:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

Replace the placeholders with your actual values.

## Step 5: Restart Dev Server
Stop the current server (Ctrl+C) and restart:
```bash
npm run dev
```

## Verify Setup
1. Open http://localhost:3000
2. Try creating a space - if it works, setup is complete!
3. Check the browser console for any errors

## Troubleshooting

**"Supabase environment variables are not set"**
- Make sure `.env.local` exists in the project root
- Check that variable names are exactly: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Restart the dev server after creating/updating `.env.local`

**Database errors**
- Verify all tables were created in Supabase Table Editor
- Check that the SQL script ran without errors
- Make sure you're using the correct project credentials

