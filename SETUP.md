# Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Go to [https://supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be fully initialized
3. Go to **Settings** > **API** and copy:
   - Project URL
   - Anon public key

### 3. Create Database Tables

1. In your Supabase project, go to **SQL Editor**
2. Click **New Query**
3. Copy and paste the entire contents of `supabase-schema.sql`
4. Click **Run** to execute the SQL script
5. Verify the tables were created by checking the **Table Editor**

### 4. Configure Environment Variables

1. Create a `.env.local` file in the root directory
2. Add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

Replace `your_project_url_here` and `your_anon_key_here` with your actual values from step 2.

### 5. Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Schema Overview

The application creates the following tables:

- **spaces**: Stores space information (Cabin, Desk, Meeting Room, Virtual Office, Day Pass)
- **customers**: Stores customer information with GST tracking
- **assignments**: Links customers to spaces with date ranges
- **payments**: Tracks payments with GST, dates, and destinations

## Features

✅ **Space Management**: Create, edit, delete spaces of 5 different types
✅ **Customer Management**: Complete customer profiles with GST status
✅ **Assignments**: Assign customers to spaces with date tracking
✅ **Payments**: Track payments with GST calculation, payment dates, and destinations
✅ **Dashboard**: Overview statistics and recent payments

## Troubleshooting

### Build Errors

If you see errors about missing Supabase URL, make sure:
- Your `.env.local` file exists in the root directory
- The environment variables are correctly named (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)
- You've restarted the dev server after creating/updating `.env.local`

### Database Errors

If you see database errors:
- Make sure you've run the SQL script from `supabase-schema.sql`
- Check that all tables were created successfully in the Supabase Table Editor
- Verify your Supabase project is active and not paused

### GST Calculation

The GST rate is set to 10% in the Payments component. To change it:
1. Open `components/Payments.tsx`
2. Find the `calculateGST` function
3. Change the `0.1` value to your desired GST rate (e.g., `0.18` for 18%)

## Next Steps

1. Create your first space
2. Add customers
3. Create assignments linking customers to spaces
4. Record payments
5. View the dashboard for insights

Enjoy managing your coworking space! 🚀

