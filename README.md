# Coworking Space Manager

A comprehensive web application for managing coworking spaces, customers, assignments, and payments with Supabase integration.

## Features

- **Space Management**: CRUD operations for 5 types of spaces (Cabin, Desk, Meeting Room, Virtual Office, Day Pass)
- **Customer Management**: Complete customer database with GST tracking
- **Assignment System**: Assign customers to spaces with date tracking
- **Payment Tracking**: Track payments with GST support, payment dates, and destinations
- **Dashboard**: Overview statistics and recent payments

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project at [Supabase](https://supabase.com)
2. Go to SQL Editor and run the SQL script from `supabase-schema.sql`
3. Get your project URL and anon key from Settings > API

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Schema

The application uses the following tables:

- **spaces**: Space information (name, type, capacity, price, availability)
- **customers**: Customer information (name, contact, company, GST status)
- **assignments**: Customer-to-space assignments with dates
- **payments**: Payment records with GST tracking, dates, and destinations

## Features in Detail

### Space Management
- Create, read, update, and delete spaces
- Support for 5 space types: Cabin, Desk, Meeting Room, Virtual Office, Day Pass
- Track capacity and pricing per day
- Mark spaces as available/unavailable

### Customer Management
- Complete customer profiles
- Track GST status (pays GST or not)
- Company and contact information
- Tax ID tracking

### Assignment System
- Assign customers to spaces
- Track start and end dates
- Status tracking (active, inactive, completed)
- Notes for each assignment

### Payment Tracking
- Record payments with amount and dates
- Track payment date and payment-for date
- GST calculation (10% rate, adjustable in code)
- Payment destination tracking
- Payment method selection
- Reference number tracking
- Link payments to assignments

### Dashboard
- Total spaces and availability
- Customer count
- Active assignments
- Total payments
- Monthly revenue
- Occupancy rate
- Recent payments list

## Technologies Used

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- Supabase (PostgreSQL)
- date-fns

## Project Structure

```
coworking-space-manager/
├── app/
│   ├── layout.tsx          # Root layout with navigation
│   ├── page.tsx             # Dashboard page
│   ├── spaces/              # Spaces management page
│   ├── customers/           # Customers management page
│   ├── assignments/         # Assignments management page
│   └── payments/            # Payments management page
├── components/
│   ├── Navigation.tsx       # Navigation component
│   ├── Dashboard.tsx        # Dashboard component
│   ├── Spaces.tsx           # Spaces CRUD component
│   ├── Customers.tsx        # Customers CRUD component
│   ├── Assignments.tsx      # Assignments CRUD component
│   └── Payments.tsx         # Payments CRUD component
├── lib/
│   └── supabase.ts          # Supabase client configuration
├── types/
│   └── index.ts             # TypeScript type definitions
└── supabase-schema.sql      # Database schema SQL script
```

## Notes

- GST rate is set to 10% in the Payments component. Adjust the `calculateGST` function if needed.
- All dates are stored in UTC and displayed in local timezone.
- The application uses Supabase Row Level Security (RLS) - make sure to configure policies as needed for your use case.
