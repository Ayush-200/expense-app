# Database Setup Checklist

## ✅ Problem Solved!

Your database is now set up correctly. All tables have been created in your Neon PostgreSQL database.

---

## What Was the Issue?

**Error:** `The table 'public.groups' does not exist`

**Cause:** The migrations were not applied to your Neon database yet.

**Solution:** Run migrations to create all tables.

---

## What We Just Did

### 1. Applied All Migrations ✅
```bash
npx prisma migrate deploy
```

**Created these tables in your Neon database:**
- ✅ `users` (from migration: `20260614194255_init`)
- ✅ `groups` (from migration: `20260614194707_add_groups`)
- ✅ `group_members` (from migration: `20260614194707_add_groups`)
- ✅ `expenses` (from migration: `20260614195536_add_expenses`)
- ✅ `expense_participants` (from migration: `20260614195536_add_expenses`)
- ✅ `settlements` (from migration: `20260614202843_add_settlements`)

### 2. Verified Database Schema ✅
```bash
npx prisma db pull --force
```

### 3. Generated Prisma Client ✅
```bash
npx prisma generate
```

---

## Complete Setup Guide (For Future Reference)

### Step 1: Configure Environment
Create `backend/.env`:
```env
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
DIRECT_DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
```

### Step 2: Create Your Schema
Edit `backend/prisma/schema.prisma` (you already have this):
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
}

model User { ... }
model Group { ... }
// ... other models
```

### Step 3: Apply Migrations
```bash
cd backend

# For development (creates migration if needed)
npx prisma migrate dev

# For production (applies existing migrations)
npx prisma migrate deploy
```

### Step 4: Generate Client
```bash
npx prisma generate
```

### Step 5: Start Your App
```bash
npm run dev
```

---

## Quick Commands Reference

### Check Database Status
```bash
npx prisma migrate status
```

### View Your Data
```bash
npx prisma studio
# Opens at http://localhost:5555
```

### Reset Database (⚠️ Deletes All Data)
```bash
npx prisma migrate reset
```

### Seed Database with Sample Data
```bash
npm run prisma:seed
# or
npx tsx prisma/seed.ts
```

---

## Verify Everything Works

### Test 1: Check Tables Exist
```bash
npx prisma db pull
# Should say: "Introspected 6 models"
```

### Test 2: Run Your Tests
```bash
npm test
# Should show: 31 tests passed
```

### Test 3: Start Backend
```bash
npm run dev
# Should start on http://localhost:5000
```

### Test 4: Test API Endpoint
```bash
curl http://localhost:5000/api/health
# Should return: {"status":"ok"}
```

---

## Common Migration Commands

### Development Workflow
```bash
# 1. Edit schema.prisma
# 2. Create and apply migration
npx prisma migrate dev --name your_change_name
```

### Production Deployment
```bash
# Apply existing migrations (no new ones created)
npx prisma migrate deploy
```

### Check Migration Status
```bash
# See which migrations are applied
npx prisma migrate status
```

### Resolve Migration Issues
```bash
# Mark failed migration as rolled back
npx prisma migrate resolve --rolled-back "migration_name"

# Mark migration as applied (if manually applied)
npx prisma migrate resolve --applied "migration_name"
```

---

## Troubleshooting

### Issue: "Migration already applied"
**Solution:** This is fine, migrations are idempotent.

### Issue: "Migration failed"
**Solution:**
1. Check your DATABASE_URL is correct
2. Ensure database is accessible
3. Check Neon dashboard for connection limits

### Issue: "Table already exists"
**Solution:**
```bash
# Reset and reapply all migrations
npx prisma migrate reset
```

### Issue: "Schema drift detected"
**Solution:**
```bash
# Pull current schema from database
npx prisma db pull

# Or create a migration to sync
npx prisma migrate dev --name fix_drift
```

---

## Database Visualization

Your current database structure:

```
┌─────────────┐
│    users    │
├─────────────┤
│ id          │─┐
│ name        │ │
│ email       │ │
│ password    │ │
└─────────────┘ │
                │
    ┌───────────┴───────────┐
    │                       │
┌───▼──────────┐    ┌──────▼────────┐
│    groups    │    │   expenses    │
├──────────────┤    ├───────────────┤
│ id           │◄───┤ id            │
│ name         │    │ groupId       │
│ createdById  │    │ paidById      │
└──────────────┘    │ totalAmount   │
    │               │ splitType     │
    │               └───────────────┘
    │                       │
    │               ┌───────▼────────────────┐
    │               │ expense_participants   │
    │               ├────────────────────────┤
    │               │ id                     │
    │               │ expenseId              │
    │               │ userId                 │
    │               │ amountOwed             │
    │               └────────────────────────┘
    │
┌───▼──────────────┐
│  group_members   │
├──────────────────┤
│ id               │
│ groupId          │
│ userId           │
│ joinedAt         │
│ leftAt           │
└──────────────────┘

┌─────────────────┐
│  settlements    │
├─────────────────┤
│ id              │
│ groupId         │◄─── connects to groups
│ fromUserId      │◄─── connects to users
│ toUserId        │◄─── connects to users
│ amount          │
│ note            │
│ date            │
└─────────────────┘
```

---

## Next Steps

1. ✅ **Database is ready** — all tables created
2. ✅ **Prisma client generated** — types available
3. ✅ **Ready to use** — start your backend

### Start Development:
```bash
cd backend
npm run dev
```

### Test the API:
```bash
# Health check
curl http://localhost:5000/api/health

# Register a user (example)
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

---

## Summary

✅ **Migrations applied** — All 4 migrations deployed  
✅ **Tables created** — 6 tables in Neon database  
✅ **Prisma client generated** — TypeScript types ready  
✅ **Database verified** — Schema matches your models  
✅ **Ready to develop** — Start building features!

**Your app is now ready to use!** 🎉
