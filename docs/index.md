# GitHub Streak Card - Self-Hosted on Cloudflare Workers

A reliable, self-hosted GitHub streak card served as an SVG from Cloudflare Workers. Designed to never break visually, even when GitHub's API is unavailable.

![GitHub Streak Card Example](https://codekunoichi-streak-card.codekunoichi-github-streak.workers.dev/streak.svg)

## Why This Project?

- **100% Self-Hosted**: You control your data and uptime
- **Reliable**: KV-based fallback ensures your README never shows a broken image
- **Fast**: Aggressive edge caching with Cloudflare's global network
- **Simple**: Only 2 things to configure - your GitHub username and token
- **Secure**: Username is environment-variable only; can't be hijacked for other users
- **Free**: Runs on Cloudflare's generous free tier

## Live Example

Check out the live streak card for [@codekunoichi](https://github.com/codekunoichi):

**Production URL**: [https://codekunoichi-streak-card.codekunoichi-github-streak.workers.dev/streak.svg](https://codekunoichi-streak-card.codekunoichi-github-streak.workers.dev/streak.svg)

## Features

### Current Streak
Displays your current consecutive days of GitHub contributions ending today (UTC).

### Longest Streak
Shows your longest consecutive contribution streak in your GitHub history.

### Total Contributions
Shows total contributions since your first GitHub contribution.

### Reliability
- **Last-Known-Good Fallback**: Uses Cloudflare KV to cache successful SVG responses
- **Graceful Degradation**: Serves cached data if GitHub API is down
- **Never Breaks**: Always returns valid SVG, even on first-run failures

### Performance
- **Edge Caching**: 6-hour edge cache with 24-hour stale-while-revalidate
- **Global CDN**: Served from Cloudflare's worldwide network
- **Low Latency**: Sub-100ms response times globally

## Quick Start

Ready to create your own? You only need to change **2 things**:

1. **Your GitHub username** (in `wrangler.toml`)
2. **Your GitHub Personal Access Token** (as a Cloudflare secret)

That's it! The rest works out of the box.

## Documentation

### [Setup Guide](setup.md)
Complete walkthrough for setting up:
- Cloudflare account and Workers
- GitHub Personal Access Token with correct permissions
- KV namespace configuration
- Environment variables

### [Deployment Guide](deployment.md)
Step-by-step deployment instructions for:
- Local development with `npm run dev`
- Testing locally before production
- Production deployment to Cloudflare Workers
- Verifying your deployment

## Fork This Project

1. Fork this repository on GitHub
2. Follow the [Setup Guide](setup.md) to configure your Cloudflare account
3. Follow the [Deployment Guide](deployment.md) to deploy your worker
4. Add the SVG to your GitHub README

## Repository

**GitHub**: [https://github.com/codekunoichi/codekunoichi-streak-card](https://github.com/codekunoichi/codekunoichi-streak-card)

## How It Works

### Architecture

```
GitHub README
    ↓ (requests SVG)
Cloudflare Edge
    ↓ (cache miss)
Cloudflare Worker
    ↓ (fetch data)
GitHub GraphQL API
    ↓ (contribution data)
Worker (calculate streaks)
    ↓ (generate SVG)
Cloudflare KV (cache)
    ↓ (return SVG)
User sees streak card
```

### Data Flow

1. Request arrives at `/streak.svg`
2. Worker fetches contribution data from GitHub GraphQL API (all data since 2010)
3. Calculates current and longest streaks using UTC timezone
4. Generates SVG with your stats
5. Saves successful SVG to KV as `last_good_svg`
6. Returns SVG with aggressive cache headers

### Fallback Behavior

If GitHub API fails:
1. Worker retrieves `last_good_svg` from KV
2. Returns cached SVG (always HTTP 200)
3. If KV is empty, returns minimal "temporarily unavailable" SVG

**Your README image never breaks.**

## Streak Calculation

### Current Streak
- Counts consecutive days ending **today (UTC)** where contributions > 0
- If today has 0 contributions, current streak is 0

### Longest Streak
- Maximum consecutive run of days with contributions > 0
- Searches entire GitHub history since 2010

### Important Notes
- All dates use **UTC timezone**
- A day counts if `contributionCount > 0`
- Private contributions won't show unless your profile is public

## Security

The worker **ignores all query parameters** that attempt to change identity. The username is only read from `GITHUB_USERNAME` environment variable, preventing abuse.

## License

MIT License - Feel free to fork, modify, and use for your own projects!

## Support

- **Issues**: [GitHub Issues](https://github.com/codekunoichi/codekunoichi-streak-card/issues)
- **Documentation**: You're reading it!
- **Live Example**: [See it in action](https://github.com/codekunoichi)

---

Ready to get started? Head to the [Setup Guide](setup.md) to begin!
