# Takmao Rental Management System

A production-ready, full-stack web application for apartment and rental management in Cambodia. Supports both **USD** and **Khmer Riel (KHR)** currencies, built to replace the original Excel-based workflow while preserving all business logic.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| UI Components | shadcn/ui, Framer Motion, Recharts |
| Backend | Next.js API Routes (Node.js) |
| Database | PostgreSQL + Prisma ORM |
| Auth | NextAuth v5 (JWT sessions, role-based) |
| Notifications | Telegram Bot API, Twilio SMS |
| PDF | Browser Print / React-PDF |

---

## Prerequisites

1. **Node.js 18+** — [nodejs.org](https://nodejs.org)
2. **PostgreSQL 14+** — [postgresql.org](https://www.postgresql.org) or [Supabase](https://supabase.com)
3. **npm** (included with Node.js)

---

## Quick Start

### 1. Install Node.js

Download and install Node.js from [nodejs.org/en/download](https://nodejs.org/en/download).

Verify:
```bash
node --version   # v18+ required
npm --version
```

### 2. Install dependencies

```bash
cd "Takmom Tanent Managment"
npm install
```

### 3. Set up the database

**Option A — Local PostgreSQL:**
```bash
# Create database
psql -U postgres -c "CREATE DATABASE takmao_rental;"
```

**Option B — Supabase (free cloud):**
1. Go to [supabase.com](https://supabase.com) → New Project
2. Copy the connection string from Project Settings → Database

### 4. Configure environment

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Minimum required:
```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/takmao_rental"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="any-random-32-char-string-here"
```

### 5. Run database migrations

```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database
npm run db:seed       # Seed demo data
```

### 6. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Default login:**
- Email: `admin@takmao.com`
- Password: `admin123`

---

## Features

### Dashboard
- Monthly revenue, occupancy rate, outstanding debt
- 6-month revenue trend chart
- Room status overview (occupied/vacant/maintenance)
- Unpaid billing quick view

### Room Management
- Add/edit/delete rooms with floor, type, rates
- Per-room water and electric rate overrides
- Visual occupancy status cards
- Linked tenant display

### Tenant Management
- Full tenant profiles with personal and emergency contacts
- Assign/move tenants between rooms
- Contract tracking (start/end dates, monthly rent)
- Complete billing and payment history per tenant
- Move-out workflow (auto-vacates room, terminates contract)

### Billing System (Excel-accurate formulas)
```
water_usage        = curr_water_reading - prev_water_reading
water_cost_riel    = water_usage × water_rate_riel

electric_usage     = curr_electric_reading - prev_electric_reading
electric_cost_riel = electric_usage × electric_rate_riel

late_penalty       = flat mode  → late_days > threshold_days ? flat_usd : 0   (default: $10 after 10 days)
                     perday mode → late_days × penalty_rate_usd
                     (per-branch toggle; overridable per bill on the billing form)

outstanding_debt   = previous bill's unpaid balance (total − payments), carried forward

total_usd = rent + (water_cost_riel + electric_cost_riel) / exchange_rate
            + outstanding_debt + late_penalty - discount

total_riel = total_usd × exchange_rate
```

- **Live preview** while entering meter readings
- Auto-fill previous readings from last billing
- Carry-forward outstanding debt
- Bulk monthly billing generation
- Mark as paid / record partial payments

### Invoice System
- Auto-generated invoice numbers (INV-2025-0001)
- Professional printable invoice with company branding
- Payment history on invoice
- Send via Telegram

### Reports
- 12-month revenue vs outstanding bar chart
- Filter by month
- Export to CSV

### Notifications
- Send Telegram payment reminders per tenant
- Bulk reminder to all unpaid tenants
- Notification history log

### Settings
- Exchange rate (KHR/USD)
- Water and electric rates (global defaults)
- Late payment penalty rate
- Company info (name, phone, address)
- Telegram Bot Token + Chat ID
- SMTP email configuration
- Twilio SMS configuration

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/          # Login page
│   ├── (dashboard)/           # All dashboard pages
│   │   ├── dashboard/
│   │   ├── rooms/
│   │   ├── tenants/[id]/
│   │   ├── billing/create/
│   │   ├── invoices/[id]/
│   │   ├── reports/
│   │   ├── notifications/
│   │   └── settings/
│   └── api/                   # REST API routes
│       ├── auth/[...nextauth]/
│       ├── rooms/[id]/
│       ├── tenants/[id]/moveout/
│       ├── billing/[id]/mark-paid/
│       ├── billing/generate/
│       ├── payments/
│       ├── invoices/[id]/send-telegram/
│       ├── notifications/send-bulk/
│       ├── settings/
│       └── seed/
├── components/
│   ├── layout/                # Sidebar, Header, Shell
│   ├── ui/                    # Base UI components
│   ├── dashboard/             # Stats cards, charts
│   ├── rooms/                 # Room form dialog
│   ├── tenants/               # Tenant form dialog
│   └── billing/               # Payment dialog
├── lib/
│   ├── auth.ts                # NextAuth config
│   ├── db.ts                  # Prisma client
│   ├── billing.ts             # Billing calculations
│   ├── notifications.ts       # Telegram/SMS
│   └── utils.ts               # Helpers
├── types/index.ts             # TypeScript types
└── middleware.ts              # Auth protection
prisma/
├── schema.prisma              # Database schema
└── seed.ts                    # Demo data
```

---

## User Roles

| Role | Permissions |
|------|------------|
| **admin** | Full access including Settings |
| **manager** | Tenants, Rooms, Billing, Reports, Notifications |
| **staff** | View and record payments only |

---

## Deployment

### Vercel + Supabase (Recommended)

1. Push code to GitHub
2. Create project on [vercel.com](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy — Vercel auto-detects Next.js

```bash
# After deployment, run migrations:
npx prisma migrate deploy
```

### Railway

1. Create project on [railway.app](https://railway.app)
2. Add PostgreSQL service
3. Deploy from GitHub with env vars

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NEXTAUTH_URL` | ✅ | Your app URL (e.g. https://your-app.vercel.app) |
| `NEXTAUTH_SECRET` | ✅ | Random secret (32+ chars) |
| `TELEGRAM_BOT_TOKEN` | Optional | For payment reminders |
| `TELEGRAM_CHAT_ID` | Optional | Target chat/group |
| `TWILIO_ACCOUNT_SID` | Optional | For SMS reminders |
| `TWILIO_AUTH_TOKEN` | Optional | Twilio auth |
| `TWILIO_PHONE_NUMBER` | Optional | Your Twilio number |
| `SMTP_HOST` | Optional | For email invoices |
| `SMTP_USER` | Optional | SMTP username |
| `SMTP_PASS` | Optional | SMTP password |

---

## Telegram Bot Setup

1. Message [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the token → paste into Settings → Telegram
3. Add bot to your group/channel
4. Get your chat ID from [@userinfobot](https://t.me/userinfobot) → paste into Settings

---

## License

MIT — Free for personal and commercial use.
