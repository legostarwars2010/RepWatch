# RepWatch Deployment Guide

## Prerequisites
- Neon PostgreSQL database (production branch)
- Node.js 18+ runtime environment
- Git repository

## Option 1: Deploy to Render (Recommended - Free Tier Available)

### Step 1: Prepare Your Repository
```bash
git add .
git commit -m "Ready for deployment"
git push origin development
```

### Step 2: Sign Up for Render
1. Go to https://render.com
2. Sign up with GitHub
3. Authorize Render to access your repository

### Step 3: Create Web Service
1. Click "New +" → "Web Service"
2. Connect your `RepWatch` repository
3. Configure:
   - **Name**: `repwatch`
   - **Branch**: `development`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free

### Step 4: Add Environment Variables
In Render dashboard, add these environment variables:
```
DATABASE_URL=<your-neon-production-connection-string>
NODE_ENV=production
PORT=8080
OPENAI_API_KEY=<your-openai-key>
```

### Step 5: Deploy
- Click "Create Web Service"
- Wait 3-5 minutes for build to complete
- Your site will be live at: `https://repwatch.onrender.com`

---

## Option 2: Deploy to Railway

### Step 1: Sign Up for Railway
1. Go to https://railway.app
2. Sign up with GitHub

### Step 2: Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your `RepWatch` repository

### Step 3: Configure
Railway auto-detects Node.js. Add environment variables:
```
DATABASE_URL=<your-neon-production-connection-string>
NODE_ENV=production
OPENAI_API_KEY=<your-openai-key>
```

### Step 4: Deploy
- Railway automatically deploys
- Your site will be live at: `https://repwatch.up.railway.app`

---

## Option 3: Deploy to Fly.io

### Step 1: Install Fly CLI
```bash
# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
```

### Step 2: Login & Launch
```bash
fly auth login
cd c:\Users\alida\Desktop\RepWatch\RepWatch
fly launch
```

### Step 3: Configure fly.toml
The wizard creates `fly.toml`. Ensure it has:
```toml
app = "repwatch"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[[services]]
  http_checks = []
  internal_port = 8080
  processes = ["app"]
  protocol = "tcp"
  script_checks = []

  [[services.ports]]
    force_https = true
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

### Step 4: Set Secrets
```bash
fly secrets set DATABASE_URL=<your-neon-production-string>
fly secrets set OPENAI_API_KEY=<your-openai-key>
```

### Step 5: Deploy
```bash
fly deploy
```

Your site will be live at: `https://repwatch.fly.dev`

---

## Option 4: Deploy to Vercel

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

### Step 2: Login & Deploy
```bash
cd c:\Users\alida\Desktop\RepWatch\RepWatch
vercel login
vercel
```

### Step 3: Configure
Follow prompts:
- Project name: `repwatch`
- Build command: (leave empty)
- Output directory: (leave empty)

### Step 4: Add Environment Variables
```bash
vercel env add DATABASE_URL
vercel env add OPENAI_API_KEY
vercel env add NODE_ENV
```

### Step 5: Deploy to Production
```bash
vercel --prod
```

---

## Pre-Deployment Checklist

### 1. Migrate Database to Production
```bash
node scripts/migrate_dev_to_prod.js
```

### 2. Verify Production Data
```bash
node scripts/check_prod_status.js
```

### 3. Test Environment Variables
Create `.env.production`:
```
DATABASE_URL=postgresql://...@ep-tiny-glitter-afbb771g-pooler.c-2.us-west-2.aws.neon.tech/neondb
NODE_ENV=production
OPENAI_API_KEY=sk-...
PORT=8080
```

### 4. Test Locally with Production DB
```bash
set NODE_ENV=production
node server.js
```

### 5. Create package.json Scripts (if needed)
Ensure your `package.json` has:
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## Post-Deployment

### Update Neon Connection Pooling
For production traffic, use pooled connection:
```
DATABASE_URL=postgresql://...@ep-tiny-glitter-afbb771g-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require
```

### Monitor Performance
- Check Neon dashboard for query performance
- Monitor OpenAI API usage at platform.openai.com
- Watch hosting platform logs

### Custom Domain (Optional)
Most platforms support custom domains:
1. Add your domain in hosting dashboard
2. Add CNAME record: `repwatch.yourdomain.com` → `<platform-url>`
3. Enable SSL (automatic on most platforms)

---

## Troubleshooting

### Database Connection Fails
- Verify `DATABASE_URL` is correct production string
- Check Neon allows connections from hosting IP
- Ensure `?sslmode=require` is in connection string

### OpenAI Rate Limits
- Check usage at platform.openai.com
- Consider caching all AI summaries before launch
- Set up rate limiting in production

### Memory Issues
- Increase instance size on hosting platform
- Check for memory leaks in logs
- Consider enabling swap on smaller instances

---

## Recommended: Render Free Tier
**Best for this project because:**
- ✅ Free tier includes 512MB RAM (enough for Node.js)
- ✅ Auto-deploys from Git
- ✅ Built-in SSL
- ✅ Easy environment variable management
- ✅ PostgreSQL connection works out-of-box
- ⚠️ Spins down after 15 min inactivity (30s cold start)

**Quick Start:**
1. Push to GitHub
2. Sign up at render.com
3. New Web Service → Connect repo
4. Add `DATABASE_URL` environment variable
5. Deploy ✨
