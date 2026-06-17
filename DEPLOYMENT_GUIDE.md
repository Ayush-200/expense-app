# Deployment Guide

## ✅ Issue Fixed

**Error:** `sh: line 1: tsc: command not found`

**Cause:** TypeScript and Prisma were in `devDependencies`, which aren't installed during production builds.

**Solution:** Moved to `dependencies` and added `postinstall` script.

---

## What Changed

### package.json Updates

1. **Moved to dependencies:**
   - `typescript` - needed for build
   - `prisma` - needed to generate client

2. **Updated build script:**
   ```json
   "build": "prisma generate && tsc"
   ```

3. **Added postinstall:**
   ```json
   "postinstall": "prisma generate"
   ```

4. **Added engines:**
   ```json
   "engines": {
     "node": ">=18.0.0"
   }
   ```

---

## Deployment Checklist

### Environment Variables Required

```env
# Server
PORT=5000
NODE_ENV=production

# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
DIRECT_DATABASE_URL="postgresql://user:pass@direct-host/db?sslmode=require"

# JWT
JWT_SECRET="your-production-secret-min-32-chars"
JWT_EXPIRES_IN="7d"

# CORS
FRONTEND_URL="https://your-frontend-domain.com"
```

### Pre-Deployment Steps

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma client (runs automatically via postinstall)
npm run prisma:generate

# 3. Run migrations
npx prisma migrate deploy

# 4. Build TypeScript
npm run build

# 5. Start server
npm start
```

---

## Platform-Specific Instructions

### Vercel Deployment

**vercel.json:**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/server.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "src/server.ts"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

**Build Settings:**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

### Railway Deployment

**railway.json:**
```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Environment Variables:**
- Add all from `.env` in Railway dashboard

### Render Deployment

**Build Command:**
```bash
npm install && npm run build && npx prisma migrate deploy
```

**Start Command:**
```bash
npm start
```

### Heroku Deployment

**Procfile:**
```
web: npm start
release: npx prisma migrate deploy
```

**heroku.yml:**
```yaml
build:
  languages:
    - nodejs
run:
  web: npm start
```

---

## Common Deployment Issues

### Issue 1: "tsc: command not found"
**Solution:** Ensure `typescript` is in `dependencies` (✅ Fixed)

### Issue 2: "prisma: command not found"
**Solution:** Ensure `prisma` is in `dependencies` (✅ Fixed)

### Issue 3: "Cannot find module '@prisma/client'"
**Solution:**
```bash
npm run prisma:generate
# or
npx prisma generate
```

### Issue 4: "Table does not exist"
**Solution:**
```bash
npx prisma migrate deploy
```

### Issue 5: Build succeeds but runtime fails
**Check:**
- Environment variables are set
- DATABASE_URL is accessible from deployment
- Migrations have been applied
- NODE_ENV is set correctly

### Issue 6: Neon connection timeout
**Solution:**
- Use pooled connection URL (`-pooler`)
- Set `connection_limit=1` in DATABASE_URL
- Verify Neon project is active

---

## Build Process

### What Happens During Build

1. **npm install**
   - Installs all dependencies
   - Runs `postinstall` → `prisma generate`

2. **npm run build**
   - Generates Prisma client
   - Compiles TypeScript to JavaScript
   - Output goes to `dist/` folder

3. **npm start**
   - Runs `node dist/server.js`
   - Server starts on PORT from env

### File Structure After Build

```
backend/
├── dist/                      ← Compiled JavaScript
│   ├── server.js
│   ├── controllers/
│   ├── routes/
│   └── ...
├── node_modules/
│   └── .prisma/
│       └── client/           ← Generated Prisma client
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── package.json
```

---

## Health Check Endpoint

Test your deployment:

```bash
curl https://your-api.com/api/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Database Migrations

### Development
```bash
npx prisma migrate dev --name migration_name
```

### Production
```bash
npx prisma migrate deploy
```

### Check Status
```bash
npx prisma migrate status
```

---

## Monitoring

### Essential Checks

1. **Server is running**
   ```bash
   curl https://your-api.com/api/health
   ```

2. **Database connected**
   ```bash
   # Check logs for Prisma connection
   ```

3. **Migrations applied**
   ```bash
   npx prisma migrate status
   ```

4. **Environment variables set**
   ```bash
   # Check deployment dashboard
   ```

---

## Rollback Strategy

### If Deployment Fails

1. **Check logs:**
   ```bash
   # Platform-specific log command
   heroku logs --tail
   railway logs
   vercel logs
   ```

2. **Rollback migration:**
   ```bash
   # If new migration caused issues
   npx prisma migrate resolve --rolled-back migration_name
   ```

3. **Redeploy previous version:**
   ```bash
   # Platform-specific rollback
   git revert HEAD
   git push
   ```

---

## Performance Optimization

### Production Settings

**Enable Prisma connection pooling:**
```env
DATABASE_URL="postgresql://...?connection_limit=10&pool_timeout=20"
```

**Set appropriate timeouts:**
```typescript
// In server.ts
const server = app.listen(PORT, () => {
  server.timeout = 30000; // 30 seconds
});
```

**Enable compression:**
```bash
npm install compression
```

```typescript
import compression from 'compression';
app.use(compression());
```

---

## Security Checklist

- [ ] JWT_SECRET is strong (min 32 chars)
- [ ] CORS is configured with actual frontend URL
- [ ] Environment variables are not in code
- [ ] Database credentials are secure
- [ ] HTTPS is enabled
- [ ] Rate limiting is configured (optional)
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (Prisma handles this)

---

## Quick Deploy Commands

### One-line deploy (after fixing package.json):

```bash
# Push to production
git add .
git commit -m "Fix: Move typescript and prisma to dependencies"
git push origin main

# Platform auto-deploys from git push
```

---

## Troubleshooting Logs

### What to check in logs:

1. **Build phase:**
   ```
   ✓ npm install completed
   ✓ prisma generate completed
   ✓ tsc compilation completed
   ```

2. **Start phase:**
   ```
   🚀 Server running on http://localhost:5000
   📚 Environment: production
   ```

3. **Runtime:**
   ```
   [No errors should appear]
   ```

### Common Error Patterns:

```bash
# Bad
"tsc: command not found"
→ typescript not in dependencies

# Bad
"Cannot find module '@prisma/client'"
→ prisma generate didn't run

# Bad
"The table 'public.users' does not exist"
→ migrations not applied

# Good
"Server running on port 5000"
→ Everything works!
```

---

## Summary

✅ **Fixed:** Moved `typescript` and `prisma` to dependencies  
✅ **Added:** `postinstall` script for automatic Prisma generation  
✅ **Updated:** Build command to include Prisma generation  
✅ **Added:** Node version requirement in `engines`  

**Your deployment should now work!** 🚀

Push the updated `package.json` and redeploy.
