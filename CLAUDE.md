# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **self-hosted GitHub streak card** served as an SVG from a Cloudflare Worker. The card displays GitHub contribution streaks for a single user (`codekunoichi`) and is designed to be embedded in GitHub READMEs with guaranteed uptime.

**Critical Design Principle**: Stability over freshness. The SVG must never break visually, even if GitHub's API is down.

## Architecture

### Core Components

1. **Cloudflare Worker** (`src/index.ts`)
   - Main entry point handling HTTP requests
   - Routes: `/streak.svg`, `/health`, `/debug`
   - No UI, no frontend, no multi-user support

2. **GitHub GraphQL Integration**
   - Fetches contribution data from `https://api.github.com/graphql`
   - Queries `contributionsCollection` year-by-year from 2010 to present
   - Returns all days including zero-contribution days

3. **Last-Known-Good Fallback (KV)**
   - Uses Cloudflare KV namespace bound as `STREAK_KV`
   - Stores successful SVG as `last_good_svg` key
   - Serves stale data if GitHub API fails
   - Returns minimal fallback SVG if no cached data exists

### Reliability Flow

```
Request → Fetch GitHub Data → Calculate Streaks → Generate SVG → Save to KV → Return SVG
                ↓ (on any exception)
          Retrieve from KV → Return cached SVG
                ↓ (if KV empty)
          Return minimal fallback SVG
```

### Identity & Security

- Username is **environment-variable only**: `GITHUB_USERNAME` (default: `codekunoichi`)
- Query parameters attempting to change identity are **ignored**
- This prevents the endpoint from being used to generate streaks for other users

## Development Commands

```bash
wrangler dev        # local development
wrangler deploy     # deploy to Cloudflare (always git pull first)
npx tsc --noEmit    # type check without building
```

### Environment Variables
Set these in Wrangler or Cloudflare dashboard:
- `GITHUB_USERNAME` — Target GitHub username
- `GITHUB_TOKEN` — GitHub Personal Access Token (read-only, contributions scope)

## Endpoints

| Path | Description |
|---|---|
| `/streak.svg` | Main SVG embed — always returns valid SVG, HTTP 200 |
| `/health` | JSON `{ ok: true, build: "grace-v3" }` — check `build` field to confirm deployed version |
| `/debug` | JSON dump of raw streak computation (graceStart, graceEnd, currentStreak, recentDays) — use to diagnose issues without cache interference |

## Streak Calculation Rules

### Grace Window (Current Streak)

The current streak uses a **grace window** model, not a strict consecutive-day counter.

**Algorithm** (`findGraceStreakStart` in `src/index.ts`):
1. Determine `graceEnd`: today if today has contributions, otherwise yesterday (UTC grace — the day may have started before the user's local day ended)
2. Walk **backward** from `graceEnd` through the sorted-ascending days array
3. Track `consecutiveZeros` — resets to 0 on every contribution day
4. When `consecutiveZeros >= 7`: stop. The grace window started at the last contribution day found (`graceStart`)
5. `currentStreak = calendar days from graceStart to graceEnd (inclusive)`

**Key behaviors:**
- A single missed day does **not** break the streak — it just increments the missed-days count
- Up to 6 consecutive missed days are tolerated — the streak continues
- 7+ consecutive missed days reset the window; a new window starts the next time contributions resume
- The streak number is **calendar days** (not contribution days), so missed days are included in the count

**Why backward walk?** Processing newest→oldest finds the natural start of the *current* window by stopping at the first 7+ zero block going back in time. A forward scan has edge cases when the break before a streak is fewer than 7 days.

### Missed Days Badge

`missedDaysInWindow`: count of zero-contribution days between `graceStart` and `graceEnd` (inclusive). Shown as a red notification badge on the streak ring and in the bottom pill badge.

### Longest Streak

- Strict consecutive days with `contributionCount > 0` — no grace
- Maximum run across all fetched history

### Weekly Streak

- Counts consecutive **completed Sun–Sat weeks** where at least **4 days** had contributions
- The current (incomplete) week is **never counted** toward the streak
- `currentWeekContributions` tracks days contributed in the current week (Sun–today) for display only
- Walks backwards from the last completed week; stops at the first week with fewer than 4 active days

### Important Details
- All dates are in **UTC**
- Days array is sorted ascending (oldest first) by `fetchGitHubContributions`
- Missing days from the API are treated as 0 contributions
- A day counts as active if `contributionCount > 0`

## SVG Specifications

- Size: **1000 × 220 pixels**
- Light theme (white/slate gradient, GitHub-friendly)
- Rounded corners (16px radius)
- System fonts only (`system-ui, -apple-system, sans-serif`)
- No animations or flashing effects

### Layout — 4 equal columns (~230px each)

| Column | Content |
|---|---|
| 0 — Total Contributions | Large number, label, date range (first contribution → present) |
| 1 — Current Streak | Orange ring (fills against 365-day max), grace-window day count, "Current Streak" label, date range (graceStart – graceEnd). Red notification badge (circle, top-right of ring) shows missed-day count — only rendered when misses > 0 |
| 2 — Weekly Streak | Purple ring (fills based on current week progress toward 4-day goal), weekly streak count, "Weekly Streak" label, "X/4 this week" sub-label, calendar icon |
| 3 — Longest Streak | Large number, label, date range |

### Bottom Pill Badge

Centered below columns 1–2 at `y=193`:
- Text: `"X missed · since [graceStart month day]"`
- Green (`#f0fdf4` / `#16a34a`) when 0 missed days
- Orange (`#fff7ed` / `#9a3412`) when 1+ missed days

## HTTP Caching

```
Cache-Control: public, max-age=0, s-maxage=21600, stale-while-revalidate=86400
```

- `max-age=0`: browsers do not cache
- `s-maxage=21600`: Cloudflare edge caches for 6 hours
- `stale-while-revalidate=86400`: serve stale for up to 24 hours while revalidating

Adding `?v=<anything>` to the URL creates a different CDN cache key, forcing a fresh fetch from the worker. The worker itself ignores all query parameters.

## Critical Constraints

1. **Never return non-SVG** from `/streak.svg`
2. **Never return 5xx** — all errors fall back to cached or minimal SVG with HTTP 200
3. **Prefer stale data over failure**
4. TypeScript only — no Node.js APIs (`fs`, `path`, etc.), runs in Workers runtime
5. Use native `fetch` API
6. Keep dependencies minimal

## Error Handling Strategy

| Failure | Response |
|---|---|
| GitHub API timeout/failure | Serve KV cached SVG |
| GraphQL errors | Serve KV cached SVG |
| Streak computation exception | Serve KV cached SVG |
| Empty KV (first run) | Serve minimal fallback SVG |
| All paths | HTTP 200 with valid SVG |

## Deployment Verification

After `wrangler deploy`, always confirm the right code is live:

```
GET /health  →  { "ok": true, "build": "grace-v3" }
GET /debug   →  { graceStart, graceEnd, currentStreak, missedDays, ... }
```

If `/health` shows an older build string, the deploy used stale local code — run `git pull` and redeploy.

## Testing Considerations

- **Grace window**: missed 1 day should not reduce streak; 7 consecutive zeros should reset graceStart to the first contribution after the gap
- **Today UTC grace**: if today has 0 contributions, graceEnd = yesterday — must not break an otherwise healthy streak
- **Backward walk correctness**: the walk must stop at the 7th consecutive zero and return the contribution day just after that block
- **Missed days count**: should equal zero-contribution days in [graceStart, graceEnd]
- **Weekly streak**: week with exactly 4 active days counts; 3 active days does not; current week never counted
- **KV fallback**: with GitHub API unavailable, cached SVG is served
- **Empty KV**: first run returns minimal fallback, not a 500
- **Cache headers**: verify `Cache-Control` is set on all SVG responses
