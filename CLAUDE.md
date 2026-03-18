# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **self-hosted GitHub streak card** served as an SVG from a Cloudflare Worker. The card displays GitHub contribution streaks for a single user (`codekunoichi`) and is designed to be embedded in GitHub READMEs with guaranteed uptime.

**Critical Design Principle**: Stability over freshness. The SVG must never break visually, even if GitHub's API is down.

## Architecture

### Core Components

1. **Cloudflare Worker** (`src/index.ts`)
   - Main entry point handling HTTP requests
   - Routes: `/streak.svg` (SVG endpoint) and `/health` (health check)
   - No UI, no frontend, no multi-user support

2. **GitHub GraphQL Integration**
   - Fetches contribution data from `https://api.github.com/graphql`
   - Queries `contributionsCollection` for daily contribution counts
   - Requires at least 370 days of data for streak calculations

3. **Last-Known-Good Fallback (KV)**
   - Uses Cloudflare KV namespace bound as `STREAK_KV`
   - Stores successful SVG as `last_good_svg` key
   - Serves stale data if GitHub API fails
   - Returns minimal fallback SVG if no cached data exists

### Reliability Flow

```
Request → Fetch GitHub Data → Generate SVG → Save to KV → Return SVG
                ↓ (on failure)
          Retrieve from KV → Return cached SVG
                ↓ (if empty)
          Return minimal fallback SVG
```

### Identity & Security

- Username is **environment-variable only**: `GITHUB_USERNAME` (default: `codekunoichi`)
- Query parameters attempting to change identity are **ignored**
- This prevents the endpoint from being used to generate streaks for other users

## Development Commands

### Local Development
```bash
wrangler dev
```

### Deployment
```bash
wrangler deploy
```

### Environment Variables Setup
Set these in Wrangler or Cloudflare dashboard:
- `GITHUB_USERNAME` — Target GitHub username
- `GITHUB_TOKEN` — GitHub Personal Access Token (read-only permissions)

## Streak Calculation Rules

### Current Streak
- Count consecutive days ending **today or yesterday (UTC)** where `contributionCount > 0`
- If today (UTC) has 0 contributions, skip it and check from yesterday — the UTC day may have started before the user's local day ended
- If both today and yesterday have 0 contributions, current streak is 0

### Longest Streak
- Maximum consecutive run of days with `contributionCount > 0` within the fetched range

### Weekly Streak
- Counts consecutive **completed Sun–Sat weeks** where `contributionCount > 0` on at least **4 days**
- The current (incomplete) week is **never counted** toward the streak — only fully elapsed weeks qualify
- `currentWeekContributions` tracks days contributed so far in the current week (Sun–today) for display only
- Walking backwards from the last completed week; stops at the first week with fewer than 4 active days

### Important Details
- All dates must be in **UTC**
- Days are sorted by date
- Missing days are treated as 0 contributions
- A day counts if `contributionCount > 0`

## SVG Specifications

- Size: **1000 × 220 pixels**
- Light theme (white/slate gradient, GitHub-friendly)
- Rounded corners
- System fonts only
- No animations or flashing effects

Layout (4 equal columns, ~230px each):
- **Column 0** — Total Contributions: large number + "Total Contributions" label + date range
- **Column 1** — Current Streak: orange progress ring, streak count, "Current Streak" label, date range
- **Column 2** — Weekly Streak: purple progress ring, weekly streak count, "Weekly Streak" label, "X/4 this week" sub-label; small calendar icon above ring; ring fills based on current week's progress toward 4-day goal
- **Column 3** — Longest Streak: large number + "Longest Streak" label + date range

## HTTP Caching

SVG endpoint uses:
```
Cache-Control: public, max-age=0, s-maxage=21600, stale-while-revalidate=86400
```

This allows:
- 6-hour edge cache (`s-maxage=21600`)
- 24-hour stale-while-revalidate for extra reliability
- Manual cache busting via `?v=timestamp` query param (ignored by worker)

## Critical Constraints

1. **Never return non-SVG** from `/streak.svg`
2. **Never return 5xx** to GitHub image requests
3. **Prefer stale data over failure**
4. Use TypeScript only
5. Avoid Node.js APIs (`fs`, `path`, etc.) — this runs in Workers runtime
6. Use native `fetch` API
7. Keep dependencies minimal

## Error Handling Strategy

The worker must handle these failure modes gracefully:
- GitHub API timeout/failure → serve cached SVG
- GraphQL query errors → serve cached SVG
- Streak computation errors → serve cached SVG
- Empty KV (first run) → serve minimal fallback SVG
- All errors must return HTTP 200 with valid SVG content

## Testing Considerations

When testing:
- Verify behavior with GitHub API unavailable (use KV fallback)
- Test with empty KV namespace (first run scenario)
- Verify cache headers are set correctly
- Confirm identity parameters in query string are ignored
- Test streak calculation edge cases (0 contributions today, gaps in data)
- Validate SVG renders correctly in GitHub README context
- Test weekly streak edge cases: week with exactly 4 active days (should count), 3 active days (should not), gap weeks breaking the streak, current week not influencing the streak count
