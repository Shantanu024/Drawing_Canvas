# Vercel Deployment Guide

## 🚀 Deploying to Vercel

### Prerequisites
- Vercel account (free at [vercel.com](https://vercel.com))
- GitHub repository (push your code there first)
- Git installed locally

### ⚠️ Important: WebSocket Limitation on Vercel

**This app uses Socket.io for real-time WebSocket connections**, which has limitations on Vercel:

- ✅ **Works on:** Vercel with Node.js Runtime (experimental WebSocket support)
- ❌ **Better alternatives for real-time apps:** Railway, Render, Heroku, Fly.io

If you experience connection issues on Vercel, consider these platforms instead.

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Add Vercel deployment files"
git push origin main
```

### Step 2: Deploy to Vercel

#### Option A: Using Vercel CLI (Recommended)
```bash
npm install -g vercel
vercel
```

Follow the prompts:
- Link to GitHub repo
- Select project root directory
- Skip creating `vercel.json` (we already have it)

#### Option B: Using Vercel Dashboard
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Click "Deploy"

### Step 3: Environment Variables
Set production variables in Vercel Dashboard:
1. Go to Settings → Environment Variables
2. Add: `NODE_ENV = production`
3. Add: `PORT = 3000` (optional, Vercel handles this)

### Step 4: Verify Deployment
After deployment, Vercel will provide a URL like:
```
https://your-project.vercel.app
```

Visit it in your browser and test:
- ✅ Room creation/joining
- ✅ Drawing canvas
- ✅ Real-time collaboration
- ✅ User presence

### Configuration Files

- **vercel.json** - Deployment configuration and build rules
- **.env.example** - Template for environment variables (commit this)
- **.env.local** - Local overrides (do NOT commit - in .gitignore)
- **.gitignore** - Files to exclude from version control

### Troubleshooting

**Problem:** "Cannot GET /"
- ✅ Fixed in latest version with index.html

**Problem:** Socket.io connection fails on Vercel
- Vercel WebSocket support is experimental
- Try Railway, Render, or Fly.io instead

**Problem:** "Module not found"
- Ensure `npm install` was run locally
- Check that all dependencies are in `package.json`

### Local Testing Before Deploy
```bash
# Install dependencies
npm install

# Run locally
npm start

# Visit http://localhost:3000
```

### Rollback
If something breaks, Vercel keeps previous deployments:
1. Dashboard → Project → Deployments
2. Click on a previous deployment
3. Click "Promote to Production"

---

**Questions?** Check [Vercel Docs](https://vercel.com/docs)
