

# Intent: Self-Hosted GitHub Streak Card (SVG) on Cloudflare Workers

## Primary Goal
Build a **reliable, self-hosted GitHub streak card** served as an SVG image from a Cloudflare Worker.

The SVG will be embedded in a GitHub README and must **never break visually**, even if GitHub’s API is temporarily unavailable.

Endpoint example:
`![GitHub Streak](https://<worker-domain>/streak.svg)`

This card is for **one user only**: `codekunoichi`.

---

## Core Design Principles
- Stability > freshness
- Deterministic output
- No external badge services
- No runtime dependencies beyond GitHub GraphQL
- Graceful degradation on failure

---

## Non-Goals
- No UI or frontend site
- No support for multiple usernames
- No accepting `?user=` or other identity parameters
- No database
- No scheduled jobs (on-demand only)

---

## Identity & Access Rules
- Username is supplied **only** via environment variable:
  - `GITHUB_USERNAME` (default: `codekunoichi`)
- Ignore any query parameters that attempt to change identity
- This endpoint must **only ever render a streak for the configured username**

---

## Environment Variables
- `GITHUB_USERNAME` — GitHub username (string)
- `GITHUB_TOKEN` — GitHub Personal Access Token (read-only)

---

## Data Source
Use **GitHub GraphQL API**:

- URL: `https://api.github.com/graphql`

Query must obtain daily contribution counts from GitHub’s contribution calendar:
- `user(login)`
- `contributionsCollection(from, to)`
- `contributionCalendar.weeks.contributionDays { date contributionCount }`

Fetch **at least the last 370 days** of daily data to compute current + longest streak.

All dates must be handled in **UTC**.

---

## Streak Computation Rules
- A day counts toward a streak if `contributionCount > 0`.

### Current streak
- Count consecutive days ending **today (UTC)** where `contributionCount > 0`.
- If **today** has `0` contributions, current streak is `0`.

### Longest streak
- Maximum consecutive run of days with `contributionCount > 0` within the fetched range.

### Determinism
- Sort days by date (UTC).
- Do not infer missing days; treat missing days as `0`.

---

## Reliability Requirement (CRITICAL)
The Worker must implement a **Last-Known-Good SVG fallback** using **Cloudflare KV**.

### Required behavior
1. Attempt to fetch GitHub data and generate a fresh SVG.
2. If successful:
   - Return the SVG.
   - Persist it to KV as key `last_good_svg`.
3. If GitHub API fails OR computation throws:
   - Retrieve `last_good_svg` from KV.
   - If present, return it with HTTP 200.
4. If KV is empty (first run failure):
   - Return a minimal fallback SVG saying `Streak temporarily unavailable`.

The README image must **never render broken**.

---

## KV Storage
- Use a KV namespace bound as `STREAK_KV`.
- Store:
  - Key: `last_good_svg`
  - Value: full SVG string

Eventual consistency is acceptable.

---

## HTTP Caching (SVG)
Add caching headers to reduce GitHub API pressure and improve stability:

`Cache-Control: public, max-age=0, s-maxage=21600, stale-while-revalidate=86400`

Also allow an ignored query param like `?v=timestamp` so GitHub cache can be manually busted if needed.

---

## Routes
- `GET /streak.svg` → returns SVG image
- `GET /health` → returns JSON `{ "ok": true }`

---

## SVG Design Requirements
- Size: approx **520 × 120**
- Dark theme (GitHub friendly)
- Rounded corners
- Simple typography (system fonts OK)
- No animation
- No flashing or gimmicks

Suggested layout:
- Header: `<username> • GitHub Streak`
- Large text: `<current> days`
- Small text: `Longest: <longest> days`
- Footer: `Updated: YYYY-MM-DD`

---

## Error Handling
- Never return non-SVG for `/streak.svg`.
- Never return 5xx to GitHub image requests.
- Prefer stale SVG over failure.

---

## Implementation Constraints
- Language: **TypeScript**
- Runtime: Cloudflare Workers
- Entry: `src/index.ts`
- Use native `fetch`.
- Avoid Node-only APIs (`fs`, `path`, etc.).
- Avoid heavy dependencies.

---

## Deliverables
Create these files:
- `src/index.ts` (Worker code)
- `wrangler.toml` (config)
- `package.json` (wrangler scripts)
- `README.md` with:
  - how to set env vars
  - how to run locally with `wrangler dev`
  - how to deploy with `wrangler deploy`
  - the final embed snippet for GitHub README

---

## Acceptance Criteria
- Visiting `/streak.svg` in a browser returns a valid SVG card.
- Embedding the URL in a GitHub README renders consistently.
- If GitHub API fails, the Worker serves the last-known-good SVG from KV.
- The Worker cannot be used to generate streaks for other usernames.