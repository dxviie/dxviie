// Renders the stats card as plain SVG — <rect>, <text>, <path> only.
//
// Deliberately no <foreignObject>: GitHub serves the card through camo as an
// <img>, and pure SVG is the shape that renders identically everywhere. The
// monospace stack keeps advance widths predictable so nothing collides.

// ── d17e.dev palette ────────────────────────────────────────────────────────
const C = {
  surface: "#fdfaff",
  panel: "#f7f2f9",
  border: "#e8e4ec",
  ink: "#1c1d20",
  muted: "#6b6673",
  accent: "#ff3db4",
};

// Categorical slots, in fixed order. Chosen against the data-viz validator by
// searching for an ordering where every ADJACENT pair clears the gates (only
// adjacent pairs matter for a stacked bar): worst adjacent CVD ΔE 15.3
// (target >= 8), worst adjacent normal-vision ΔE 19.9 (floor 15) on surface
// #fdfaff. Slots 9-11 extend the original eight without changing them, and
// without moving either worst case. Reordering invalidates that result — re-run
// the validator. Three slots sit under 3:1 against the surface, which the
// direct-labelled legend below is the required relief for.
const SERIES = [
  "#ff3db4", "#eb6834", "#2a78d6", "#1baf7a", "#4a3aa7", "#008300",
  "#eda100", "#e34948", "#00a0c6", "#7a9e00", "#9b3fd4",
];
const OTHER = "#9c96a6";

// Sequential ramp for the calendar: one hue, light -> dark.
const HEAT = ["#ece7ef", "#ffc9e8", "#ff8ecd", "#ff3db4", "#c4157f"];

const FONT = "'Courier New', Courier, monospace";
const W = 960;
const PAD = 32;
const INNER = W - PAD * 2;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

const group = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function compact(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}m`;
}

function humanBytes(kb) {
  const units = [["TB", 1024 ** 3], ["GB", 1024 ** 2], ["MB", 1024], ["kB", 1]];
  for (const [unit, size] of units) if (kb >= size) return `${(kb / size).toFixed(kb / size < 10 ? 2 : 1)} ${unit}`;
  return "0 kB";
}

function yearsSince(iso, now) {
  const years = (now - new Date(iso)) / (365.2425 * 24 * 3600 * 1000);
  return Math.max(0, Math.floor(years));
}

const text = (x, y, s, { size = 13, fill = C.ink, weight = "normal", anchor = "start", spacing } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}"` +
  `${spacing ? ` letter-spacing="${spacing}"` : ""}>${esc(s)}</text>`;

export function renderCard(stats) {
  const now = new Date(stats.generatedAt);
  const out = [];
  let y = PAD;

  // ── header ────────────────────────────────────────────────────────────────
  // No name or avatar: this card sits directly beneath both on the profile, so
  // repeating them is pure duplication. The handle stays as a quiet anchor for
  // when the SVG is opened on its own.
  out.push(
    text(PAD, y + 12, `@${stats.user.login}`, { size: 14, weight: "bold", fill: C.accent }),
    text(
      PAD + INNER,
      y + 12,
      `Joined GitHub ${yearsSince(stats.user.createdAt, now)} years ago  ·  ` +
        `Contributed to ${group(stats.community.contributedTo)} repositories`,
      { size: 12, fill: C.muted, anchor: "end" },
    ),
  );
  y += 40;

  // ── hero tiles ────────────────────────────────────────────────────────────
  const tiles = [
    ["Commits", stats.activity.commits],
    ["Pull requests", stats.activity.pullRequests],
    ["Repositories", stats.repositories.count],
    ["Stargazers", stats.repositories.stars],
  ];
  const gap = 16;
  const tw = (INNER - gap * (tiles.length - 1)) / tiles.length;
  const th = 78;
  tiles.forEach(([label, value], i) => {
    const x = PAD + i * (tw + gap);
    out.push(
      `<rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="8" fill="${C.panel}" stroke="${C.border}"/>`,
      `<rect x="${x}" y="${y}" width="3" height="${th}" rx="1.5" fill="${C.accent}"/>`,
      text(x + 18, y + 42, compact(value), { size: 30, weight: "bold", fill: C.accent }),
      text(x + 18, y + 63, label.toUpperCase(), { size: 10, fill: C.muted, spacing: 1.2 }),
    );
  });
  y += th + 34;

  // ── three stat columns ────────────────────────────────────────────────────
  const columns = [
    ["Activity", [
      ["Commits", group(stats.activity.commits)],
      ["Pull requests opened", group(stats.activity.pullRequests)],
      ["Reviews given", group(stats.activity.reviews)],
      ["Issues opened", group(stats.activity.issues)],
      ["Issue comments", group(stats.activity.issueComments)],
    ]],
    ["Community", [
      ["Followers", group(stats.community.followers)],
      ["Following", group(stats.community.following)],
      ["Organizations", group(stats.community.organizations)],
      ["Starred", group(stats.community.starred)],
      ["Watching", group(stats.community.watching)],
    ]],
    ["Repositories", [
      ["Total", group(stats.repositories.count)],
      // Only shown when the token can actually see them, so the row doubles as
      // confirmation that private repos made it into the language totals.
      ...(stats.repositories.privateCount
        ? [["Private", group(stats.repositories.privateCount)]]
        : []),
      ["Stargazers", group(stats.repositories.stars)],
      ["Forks", group(stats.repositories.forks)],
      ["Watchers", group(stats.repositories.watchers)],
      ["Disk usage", humanBytes(stats.repositories.diskUsageKb)],
      ["Prefers license", stats.repositories.favouriteLicense ?? "n/a"],
    ]],
  ];
  const cw = (INNER - gap * 2) / 3;
  let columnBottom = y;
  columns.forEach(([title, rows], i) => {
    const x = PAD + i * (cw + gap);
    out.push(text(x, y, title.toUpperCase(), { size: 11, weight: "bold", fill: C.accent, spacing: 1.4 }));
    out.push(`<line x1="${x}" y1="${y + 8}" x2="${x + cw}" y2="${y + 8}" stroke="${C.border}"/>`);
    rows.forEach(([label, value], r) => {
      const ry = y + 30 + r * 22;
      out.push(text(x, ry, label, { size: 12.5, fill: C.muted }));
      out.push(text(x + cw, ry, value, { size: 12.5, weight: "bold", fill: C.ink, anchor: "end" }));
    });
    columnBottom = Math.max(columnBottom, y + 30 + rows.length * 22);
  });
  y = columnBottom + 24;

  // ── languages ─────────────────────────────────────────────────────────────
  const langs = topLanguages(stats.repositories.languages, SERIES.length);
  if (langs.length) {
    out.push(
      text(PAD, y, `MOST USED LANGUAGES  (${stats.repositories.languageCount} total)`, {
        size: 11, weight: "bold", fill: C.accent, spacing: 1.4,
      }),
    );
    y += 16;

    const bh = 16;
    out.push(`<clipPath id="langbar"><rect x="${PAD}" y="${y}" width="${INNER}" height="${bh}" rx="${bh / 2}"/></clipPath>`);
    out.push(`<g clip-path="url(#langbar)">`);
    let cursor = PAD;
    langs.forEach((lang, i) => {
      const segment = lang.share * INNER;
      const isLast = i === langs.length - 1;
      // 2px surface gap between segments, per the mark spec.
      // Floor the drawn width so a sub-1% language still shows a mark against
      // its legend entry. Positions use the true share, and segments paint in
      // order, so the next one covers any overhang.
      const drawn = isLast ? segment : Math.max(2, segment - 2);
      out.push(`<rect x="${cursor}" y="${y}" width="${drawn}" height="${bh}" fill="${lang.color}"/>`);
      cursor += segment;
    });
    out.push(`</g>`);
    y += bh + 24;

    // Legend, direct-labelled with the share — this is also the relief the
    // validator requires for the two slots under 3:1 against the surface.
    const perRow = 4;
    const lw = INNER / perRow;
    langs.forEach((lang, i) => {
      const lx = PAD + (i % perRow) * lw;
      const ly = y + Math.floor(i / perRow) * 22;
      out.push(`<rect x="${lx}" y="${ly - 9}" width="10" height="10" rx="2" fill="${lang.color}"/>`);
      out.push(text(lx + 18, ly, truncate(lang.name, 15), { size: 12, fill: C.ink }));
      out.push(text(lx + lw - 12, ly, `${(lang.share * 100).toFixed(1)}%`, {
        size: 12, fill: C.muted, anchor: "end",
      }));
    });
    y += Math.ceil(langs.length / perRow) * 22 + 18;
  }

  // ── recent activity ───────────────────────────────────────────────────────
  const recent = renderRecentActivity(stats.recentActivity, y);
  out.push(recent.svg);
  y = recent.bottom;

  // ── footer ────────────────────────────────────────────────────────────────
  y += 10;
  out.push(
    text(W - PAD, y, `Generated ${now.toISOString().replace("T", " ").slice(0, 16)} UTC · d17e.dev`, {
      size: 10, fill: C.muted, anchor: "end",
    }),
  );
  const height = Math.ceil(y + PAD - 8);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" `,
    `width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" font-family="${FONT}" role="img" `,
    `aria-label="GitHub statistics for ${esc(stats.user.login)}">`,
    `<rect width="${W}" height="${height}" rx="12" fill="${C.surface}" stroke="${C.border}"/>`,
    out.join("\n"),
    `</svg>`,
    ``,
  ].join("\n");
}

// Monospace advance is ~0.6em, so the legend column fits about 15 characters
// beside its right-aligned percentage.
const truncate = (s, max) => (s.length <= max ? s : `${s.slice(0, max - 1)}\u2026`);

function topLanguages(languages, limit) {
  const shown = languages.slice(0, limit).map((lang, i) => ({ ...lang, color: SERIES[i] }));
  const rest = languages.slice(limit);
  if (rest.length) {
    shown.push({
      name: `Other (${rest.length})`,
      share: rest.reduce((sum, l) => sum + l.share, 0),
      color: OTHER,
    });
  }
  return shown;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

const prettyDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

// A single strip, not a year grid: GitHub already draws the full calendar
// further down the profile, so repeating it here earns nothing.
function renderRecentActivity({ days, total }, top) {
  if (!days.length) return { svg: "", bottom: top };

  const out = [];
  let y = top;

  out.push(
    text(PAD, y, `LAST ${days.length} DAYS`, { size: 11, weight: "bold", fill: C.accent, spacing: 1.4 }),
    text(PAD + INNER, y, `${group(total)} contribution${total === 1 ? "" : "s"}`, {
      size: 11, fill: C.muted, anchor: "end",
    }),
  );
  y += 20;

  const GAP = 4;
  // Size cells against a full 30-day strip, never against the day count: a
  // short history should leave the row unfinished, not inflate into big blocks.
  const slots = Math.max(days.length, 30);
  const cell = (INNER - GAP * (slots - 1)) / slots;
  const max = Math.max(0, ...days.map((day) => day.count));
  const level = (n) => (n === 0 || max === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));

  // Weekday initials sit above the strip; the strip spans a month, so a row of
  // date labels underneath would collide at this cell width.
  days.forEach((day, i) => {
    const x = PAD + i * (cell + GAP);
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    out.push(
      text(x + cell / 2, y, WEEKDAY_INITIALS[weekday], { size: 9, fill: C.muted, anchor: "middle" }),
    );
  });
  y += 8;

  days.forEach((day, i) => {
    const x = PAD + i * (cell + GAP);
    const lv = level(day.count);
    out.push(
      `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="4" fill="${HEAT[lv]}"` +
        `${lv === 0 ? ` stroke="${C.border}"` : ""}><title>${esc(prettyDate(day.date))}: ` +
        `${day.count} contribution${day.count === 1 ? "" : "s"}</title></rect>`,
    );
  });
  y += cell + 16;

  // Range on the left, ramp legend on the right.
  out.push(
    text(PAD, y, `${prettyDate(days[0].date)} \u2013 ${prettyDate(days[days.length - 1].date)}`, {
      size: 10, fill: C.muted,
    }),
  );
  const sw = 11;
  const lx = PAD + INNER - (HEAT.length * (sw + 3) + 70);
  out.push(text(lx - 6, y, "Less", { size: 10, fill: C.muted, anchor: "end" }));
  HEAT.forEach((fill, i) => {
    out.push(
      `<rect x="${lx + i * (sw + 3)}" y="${y - 9}" width="${sw}" height="${sw}" rx="2" fill="${fill}"` +
        `${i === 0 ? ` stroke="${C.border}"` : ""}/>`,
    );
  });
  out.push(text(lx + HEAT.length * (sw + 3) + 6, y, "More", { size: 10, fill: C.muted }));

  return { svg: out.join("\n"), bottom: y + 12 };
}
