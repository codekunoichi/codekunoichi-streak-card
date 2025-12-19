# Setup Guide

This guide walks you through setting up your own GitHub Streak Card on Cloudflare Workers.

## Prerequisites

Before you begin, make sure you have:

- **Node.js** (v18 or later) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** installed on your machine
- A **GitHub account**
- A **Cloudflare account** (free tier works perfectly)

## Table of Contents

1. [Fork the Repository](#1-fork-the-repository)
2. [Create GitHub Personal Access Token](#2-create-github-personal-access-token)
3. [Set Up Cloudflare Account](#3-set-up-cloudflare-account)
4. [Install Dependencies](#4-install-dependencies)
5. [Create KV Namespace](#5-create-kv-namespace)
6. [Configure Your Project](#6-configure-your-project)
7. [Set Up Secrets](#7-set-up-secrets)

---

## 1. Fork the Repository

1. Go to [https://github.com/codekunoichi/codekunoichi-streak-card](https://github.com/codekunoichi/codekunoichi-streak-card)
2. Click the **Fork** button in the top-right corner
3. Clone your forked repository:

```bash
git clone https://github.com/YOUR-USERNAME/codekunoichi-streak-card.git
cd codekunoichi-streak-card
```

Replace `YOUR-USERNAME` with your GitHub username.

---

## 2. Create GitHub Personal Access Token

Your worker needs a GitHub token to fetch your contribution data.

### Step-by-Step Instructions

1. **Go to GitHub Settings**
   - Visit [https://github.com/settings/tokens](https://github.com/settings/tokens)
   - Or: Click your profile → Settings → Developer settings → Personal access tokens → Tokens (classic)

2. **Generate New Token**
   - Click **Generate new token** → **Generate new token (classic)**

3. **Configure Token**
   - **Note**: `GitHub Streak Card Worker` (or any name you prefer)
   - **Expiration**: Choose expiration (recommend: No expiration, or 1 year)

4. **Select Permissions**

   You only need **ONE permission**:

   - ✅ **`read:user`** - Read all user profile data

   **Do NOT select any other permissions.** This token only needs to read public contribution data.

5. **Generate and Copy Token**
   - Click **Generate token** at the bottom
   - **IMPORTANT**: Copy the token immediately (starts with `ghp_` or `github_pat_`)
   - Save it somewhere safe - you won't be able to see it again!

### Token Format

Your token will look like:
```
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

or

```
github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Keep this token secure!** You'll use it in Step 7.

---

## 3. Set Up Cloudflare Account

### Create Cloudflare Account

1. Go to [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. Sign up with your email (it's free!)
3. Verify your email address

### Get Cloudflare API Token (for deployment)

You'll need this to deploy from your local machine.

1. **Go to API Tokens**
   - Visit [https://dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Or: Click your profile → My Profile → API Tokens

2. **Create Token**
   - Click **Create Token**
   - Find **Edit Cloudflare Workers** template
   - Click **Use template**

3. **Configure Token**
   - **Token name**: `Wrangler Deploy` (or any name)
   - **Permissions**: Should already be set to:
     - Account → Workers Scripts → Edit
     - Account → Workers KV Storage → Edit
   - **Account Resources**: Include → Your account
   - **TTL**: Start Date: Now, End Date: (optional)

4. **Create and Copy Token**
   - Click **Continue to summary**
   - Click **Create Token**
   - **Copy the token** - starts with something like `ypBpd594...`
   - Save it securely!

### Authenticate Wrangler (Later Step)

You'll use this token when you first run Wrangler commands. We'll do this in the deployment guide.

---

## 4. Install Dependencies

Navigate to your project directory and install npm packages:

```bash
npm install
```

This installs:
- `wrangler` - Cloudflare Workers CLI tool
- `typescript` - TypeScript compiler
- `@cloudflare/workers-types` - Type definitions for Workers

---

## 5. Create KV Namespace

Cloudflare KV (Key-Value) storage is used to cache your streak SVG for reliability.

### Using Wrangler CLI

1. **Login to Cloudflare** (first time only):

```bash
npx wrangler login
```

This will open a browser window to authenticate. Click **Allow**.

2. **Create KV Namespace**:

```bash
npx wrangler kv:namespace create "STREAK_KV"
```

You'll see output like:

```
🌀 Creating namespace with title "codekunoichi-streak-card-STREAK_KV"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "STREAK_KV", id = "abc123xyz456..." }
```

3. **Copy the Namespace ID**

The ID will be something like: `710955b2d5a0416ca03aa0761b403c4b`

**Save this ID** - you'll use it in the next step.

---

## 6. Configure Your Project

Now you'll configure the project with **your** settings.

### Update `wrangler.toml`

Open `wrangler.toml` in your code editor.

#### 6.1 Update Worker Name (Optional)

Change the worker name to something unique:

```toml
name = "your-username-streak-card"  # Change this
main = "src/index.ts"
compatibility_date = "2024-12-19"
```

Example: `name = "johndoe-streak-card"`

#### 6.2 Update KV Namespace ID

Replace the `id` with your namespace ID from Step 5:

```toml
[[kv_namespaces]]
binding = "STREAK_KV"
id = "YOUR_KV_NAMESPACE_ID_HERE"  # Replace this!
preview_id = "YOUR_KV_NAMESPACE_ID_HERE"  # Replace this too!
```

Example:
```toml
[[kv_namespaces]]
binding = "STREAK_KV"
id = "710955b2d5a0416ca03aa0761b403c4b"
preview_id = "710955b2d5a0416ca03aa0761b403c4b"
```

#### 6.3 Update GitHub Username

Change the username to **your** GitHub username:

```toml
[vars]
GITHUB_USERNAME = "your-github-username"  # Change this!
```

Example:
```toml
[vars]
GITHUB_USERNAME = "johndoe"
```

#### Complete Example `wrangler.toml`

```toml
name = "johndoe-streak-card"
main = "src/index.ts"
compatibility_date = "2024-12-19"

# KV namespace binding
[[kv_namespaces]]
binding = "STREAK_KV"
id = "710955b2d5a0416ca03aa0761b403c4b"
preview_id = "710955b2d5a0416ca03aa0761b403c4b"

# Environment variables
[vars]
GITHUB_USERNAME = "johndoe"
```

**Save the file.**

---

## 7. Set Up Secrets

Your GitHub token should **never** be committed to Git. Instead, we store it as a Cloudflare secret.

### Option 1: Using Wrangler CLI (Recommended)

```bash
npx wrangler secret put GITHUB_TOKEN
```

When prompted, paste your GitHub Personal Access Token (from Step 2) and press Enter.

You'll see:
```
🌀 Creating the secret for the Worker "your-streak-card"
✨ Success! Uploaded secret GITHUB_TOKEN
```

### Option 2: Using Cloudflare Dashboard

1. Go to [Cloudflare Workers Dashboard](https://dash.cloudflare.com/)
2. Select your account
3. Go to **Workers & Pages**
4. Find your worker (after first deployment)
5. Go to **Settings** → **Variables**
6. Click **Add variable**
7. Name: `GITHUB_TOKEN`
8. Value: Your GitHub token
9. Check **Encrypt**
10. Click **Save**

---

## Configuration Checklist

Before proceeding to deployment, verify:

- ✅ Forked and cloned the repository
- ✅ Created GitHub Personal Access Token with `read:user` permission
- ✅ Created Cloudflare account
- ✅ Installed dependencies with `npm install`
- ✅ Created KV namespace
- ✅ Updated `wrangler.toml` with:
  - Your worker name
  - Your KV namespace ID (in both `id` and `preview_id`)
  - Your GitHub username
- ✅ Set `GITHUB_TOKEN` secret via Wrangler CLI

---

## Local Development Setup (Optional)

If you want to test locally, create a `.dev.vars` file for local secrets:

```bash
# Create .dev.vars file (NOT committed to Git)
cat > .dev.vars << 'EOF'
# Local development environment variables
GITHUB_TOKEN=your_github_token_here
EOF
```

Replace `your_github_token_here` with your actual token.

**IMPORTANT**: `.dev.vars` is in `.gitignore` and should **never** be committed!

---

## Next Steps

Configuration complete! Now head to the [Deployment Guide](deployment.md) to:
1. Test locally with `npm run dev`
2. Deploy to production
3. Get your live streak card URL

---

## Troubleshooting

### "command not found: npx"

Make sure Node.js is installed:
```bash
node --version
npm --version
```

If not installed, download from [https://nodejs.org/](https://nodejs.org/)

### "Not authenticated" when running Wrangler

Run:
```bash
npx wrangler login
```

### "KV namespace not found"

Make sure you:
1. Created the KV namespace: `npx wrangler kv:namespace create "STREAK_KV"`
2. Copied the ID to `wrangler.toml` in **both** `id` and `preview_id` fields

### GitHub token permissions error

Make sure your token has the `read:user` permission. You can check and regenerate at [https://github.com/settings/tokens](https://github.com/settings/tokens)

---

[← Back to Index](index.md) | [Next: Deployment Guide →](deployment.md)
