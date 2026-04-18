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
  weeklyStreak: number;
  currentWeekContributions: number;
  missedDaysInWindow: number;
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

function calculateWeeklyStreak(days: ContributionDay[]): { weeklyStreak: number; currentWeekContributions: number } {
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const todayStr = todayUTC.toISOString().split('T')[0];

  // Find the Sunday that started the current (incomplete) week
  const currentWeekSunday = new Date(todayUTC);
  currentWeekSunday.setUTCDate(todayUTC.getUTCDate() - todayUTC.getUTCDay());
  const currentWeekSundayStr = currentWeekSunday.toISOString().split('T')[0];

  // Tally active days per completed week (key = week's Sunday date string)
  const weekActiveDays = new Map<string, number>();

  for (const day of days) {
    if (day.date > todayStr) continue;

    const dayDate = new Date(day.date + 'T00:00:00Z');
    const weekSunday = new Date(dayDate);
    weekSunday.setUTCDate(dayDate.getUTCDate() - dayDate.getUTCDay());
    const weekSundayStr = weekSunday.toISOString().split('T')[0];

    if (weekSundayStr === currentWeekSundayStr) continue; // skip current incomplete week

    if (day.contributionCount > 0) {
      weekActiveDays.set(weekSundayStr, (weekActiveDays.get(weekSundayStr) || 0) + 1);
    }
  }

  // Count days contributed in the current (incomplete) week
  let currentWeekContributions = 0;
  for (const day of days) {
    const dayDate = new Date(day.date + 'T00:00:00Z');
    const weekSunday = new Date(dayDate);
    weekSunday.setUTCDate(dayDate.getUTCDate() - dayDate.getUTCDay());
    if (weekSunday.toISOString().split('T')[0] === currentWeekSundayStr && day.contributionCount > 0) {
      currentWeekContributions++;
    }
  }

  // Walk backwards through completed weeks counting consecutive qualifying weeks (≥4 active days)
  let weeklyStreak = 0;
  const checkWeek = new Date(currentWeekSunday);
  checkWeek.setUTCDate(checkWeek.getUTCDate() - 7); // start from last completed week

  while (true) {
    const weekSundayStr = checkWeek.toISOString().split('T')[0];
    const activeDays = weekActiveDays.get(weekSundayStr) || 0;

    if (activeDays >= 4) {
      weeklyStreak++;
      checkWeek.setUTCDate(checkWeek.getUTCDate() - 7);
    } else {
      break;
    }
  }

  return { weeklyStreak, currentWeekContributions };
}

// Returns the start of the active grace window: the first contribution day after the most
// recent block of 7+ consecutive zero-contribution days. Resets whenever such a block occurs.
function findGraceStreakStart(days: ContributionDay[], todayStr: string): string {
  let graceStart = '';
  let consecutiveZeros = 0;

  for (const day of days) {
    if (day.date > todayStr) break;
    if (day.contributionCount > 0) {
      if (consecutiveZeros >= 7 || !graceStart) {
        graceStart = day.date;
      }
      consecutiveZeros = 0;
    } else {
      consecutiveZeros++;
    }
  }

  return graceStart;
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

  // Grace window: starts at the first contribution after the most recent 7+ consecutive
  // zero block and extends to today. Resets only on 7+ consecutive misses.
  const graceStart = findGraceStreakStart(days, todayStr);

  // Grace window end: skip today if it has 0 contributions (UTC day may precede local day)
  let graceEnd = todayStr;
  const todayEntry = days.find(d => d.date === todayStr);
  if (!todayEntry || todayEntry.contributionCount === 0) {
    const yesterday = new Date(todayUTC);
    yesterday.setUTCDate(todayUTC.getUTCDate() - 1);
    graceEnd = yesterday.toISOString().split('T')[0];
  }

  // Current streak = calendar days in the grace window (inclusive)
  const graceStartDate = new Date(graceStart + 'T00:00:00Z');
  const graceEndDate = new Date(graceEnd + 'T00:00:00Z');
  const currentStreak = graceStart
    ? Math.round((graceEndDate.getTime() - graceStartDate.getTime()) / 86400000) + 1
    : 0;
  const currentStreakStart = graceStart;
  const currentStreakEnd = graceStart ? graceEnd : '';

  // Missed days = zero-contribution days inside the grace window
  let missedDaysInWindow = 0;
  for (const day of days) {
    if (!graceStart || day.date < graceStart || day.date > graceEnd) continue;
    if (day.contributionCount === 0) missedDaysInWindow++;
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

  const { weeklyStreak, currentWeekContributions } = calculateWeeklyStreak(days);

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
    weeklyStreak,
    currentWeekContributions,
    missedDaysInWindow,
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
  const width = 1000;
  const height = 220;
  const padding = 40;
  const columnWidth = (width - padding * 2) / 4;

  const circleRadius = 45;
  const circleStrokeWidth = 8;
  const circleCy = 85;
  const circumference = 2 * Math.PI * circleRadius;

  // Current streak circle (column 1, orange)
  const currentCx = padding + columnWidth * 1.5;
  const maxStreak = Math.max(data.currentStreak, 365);
  const currentProgress = Math.min((data.currentStreak / maxStreak) * 100, 100);
  const currentDashoffset = circumference - (currentProgress / 100) * circumference;

  // Weekly streak circle (column 2, purple)
  const weeklyCx = padding + columnWidth * 2.5;
  const weeklyProgress = Math.min((data.currentWeekContributions / 4) * 100, 100);
  const weeklyDashoffset = circumference - (weeklyProgress / 100) * circumference;

  const flameIcon = `<path d="M ${currentCx} ${circleCy - circleRadius - 12}
    c 0,-4 -2,-6 -4,-10 -1,-2 0,-3 1,-4 3,-2 6,1 8,4 2,4 4,8 4,13
    c 0,6 -5,11 -11,11 -6,0 -11,-5 -11,-11 0,-3 2,-6 4,-9 2,-2 4,-2 6,-1
    1,1 2,2 2,4 0,2 -1,4 -3,5 -1,1 -2,2 -2,3 0,1 1,3 3,3 2,0 3,-1 3,-3
    0,-1 0,-2 -1,-2"
    fill="#f97316" stroke="#ea580c" stroke-width="0.5"/>`;

  // Red notification badge on streak ring (top-right arc), only when misses > 0
  const badgeX = Math.round(currentCx + circleRadius * 0.707);
  const badgeY = Math.round(circleCy - circleRadius * 0.707);
  const missBadge = data.missedDaysInWindow > 0 ? `
  <circle cx="${badgeX}" cy="${badgeY}" r="13" fill="#ef4444" stroke="white" stroke-width="2"/>
  <text x="${badgeX}" y="${badgeY + 4}" font-family="system-ui, -apple-system, sans-serif"
    font-size="12" fill="white" text-anchor="middle" font-weight="700">${data.missedDaysInWindow}</text>` : '';

  // Missed days pill badge (bottom center of card)
  const sinceLabel = data.currentStreakStart ? `since ${formatDate(data.currentStreakStart)}` : '';
  const badgeText = `${data.missedDaysInWindow} missed \u00b7 ${sinceLabel}`;
  const badgeCx = width / 2;
  const badgeWidth = 210;
  const badgeFill = data.missedDaysInWindow === 0 ? '#f0fdf4' : '#fff7ed';
  const badgeStroke = data.missedDaysInWindow === 0 ? '#bbf7d0' : '#fed7aa';
  const badgeTextFill = data.missedDaysInWindow === 0 ? '#16a34a' : '#9a3412';

  // Small calendar icon above the weekly streak circle
  const calY = circleCy - circleRadius - 22;
  const calendarIcon = `
  <rect x="${weeklyCx - 9}" y="${calY}" width="18" height="15" rx="2" fill="none" stroke="#8b5cf6" stroke-width="1.5"/>
  <line x1="${weeklyCx - 9}" y1="${calY + 5}" x2="${weeklyCx + 9}" y2="${calY + 5}" stroke="#8b5cf6" stroke-width="1.5"/>
  <line x1="${weeklyCx - 4}" y1="${calY - 2}" x2="${weeklyCx - 4}" y2="${calY + 3}" stroke="#8b5cf6" stroke-width="1.5"/>
  <line x1="${weeklyCx + 4}" y1="${calY - 2}" x2="${weeklyCx + 4}" y2="${calY + 3}" stroke="#8b5cf6" stroke-width="1.5"/>`;

  const currentStreakRange = formatDateRange(data.currentStreakStart, data.currentStreakEnd);
  const longestStreakRange = formatDateRange(data.longestStreakStart, data.longestStreakEnd);
  const accountStart = formatFullDate(data.firstContributionDate);
  const weekLabel = `${data.currentWeekContributions}/4 this week`;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f8fafc;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f1f5f9;stop-opacity:1" />
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" rx="16" fill="url(#grad)" stroke="#e2e8f0" stroke-width="1"/>

  <!-- Column 0: Total Contributions -->
  <text x="${padding}" y="85" font-family="system-ui, -apple-system, sans-serif" font-size="48" fill="#0f172a" font-weight="700">
    ${data.totalContributions.toLocaleString()}
  </text>
  <text x="${padding}" y="115" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#64748b" font-weight="500">
    Total Contributions
  </text>
  <text x="${padding}" y="145" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#94a3b8">
    ${accountStart} - Present
  </text>

  <!-- Divider 1 -->
  <line x1="${padding + columnWidth}" y1="${padding}" x2="${padding + columnWidth}" y2="${height - padding}" stroke="#e2e8f0" stroke-width="1"/>

  <!-- Column 1: Current Streak (orange) -->
  ${flameIcon}

  <circle cx="${currentCx}" cy="${circleCy}" r="${circleRadius}"
    fill="none" stroke="#e2e8f0" stroke-width="${circleStrokeWidth}"/>
  <circle cx="${currentCx}" cy="${circleCy}" r="${circleRadius}"
    fill="none" stroke="#f97316" stroke-width="${circleStrokeWidth}"
    stroke-dasharray="${circumference}"
    stroke-dashoffset="${currentDashoffset}"
    stroke-linecap="round"
    transform="rotate(-90 ${currentCx} ${circleCy})"/>
  <text x="${currentCx}" y="${circleCy + 10}" font-family="system-ui, -apple-system, sans-serif"
    font-size="40" fill="#0f172a" font-weight="700" text-anchor="middle">
    ${data.currentStreak}
  </text>
  <text x="${currentCx}" y="${circleCy + circleRadius + 30}" font-family="system-ui, -apple-system, sans-serif"
    font-size="20" fill="#f97316" font-weight="600" text-anchor="middle">
    Current Streak
  </text>
  <text x="${currentCx}" y="${circleCy + circleRadius + 52}" font-family="system-ui, -apple-system, sans-serif"
    font-size="14" fill="#64748b" text-anchor="middle">
    ${currentStreakRange}
  </text>
  ${missBadge}

  <!-- Divider 2 -->
  <line x1="${padding + columnWidth * 2}" y1="${padding}" x2="${padding + columnWidth * 2}" y2="${height - padding}" stroke="#e2e8f0" stroke-width="1"/>

  <!-- Column 2: Weekly Streak (purple) -->
  ${calendarIcon}

  <circle cx="${weeklyCx}" cy="${circleCy}" r="${circleRadius}"
    fill="none" stroke="#e2e8f0" stroke-width="${circleStrokeWidth}"/>
  <circle cx="${weeklyCx}" cy="${circleCy}" r="${circleRadius}"
    fill="none" stroke="#8b5cf6" stroke-width="${circleStrokeWidth}"
    stroke-dasharray="${circumference}"
    stroke-dashoffset="${weeklyDashoffset}"
    stroke-linecap="round"
    transform="rotate(-90 ${weeklyCx} ${circleCy})"/>
  <text x="${weeklyCx}" y="${circleCy + 10}" font-family="system-ui, -apple-system, sans-serif"
    font-size="40" fill="#0f172a" font-weight="700" text-anchor="middle">
    ${data.weeklyStreak}
  </text>
  <text x="${weeklyCx}" y="${circleCy + circleRadius + 30}" font-family="system-ui, -apple-system, sans-serif"
    font-size="20" fill="#8b5cf6" font-weight="600" text-anchor="middle">
    Weekly Streak
  </text>
  <text x="${weeklyCx}" y="${circleCy + circleRadius + 52}" font-family="system-ui, -apple-system, sans-serif"
    font-size="14" fill="#64748b" text-anchor="middle">
    ${weekLabel}
  </text>

  <!-- Divider 3 -->
  <line x1="${padding + columnWidth * 3}" y1="${padding}" x2="${padding + columnWidth * 3}" y2="${height - padding}" stroke="#e2e8f0" stroke-width="1"/>

  <!-- Column 3: Longest Streak -->
  <text x="${padding + columnWidth * 3.5}" y="85" font-family="system-ui, -apple-system, sans-serif"
    font-size="48" fill="#0f172a" font-weight="700" text-anchor="middle">
    ${data.longestStreak}
  </text>
  <text x="${padding + columnWidth * 3.5}" y="115" font-family="system-ui, -apple-system, sans-serif"
    font-size="18" fill="#64748b" font-weight="500" text-anchor="middle">
    Longest Streak
  </text>
  <text x="${padding + columnWidth * 3.5}" y="145" font-family="system-ui, -apple-system, sans-serif"
    font-size="14" fill="#94a3b8" text-anchor="middle">
    ${longestStreakRange}
  </text>

  <!-- Missed days badge (bottom center) -->
  <rect x="${badgeCx - badgeWidth / 2}" y="193" width="${badgeWidth}" height="17" rx="8.5"
    fill="${badgeFill}" stroke="${badgeStroke}" stroke-width="1"/>
  <text x="${badgeCx}" y="205" font-family="system-ui, -apple-system, sans-serif"
    font-size="11" fill="${badgeTextFill}" text-anchor="middle" font-weight="500">
    ${badgeText}
  </text>
</svg>`;
}

function generateFallbackSVG(): string {
  const width = 1000;
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
