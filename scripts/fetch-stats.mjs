// Fetches every stat the metrics card renders, using only the GitHub GraphQL API.
// No third-party code ever sees the token.

const API = "https://api.github.com/graphql";

async function gql(token, query, variables = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: {
          authorization: `bearer ${token}`,
          "content-type": "application/json",
          "user-agent": "dxviie-metrics",
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      if (attempt >= 3) throw err;
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    // Secondary rate limits and 5xx are worth retrying; 4xx are not.
    if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${JSON.stringify(body)?.slice(0, 400)}`);
    if (body?.errors?.length) throw new Error(`GraphQL: ${body.errors.map((e) => e.message).join("; ")}`);
    return body.data;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROFILE = `
query($login: String!) {
  user(login: $login) {
    name login createdAt url
    avatarUrl(size: 160)
    followers { totalCount }
    following { totalCount }
    starredRepositories { totalCount }
    watching { totalCount }
    organizations { totalCount }
    issueComments { totalCount }
    repositoriesContributedTo(contributionTypes: [COMMIT], includeUserRepositories: true) { totalCount }
  }
  rateLimit { remaining }
}`;

const REPOS = `
query($login: String!, $cursor: String) {
  user(login: $login) {
    repositories(first: 100, after: $cursor, ownerAffiliations: [OWNER], isFork: false, privacy: PUBLIC) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        name diskUsage stargazerCount forkCount
        watchers { totalCount }
        licenseInfo { spdxId }
        languages(first: 12, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
      }
    }
  }
}`;

// The calendar covers the trailing year; the activity totals are lifetime, which
// means one windowed contributionsCollection per year since the account opened.
const CALENDAR = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

function lifetimeQuery(years) {
  const fields = `
    totalCommitContributions
    restrictedContributionsCount
    totalIssueContributions
    totalPullRequestContributions
    totalPullRequestReviewContributions`;
  const parts = years.map(
    (y) => `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") {${fields}}`,
  );
  return `query($login: String!) { user(login: $login) { ${parts.join("\n")} } }`;
}

async function fetchAvatarDataUri(url) {
  // Inlined as a data URI: GitHub serves the card through camo as an <img>, and an
  // SVG loaded that way cannot pull in external resources.
  try {
    const res = await fetch(url, { headers: { "user-agent": "dxviie-metrics" } });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/png";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 512 * 1024) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function fetchStats({ token, login, now = new Date() }) {
  const profileData = await gql(token, PROFILE, { login });
  const user = profileData.user;
  if (!user) throw new Error(`No such GitHub user: ${login}`);

  const startYear = new Date(user.createdAt).getUTCFullYear();
  const years = [];
  for (let y = startYear; y <= now.getUTCFullYear(); y++) years.push(y);

  const [lifetimeData, calendarData, repos, avatar] = await Promise.all([
    gql(token, lifetimeQuery(years), { login }),
    gql(token, CALENDAR, { login }),
    fetchAllRepos(token, login),
    fetchAvatarDataUri(user.avatarUrl),
  ]);

  const activity = {
    commits: 0,
    privateContributions: 0,
    issues: 0,
    pullRequests: 0,
    reviews: 0,
    issueComments: user.issueComments.totalCount,
  };
  for (const y of years) {
    const c = lifetimeData.user[`y${y}`];
    if (!c) continue;
    activity.commits += c.totalCommitContributions;
    activity.privateContributions += c.restrictedContributionsCount;
    activity.issues += c.totalIssueContributions;
    activity.pullRequests += c.totalPullRequestContributions;
    activity.reviews += c.totalPullRequestReviewContributions;
  }

  return {
    generatedAt: now.toISOString(),
    user: {
      name: user.name ?? user.login,
      login: user.login,
      url: user.url,
      createdAt: user.createdAt,
      avatar,
    },
    community: {
      followers: user.followers.totalCount,
      following: user.following.totalCount,
      organizations: user.organizations.totalCount,
      starred: user.starredRepositories.totalCount,
      watching: user.watching.totalCount,
      contributedTo: user.repositoriesContributedTo.totalCount,
    },
    activity,
    repositories: summarizeRepos(repos),
    calendar: calendarData.user.contributionsCollection.contributionCalendar,
  };
}

async function fetchAllRepos(token, login) {
  const all = [];
  let cursor = null;
  let total = 0;
  for (;;) {
    const data = await gql(token, REPOS, { login, cursor });
    const page = data.user.repositories;
    total = page.totalCount;
    all.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
  all.totalCount = total;
  return all;
}

function summarizeRepos(repos) {
  const languages = new Map();
  const licenses = new Map();
  let stars = 0, forks = 0, watchers = 0, diskUsageKb = 0;

  for (const repo of repos) {
    stars += repo.stargazerCount;
    forks += repo.forkCount;
    watchers += repo.watchers.totalCount;
    diskUsageKb += repo.diskUsage ?? 0;
    if (repo.licenseInfo?.spdxId && repo.licenseInfo.spdxId !== "NOASSERTION") {
      licenses.set(repo.licenseInfo.spdxId, (licenses.get(repo.licenseInfo.spdxId) ?? 0) + 1);
    }
    for (const { size, node } of repo.languages.edges) {
      languages.set(node.name, (languages.get(node.name) ?? 0) + size);
    }
  }

  const byBytes = [...languages].sort((a, b) => b[1] - a[1]);
  const totalBytes = byBytes.reduce((sum, [, bytes]) => sum + bytes, 0);
  const favouriteLicense = [...licenses].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    count: repos.totalCount ?? repos.length,
    stars, forks, watchers, diskUsageKb,
    favouriteLicense,
    languageCount: byBytes.length,
    languages: byBytes.map(([name, bytes]) => ({
      name,
      bytes,
      share: totalBytes ? bytes / totalBytes : 0,
    })),
  };
}
