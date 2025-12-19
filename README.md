# GitHub Streak Card (Self-Hosted)

A reliable, self-hosted GitHub streak card served as an SVG from Cloudflare Workers. Designed to never break visually, even when GitHub's API is unavailable.

![GitHub Streak](https://your-worker-domain.workers.dev/streak.svg)

## Features

- **Reliable**: Uses KV-based fallback to serve last-known-good SVG when GitHub API fails
- **Secure**: Username is environment-variable only; cannot be used for other users
- **Fast**: Aggressive edge caching with stale-while-revalidate
- **Simple**: No database, no UI, no scheduled jobs

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- GitHub Personal Access Token with `read:user` permission

### Installation

1. Clone this repository:
   ```bash
   git clone <your-repo-url>
   cd codekunoichi-streak-card
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a KV namespace:
   ```bash
   wrangler kv:namespace create "STREAK_KV"
   ```

   This will output a namespace ID. Copy it.

4. Update `wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "STREAK_KV"
   id = "YOUR_KV_NAMESPACE_ID_HERE"  # Replace with the ID from step 3
   ```

5. Set your GitHub username in `wrangler.toml` (optional, defaults to `codekunoichi`):
   ```toml
   [vars]
   GITHUB_USERNAME = "your-username"
   ```

6. Add your GitHub token as a secret:
   ```bash
   wrangler secret put GITHUB_TOKEN
   ```

   When prompted, paste your GitHub Personal Access Token.

## Development

Run the worker locally:

```bash
npm run dev
```

Then visit:
- http://localhost:8787/streak.svg
- http://localhost:8787/health

## Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

After deployment, you'll receive a URL like:
```
https://codekunoichi-streak-card.<your-subdomain>.workers.dev
```

## Usage

Embed the SVG in your GitHub README:

```markdown
![GitHub Streak](https://your-worker-domain.workers.dev/streak.svg)
```

### Cache Busting

The worker ignores query parameters, so you can manually bust GitHub's image cache:

```markdown
![GitHub Streak](https://your-worker-domain.workers.dev/streak.svg?v=1)
```

Increment the version number to force GitHub to re-fetch the image.

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
