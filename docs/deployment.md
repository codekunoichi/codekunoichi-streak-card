# Deployment Guide

This guide covers local development testing and production deployment to Cloudflare Workers.

## Prerequisites

Make sure you've completed the [Setup Guide](setup.md) first!

You should have:
- ✅ Installed dependencies (`npm install`)
- ✅ Configured `wrangler.toml` with your settings
- ✅ Created KV namespace
- ✅ Set up GitHub token secret

---

## Table of Contents

1. [Local Development](#local-development)
2. [Testing Locally](#testing-locally)
3. [Production Deployment](#production-deployment)
4. [Verify Deployment](#verify-deployment)
5. [Using Your Streak Card](#using-your-streak-card)
6. [Troubleshooting](#troubleshooting)

---

## Local Development

Test your streak card locally before deploying to production.

### Step 1: Create Local Environment File

Create a `.dev.vars` file for local development (this file is already in `.gitignore`):

```bash
cat > .dev.vars << 'EOF'
# Local development environment variables
# Replace with your actual GitHub token
GITHUB_TOKEN=your_github_token_here
EOF
```

**Replace `your_github_token_here`** with your actual GitHub Personal Access Token from the setup guide.

Example `.dev.vars`:
```
GITHUB_TOKEN=github_pat_YOURTOKENID
```

### Step 2: Start Local Development Server

Run the development server:

```bash
npm run dev
```

You should see output like:

```
⛅️ wrangler 3.114.15
-----------------------------------------------
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
⎔ Listening on http://localhost:8787
```

The worker is now running locally on `http://localhost:8787`!

**Leave this terminal running** while you test.

---

## Testing Locally

Now test your endpoints locally before deploying to production.

### Test 1: Health Check Endpoint

Open a **new terminal** (keep `npm run dev` running in the first one) and test:

```bash
curl http://localhost:8787/health
```

Expected output:
```json
{"ok":true}
```

✅ If you see this, the worker is running correctly!

### Test 2: Streak SVG Endpoint

Test the SVG generation:

```bash
curl http://localhost:8787/streak.svg
```

You should see SVG XML output like:

```xml
<svg width="800" height="220" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      ...
    </linearGradient>
  </defs>
  ...
  <text>124</text>
  ...
</svg>
```

### Test 3: View SVG in Browser

Open your browser and go to:

```
http://localhost:8787/streak.svg
```

You should see your streak card rendered! 🎉

**Check that it shows:**
- ✅ Your total contributions
- ✅ Your current streak
- ✅ Your longest streak
- ✅ Correct date ranges

### Test 4: Save SVG to File

Save the SVG to inspect it:

```bash
curl http://localhost:8787/streak.svg -o local-streak.svg
```

Open `local-streak.svg` in your browser or editor to verify it looks correct.

### Test 5: Check Logs

Look at your terminal where `npm run dev` is running. You should see logs like:

```
[wrangler:inf] GET /streak.svg 200 OK (524ms)
```

If you see errors, check the troubleshooting section below.

### Stop Local Server

When you're done testing locally, press **Ctrl+C** in the terminal running `npm run dev`.

---

## Production Deployment

Once local testing passes, deploy to Cloudflare Workers production.

### Step 1: Authenticate Wrangler (First Time Only)

If you haven't already, authenticate Wrangler:

```bash
npx wrangler login
```

This opens a browser window. Click **Allow** to authorize Wrangler.

### Step 2: Set Production Secret

Set your GitHub token as a production secret:

```bash
npx wrangler secret put GITHUB_TOKEN
```

When prompted, paste your GitHub Personal Access Token and press Enter.

Expected output:
```
🌀 Creating the secret for the Worker "your-streak-card"
✨ Success! Uploaded secret GITHUB_TOKEN
```

**Note**: This is separate from the `.dev.vars` file. Production secrets are stored securely in Cloudflare.

### Step 3: Deploy to Production

Deploy your worker:

```bash
npm run deploy
```

Or directly with Wrangler:

```bash
npx wrangler deploy
```

You'll see output like:

```
⛅️ wrangler 3.114.15
-----------------------------------------------

Total Upload: 12.02 KiB / gzip: 3.40 KiB
Your worker has access to the following bindings:
- KV Namespaces:
  - STREAK_KV: 710955b2dYYY3aa0761bXXXb
- Vars:
  - GITHUB_USERNAME: "your-username"
Uploaded your-streak-card (4.46 sec)
Deployed your-streak-card triggers (0.34 sec)
  https://your-streak-card.your-subdomain.workers.dev
Current Version ID: 872ee407-12f8-480d-9019-10b7e914e565
```

🎉 **Deployment successful!**

Copy your production URL from the output. It will look like:

```
https://your-streak-card.your-subdomain.workers.dev
```

---

## Verify Deployment

Test your production deployment to make sure everything works.

### Test 1: Health Check

```bash
curl https://your-streak-card.your-subdomain.workers.dev/health
```

Expected:
```json
{"ok":true}
```

### Test 2: Streak SVG

```bash
curl https://your-streak-card.your-subdomain.workers.dev/streak.svg
```

Should return SVG XML.

### Test 3: View in Browser

Open in your browser:

```
https://your-streak-card.your-subdomain.workers.dev/streak.svg
```

You should see your streak card! 🔥

### Test 4: Check HTTP Headers

Verify caching headers are set correctly:

```bash
curl -I https://your-streak-card.your-subdomain.workers.dev/streak.svg
```

Look for:
```
HTTP/2 200
Content-Type: image/svg+xml
Cache-Control: public, max-age=0, s-maxage=21600, stale-while-revalidate=86400
```

✅ All tests passing? Your worker is live!

---

## Using Your Streak Card

### Add to Your GitHub Profile README

1. Go to your GitHub profile repository (username/username)
2. Edit your `README.md`
3. Add the SVG:

```markdown
## GitHub Streak

![GitHub Streak](https://your-streak-card.your-subdomain.workers.dev/streak.svg)
```

Replace the URL with **your actual worker URL**.

### Cache Busting (Optional)

GitHub caches images. To force a refresh, add a version parameter:

```markdown
![GitHub Streak](https://your-streak-card.your-subdomain.workers.dev/streak.svg?v=1)
```

Increment `v=1` to `v=2`, `v=3`, etc. to force GitHub to re-fetch.

**Note**: The worker ignores query parameters, so this only affects GitHub's cache.

### Alternative: Use as Image Tag

```markdown
<img src="https://your-streak-card.your-subdomain.workers.dev/streak.svg" alt="GitHub Streak" />
```

---

## Custom Domain (Optional)

Want a custom domain instead of `*.workers.dev`?

### Requirements
- A domain registered with Cloudflare (or transferred to Cloudflare)
- Cloudflare DNS managing your domain

### Steps

1. Go to [Cloudflare Workers Dashboard](https://dash.cloudflare.com/)
2. Click on your worker
3. Go to **Triggers** tab
4. Under **Routes**, click **Add route**
5. Enter your route pattern: `streak.yourdomain.com/*`
6. Select your worker
7. Click **Save**

Now your streak card will be available at:
```
https://streak.yourdomain.com/streak.svg
```

---

## Updating Your Worker

Made changes to the code? Redeploy:

```bash
npm run deploy
```

Changes take effect immediately (within seconds globally).

---

## Monitoring

### View Logs

See real-time logs:

```bash
npx wrangler tail
```

This streams logs from production. Press Ctrl+C to stop.

### Check Analytics

1. Go to [Cloudflare Workers Dashboard](https://dash.cloudflare.com/)
2. Click on your worker
3. View the **Analytics** tab

You'll see:
- Requests per day
- Success rate
- P50/P99 response times
- Errors (if any)

---

## Troubleshooting

### Error: "Invalid KV namespace binding"

**Problem**: KV namespace not properly configured.

**Fix**:
1. Check `wrangler.toml` has the correct KV namespace ID
2. Verify the namespace exists: `npx wrangler kv:namespace list`
3. Make sure both `id` and `preview_id` are set

### Error: "GitHub API request failed"

**Problem**: GitHub token is missing or invalid.

**Fix**:
1. Verify token is set: `npx wrangler secret list`
2. Re-upload token: `npx wrangler secret put GITHUB_TOKEN`
3. Check token permissions at [https://github.com/settings/tokens](https://github.com/settings/tokens)
4. Make sure token has `read:user` permission

### Error: "Not authenticated"

**Problem**: Wrangler not logged in.

**Fix**:
```bash
npx wrangler login
```

### SVG Shows "Streak temporarily unavailable"

**Problem**: First request failed and no cached data exists.

**Fix**:
1. Check GitHub token is set correctly
2. Verify GitHub username in `wrangler.toml`
3. Wait a few minutes and try again
4. Check logs: `npx wrangler tail`

### Worker not updating after deployment

**Problem**: Edge cache holding old version.

**Fix**:
1. Wait 2-3 minutes for global propagation
2. Add cache-busting parameter: `?v=2`
3. Check version ID in deployment output changed

### "Cannot read property 'get' of undefined" (KV error)

**Problem**: KV namespace binding missing in production.

**Fix**:
1. Verify `wrangler.toml` has KV configuration
2. Redeploy: `npm run deploy`
3. Check dashboard bindings are correct

### Local dev works but production fails

**Problem**: Secret not set in production.

**Fix**:
```bash
npx wrangler secret put GITHUB_TOKEN
```

Enter your token when prompted.

### GitHub contributions showing as 0

**Possible causes**:
- GitHub profile contributions are private (check Settings → Profile → Private contributions)
- Wrong username in `wrangler.toml`
- Token doesn't have read:user permission
- GitHub username changed recently

**Fix**:
1. Make contributions public in GitHub settings
2. Double-check username spelling in `wrangler.toml`
3. Regenerate token with correct permissions

---

## Command Reference

### Local Development
```bash
# Start local dev server
npm run dev

# Test health endpoint locally
curl http://localhost:8787/health

# Test SVG endpoint locally
curl http://localhost:8787/streak.svg

# Save SVG locally
curl http://localhost:8787/streak.svg -o test.svg
```

### Production Deployment
```bash
# Login to Cloudflare (first time)
npx wrangler login

# Create KV namespace
npx wrangler kv:namespace create "STREAK_KV"

# Set production secret
npx wrangler secret put GITHUB_TOKEN

# Deploy to production
npm run deploy

# View production logs
npx wrangler tail

# List secrets
npx wrangler secret list

# Delete a secret
npx wrangler secret delete GITHUB_TOKEN
```

### Production Testing
```bash
# Test health endpoint
curl https://your-worker.workers.dev/health

# Test SVG endpoint
curl https://your-worker.workers.dev/streak.svg

# Check HTTP headers
curl -I https://your-worker.workers.dev/streak.svg

# Save production SVG
curl https://your-worker.workers.dev/streak.svg -o production.svg
```

---

## Deployment Checklist

Before going live, verify:

- ✅ Local testing passed (`npm run dev`)
- ✅ Health endpoint returns `{"ok":true}`
- ✅ SVG renders correctly locally
- ✅ Shows correct username and stats
- ✅ Production secret set (`npx wrangler secret put GITHUB_TOKEN`)
- ✅ Deployed successfully (`npm run deploy`)
- ✅ Production health check passes
- ✅ Production SVG renders correctly
- ✅ Added to GitHub README
- ✅ Verified on GitHub profile

---

## Next Steps

Your streak card is live! 🎉

### Share It
- Add to your GitHub profile README
- Link in your portfolio

### Monitor It
- Check Cloudflare analytics regularly
- Set up uptime monitoring (optional)
- Watch for API rate limits

### Customize It
- Modify SVG design in `src/index.ts`
- Adjust caching strategy
- Add custom domain

---

[← Back to Setup Guide](setup.md) | [Back to Index](index.md)
