# GitHub Streak Card (Self-Hosted)

[![GitHub Release](https://img.shields.io/github/v/release/codekunoichi/codekunoichi-streak-card)](https://github.com/codekunoichi/codekunoichi-streak-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A reliable, self-hosted GitHub streak card served as an SVG from Cloudflare Workers. Designed to never break visually, even when GitHub's API is unavailable.

![GitHub Streak](https://codekunoichi-streak-card.codekunoichi-github-streak.workers.dev/streak.svg?v=2)

**Live Example**: [@codekunoichi's streak card](https://github.com/codekunoichi)

## 💡 Origin Story

Originally on my README, I had used publicly available git streak services, and far too often they broke over and over again! It was frustrating—the streak was gentle motivation, and having come along 100 days plus, I wanted to keep going. So as the saying goes, necessity is the mother of invention. And with Claude Code's help, we put together a simple git streak card to never go down again!

## ✨ Features

- **100% Reliable**: KV-based fallback ensures your README never shows a broken image
- **Blazing Fast**: Aggressive edge caching on Cloudflare's global network
- **Secure**: Username is environment-variable only; can't be hijacked for other users
- **Dead Simple**: Only 2 things to configure - your username and GitHub token
- **Free Forever**: Runs on Cloudflare's generous free tier

## 🚀 Fork This Project

**Want your own streak card?** It's easy! You only need to change **2 things**:

1. Your GitHub username (in `wrangler.toml`)
2. Your GitHub Personal Access Token (as a Cloudflare secret)

That's it! Everything else works out of the box.

### Quick Start

1. **Fork this repository** → Click the Fork button above
2. **Follow the [Setup Guide](https://codekunoichi.github.io/codekunoichi-streak-card/setup.html)** → 10-minute setup
3. **Deploy** → `npm run deploy`
4. **Add to your README** → Copy your worker URL

## 📖 Full Documentation

For complete step-by-step instructions, visit our **[Documentation Site](https://codekunoichi.github.io/codekunoichi-streak-card/)**:

- **[Setup Guide](https://codekunoichi.github.io/codekunoichi-streak-card/setup.html)** - Cloudflare account, GitHub tokens, KV namespace
- **[Deployment Guide](https://codekunoichi.github.io/codekunoichi-streak-card/deployment.html)** - Local testing and production deployment
- **[Troubleshooting](https://codekunoichi.github.io/codekunoichi-streak-card/deployment.html#troubleshooting)** - Common issues and solutions

## 📋 Quick Reference

### Prerequisites
- Node.js v18+
- Free Cloudflare account
- GitHub Personal Access Token (read:user permission)

### Installation
```bash
# 1. Fork and clone this repo
git clone https://github.com/YOUR-USERNAME/codekunoichi-streak-card.git
cd codekunoichi-streak-card

# 2. Install dependencies
npm install

# 3. Create KV namespace
npx wrangler kv:namespace create "STREAK_KV"

# 4. Update wrangler.toml with your username and KV namespace ID

# 5. Set your GitHub token
npx wrangler secret put GITHUB_TOKEN

# 6. Deploy
npm run deploy
```

### Local Development
```bash
# Create .dev.vars file with your GitHub token
echo "GITHUB_TOKEN=your_token_here" > .dev.vars

# Start local server
npm run dev

# Visit http://localhost:8787/streak.svg
```

### Usage in README
```markdown
![GitHub Streak](https://your-worker-name.workers.dev/streak.svg)
```

**For detailed instructions**, see the [Full Documentation](https://codekunoichi.github.io/codekunoichi-streak-card/)

## How It Works

### Data Flow

1. Request arrives at `/streak.svg`
2. Worker fetches last 370 days of contribution data from GitHub GraphQL API
3. Calculates current and longest streaks
4. Generates SVG and saves to KV as `last_good_svg`
5. Returns SVG with cache headers

### Fallback Behavior

If GitHub API fails or errors occur:
1. Worker retrieves `last_good_svg` from KV
2. If found, returns cached SVG (always returns HTTP 200)
3. If KV is empty (first run), returns minimal fallback SVG

This ensures the README image **never breaks**.

### Caching Strategy

```
Cache-Control: public, max-age=0, s-maxage=21600, stale-while-revalidate=86400
```

- **Edge cache**: 6 hours
- **Stale-while-revalidate**: 24 hours
- Reduces GitHub API pressure while maintaining freshness

## Streak Calculation

### Current Streak
Counts consecutive days ending **today (UTC)** where contributions > 0.
If today has 0 contributions, current streak is 0.

### Longest Streak
Maximum consecutive run of days with contributions > 0 in the fetched range.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_USERNAME` | GitHub username to track | No (defaults to `codekunoichi`) |
| `GITHUB_TOKEN` | GitHub Personal Access Token | Yes |

## Security

The worker **ignores all query parameters** that attempt to change the username. The username is only read from the `GITHUB_USERNAME` environment variable, preventing the endpoint from being used to generate streaks for arbitrary users.

## Troubleshooting

### "Streak temporarily unavailable" appears

This happens when:
1. GitHub API is down AND
2. No cached SVG exists in KV (first run failure)

**Fix**: Wait for GitHub API to recover, then the next request will succeed and cache the SVG.

### Streak count seems wrong

- Ensure your GitHub contributions are public
- Check that `GITHUB_TOKEN` has `read:user` permission
- Verify the timezone is UTC (streak resets at midnight UTC)

### Worker returns 500 errors

Check:
- KV namespace is correctly bound in `wrangler.toml`
- `GITHUB_TOKEN` secret is set
- GitHub token hasn't expired

## License

MIT
