#!/usr/bin/env node
// Generates github-metrics.svg from the GitHub GraphQL API.
//
//   GITHUB_LOGIN=dxviie METRICS_TOKEN=<token> node scripts/generate-metrics.mjs
//
// Flags:
//   --out <path>      where to write the SVG   (default: github-metrics.svg)
//   --fixture <path>  render from a saved JSON payload instead of calling the API
//   --dump <path>     also write the raw stats JSON, for use as a fixture

import { writeFile, readFile } from "node:fs/promises";
import { fetchStats } from "./fetch-stats.mjs";
import { renderCard } from "./render-card.mjs";

const group = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const out = arg("out", "github-metrics.svg");
const fixture = arg("fixture");
const dump = arg("dump");

async function main() {
let stats;
if (fixture) {
  stats = JSON.parse(await readFile(fixture, "utf8"));
} else {
  const token = process.env.METRICS_TOKEN || process.env.GITHUB_TOKEN;
  const login = process.env.GITHUB_LOGIN;
  if (!token) throw new Error("Set METRICS_TOKEN (or GITHUB_TOKEN) to a token with public read access.");
  if (!login) throw new Error("Set GITHUB_LOGIN to the GitHub username to report on.");
  stats = await fetchStats({ token, login });
}

if (dump) await writeFile(dump, `${JSON.stringify(stats, null, 2)}\n`);
await writeFile(out, renderCard(stats));
const { count, privateCount, languageCount } = stats.repositories;
console.log(
  `Wrote ${out} for @${stats.user.login}: ${count} repos (${privateCount} private), ` +
    `${languageCount} languages, ${group(stats.activity.commits)} commits`,
);
if (privateCount === 0) {
  console.log(
    "note: no private repos visible — METRICS_TOKEN needs read access to them " +
      "(classic PAT with `repo`, or a fine-grained PAT with Metadata + Contents: Read on all repositories).",
  );
}
if (stats.activity.privateContributions > 0) {
  console.log(
    `note: ${stats.activity.privateContributions} contributions are still restricted ` +
      "— the token cannot see the repositories they were made in.",
  );
}
}

// A stack trace in the Actions log buries the one line that matters.
main().catch((err) => {
  console.error(`metrics: ${err.message}`);
  process.exit(1);
});
