interface Env {
  GITHUB_USERNAME: string;
  GITHUB_TOKEN: string;
  STREAK_KV: KVNamespace;
}

interface ContributionDay {
  date: string;
  contributionCount: number;
}

interface StreakData {
  currentStreak: number;
  currentStreakStart: string;
  currentStreakEnd: string;
  longestStreak: number;
  longestStreakStart: string;
  longestStreakEnd: string;
  totalContributions: number;
  firstContributionDate: string;
  username: string;
  updatedDate: string;
}

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
const DAYS_TO_FETCH = 6500; // Fetch ~18 years of data to capture all contributions since GitHub's founding
const CACHE_CONTROL_HEADER = 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/streak.svg') {
      return handleStreakSVG(env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleStreakSVG(env: Env): Promise<Response> {
  try {
    const username = env.GITHUB_USERNAME || 'codekunoichi';
    const contributionDays = await fetchGitHubContributions(username, env.GITHUB_TOKEN);
    const streakData = calculateStreaks(contributionDays, username);
    const svg = generateSVG(streakData);

    await env.STREAK_KV.put('last_good_svg', svg);

    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': CACHE_CONTROL_HEADER,
      },
    });
  } catch (error) {
    console.error('Error generating SVG:', error);
    return serveFallbackSVG(env);
  }
}

async function serveFallbackSVG(env: Env): Promise<Response> {
  try {
    const cachedSVG = await env.STREAK_KV.get('last_good_svg');

    if (cachedSVG) {
      return new Response(cachedSVG, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': CACHE_CONTROL_HEADER,
        },
      });
    }
  } catch (kvError) {
    console.error('Error retrieving from KV:', kvError);
  }

  const fallbackSVG = generateFallbackSVG();
  return new Response(fallbackSVG, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': CACHE_CONTROL_HEADER,
    },
  });
}

async function fetchYearOfContributions(
  username: string,
  token: string,
  fromDate: Date,
  toDate: Date
): Promise<ContributionDay[]> {
  const query = `
    query($username: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $username) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    username,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
  };

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'codekunoichi-streak-card/1.0',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`GitHub API error response: ${errorText}`);
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  const weeks = data?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;

  if (!weeks) {
    throw new Error('Invalid response structure from GitHub API');
  }

  const days: ContributionDay[] = [];
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      days.push({
        date: day.date,
        contributionCount: day.contributionCount,
      });
    }
  }

  return days;
}

async function fetchGitHubContributions(username: string, token: string): Promise<ContributionDay[]> {
  const allDays: ContributionDay[] = [];
  const today = new Date();

  // Start from 2010 to capture all GitHub history
  const startYear = 2010;
  const currentYear = today.getUTCFullYear();

  for (let year = startYear; year <= currentYear; year++) {
    const fromDate = new Date(Date.UTC(year, 0, 1)); // January 1st of the year
    const toDate = year === currentYear
      ? today
      : new Date(Date.UTC(year, 11, 31, 23, 59, 59)); // December 31st of the year

    try {
      const yearDays = await fetchYearOfContributions(username, token, fromDate, toDate);
      allDays.push(...yearDays);
    } catch (error) {
      console.error(`Failed to fetch data for year ${year}:`, error);
      // Continue with other years even if one fails
    }
  }

  return allDays.sort((a, b) => a.date.localeCompare(b.date));
}

function calculateStreaks(days: ContributionDay[], username: string): StreakData {
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const todayStr = todayUTC.toISOString().split('T')[0];

  let totalContributions = 0;
  let firstContributionDate = '';

  for (const day of days) {
    totalContributions += day.contributionCount;
    if (day.contributionCount > 0 && !firstContributionDate) {
      firstContributionDate = day.date;
    }
  }

  let currentStreak = 0;
  let currentStreakStart = '';
  let currentStreakEnd = '';

  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];

    if (day.date > todayStr) {
      continue;
    }

    if (day.contributionCount > 0) {
      if (currentStreak === 0) {
        currentStreakEnd = day.date;
      }
      currentStreakStart = day.date;
      currentStreak++;
    } else {
      break;
    }
  }

  let longestStreak = 0;
  let longestStreakStart = '';
  let longestStreakEnd = '';
  let tempStreak = 0;
  let tempStart = '';
  let tempEnd = '';

  for (let i = 0; i < days.length; i++) {
    const day = days[i];

    if (day.contributionCount > 0) {
      if (tempStreak === 0) {
        tempStart = day.date;
      }
      tempEnd = day.date;
      tempStreak++;

      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
        longestStreakStart = tempStart;
        longestStreakEnd = tempEnd;
      }
    } else {
      tempStreak = 0;
      tempStart = '';
      tempEnd = '';
    }
  }

  return {
    currentStreak,
    currentStreakStart,
    currentStreakEnd,
    longestStreak,
    longestStreakStart,
    longestStreakEnd,
    totalContributions,
    firstContributionDate: firstContributionDate || todayStr,
    username,
    updatedDate: todayStr,
  };
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function formatDateRange(startStr: string, endStr: string): string {
  if (!startStr || !endStr) return 'No streak yet';
  return `${formatDate(startStr)} - ${formatDate(endStr)}`;
}

function generateSVG(data: StreakData): string {
  const width = 800;
  const height = 220;
  const padding = 40;
  const columnWidth = (width - padding * 2) / 3;

  const circleRadius = 45;
  const circleStrokeWidth = 8;
  const circleCx = padding + columnWidth * 1.5;
  const circleCy = 85;
  const circumference = 2 * Math.PI * circleRadius;

  const maxStreak = Math.max(data.currentStreak, 100);
  const progress = Math.min((data.currentStreak / maxStreak) * 100, 100);
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const flameIcon = `<path d="M ${circleCx} ${circleCy - circleRadius - 12}
    c 0,-4 -2,-6 -4,-10 -1,-2 0,-3 1,-4 3,-2 6,1 8,4 2,4 4,8 4,13
    c 0,6 -5,11 -11,11 -6,0 -11,-5 -11,-11 0,-3 2,-6 4,-9 2,-2 4,-2 6,-1
    1,1 2,2 2,4 0,2 -1,4 -3,5 -1,1 -2,2 -2,3 0,1 1,3 3,3 2,0 3,-1 3,-3
    0,-1 0,-2 -1,-2"
    fill="#f97316" stroke="#ea580c" stroke-width="0.5"/>`;

  const currentStreakRange = formatDateRange(data.currentStreakStart, data.currentStreakEnd);
  const longestStreakRange = formatDateRange(data.longestStreakStart, data.longestStreakEnd);
  const accountStart = formatFullDate(data.firstContributionDate);

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f8fafc;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f1f5f9;stop-opacity:1" />
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" rx="16" fill="url(#grad)" stroke="#e2e8f0" stroke-width="1"/>

  <!-- Left Column: Total Contributions -->
  <text x="${padding}" y="85" font-family="system-ui, -apple-system, sans-serif" font-size="48" fill="#0f172a" font-weight="700">
    ${data.totalContributions.toLocaleString()}
  </text>
  <text x="${padding}" y="115" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#64748b" font-weight="500">
    Total Contributions
  </text>
  <text x="${padding}" y="145" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#94a3b8">
    ${accountStart} - Present
  </text>

  <!-- Divider Line 1 -->
  <line x1="${padding + columnWidth}" y1="${padding}" x2="${padding + columnWidth}" y2="${height - padding}" stroke="#e2e8f0" stroke-width="1"/>

  <!-- Center Column: Current Streak -->
  ${flameIcon}

  <circle cx="${circleCx}" cy="${circleCy}" r="${circleRadius}"
    fill="none" stroke="#e2e8f0" stroke-width="${circleStrokeWidth}"/>

  <circle cx="${circleCx}" cy="${circleCy}" r="${circleRadius}"
    fill="none" stroke="#f97316" stroke-width="${circleStrokeWidth}"
    stroke-dasharray="${circumference}"
    stroke-dashoffset="${strokeDashoffset}"
    stroke-linecap="round"
    transform="rotate(-90 ${circleCx} ${circleCy})"/>

  <text x="${circleCx}" y="${circleCy + 10}" font-family="system-ui, -apple-system, sans-serif"
    font-size="40" fill="#0f172a" font-weight="700" text-anchor="middle">
    ${data.currentStreak}
  </text>

  <text x="${circleCx}" y="${circleCy + circleRadius + 30}" font-family="system-ui, -apple-system, sans-serif"
    font-size="20" fill="#f97316" font-weight="600" text-anchor="middle">
    Current Streak
  </text>
  <text x="${circleCx}" y="${circleCy + circleRadius + 52}" font-family="system-ui, -apple-system, sans-serif"
    font-size="14" fill="#64748b" text-anchor="middle">
    ${currentStreakRange}
  </text>

  <!-- Divider Line 2 -->
  <line x1="${padding + columnWidth * 2}" y1="${padding}" x2="${padding + columnWidth * 2}" y2="${height - padding}" stroke="#e2e8f0" stroke-width="1"/>

  <!-- Right Column: Longest Streak -->
  <text x="${padding + columnWidth * 2.5}" y="85" font-family="system-ui, -apple-system, sans-serif"
    font-size="48" fill="#0f172a" font-weight="700" text-anchor="middle">
    ${data.longestStreak}
  </text>
  <text x="${padding + columnWidth * 2.5}" y="115" font-family="system-ui, -apple-system, sans-serif"
    font-size="18" fill="#64748b" font-weight="500" text-anchor="middle">
    Longest Streak
  </text>
  <text x="${padding + columnWidth * 2.5}" y="145" font-family="system-ui, -apple-system, sans-serif"
    font-size="14" fill="#94a3b8" text-anchor="middle">
    ${longestStreakRange}
  </text>
</svg>`;
}

function generateFallbackSVG(): string {
  const width = 800;
  const height = 220;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f8fafc;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f1f5f9;stop-opacity:1" />
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" rx="16" fill="url(#grad)" stroke="#e2e8f0" stroke-width="1"/>

  <text x="${width / 2}" y="${height / 2}" font-family="system-ui, -apple-system, sans-serif" font-size="20" fill="#64748b" text-anchor="middle" dominant-baseline="middle">
    Streak temporarily unavailable
  </text>
</svg>`;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
