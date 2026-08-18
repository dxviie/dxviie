# Metrics card generator

Builds `github-metrics.svg` — the stats card on the profile README — from the
GitHub GraphQL API. Zero dependencies, no Docker, no third-party actions.

This replaced `lowlighter/metrics@latest`. That action was pinned to a mutable
branch, and its one step wrote every input (the token included) into a `.env`
file passed to `docker run ghcr.io/lowlighter/metrics:<tag>` — also a mutable
tag. Nothing here leaves the repo, so no external code ever sees a token.

## Layout

| File | Role |
|---|---|
| `generate-metrics.mjs` | CLI entry point |
| `fetch-stats.mjs` | GraphQL queries → a plain stats object |
| `render-card.mjs` | stats object → SVG |

## Running it locally

```sh
GITHUB_LOGIN=dxviie METRICS_TOKEN=<token> node scripts/generate-metrics.mjs
```

`METRICS_TOKEN` needs to **read private repositories** — otherwise their
languages are missing from the card, which is most of the point. Either a
classic PAT with the `repo` scope, or a fine-grained PAT scoped to *all*
repositories with **Metadata: Read** and **Contents: Read**.

Without the secret the workflow falls back to the job's ephemeral
`GITHUB_TOKEN`, which sees public repositories only. The run logs which case it
landed in, so check there if the language list looks short.

That is a broader token than public-only stats would need. It is still a large
improvement on the previous setup: the token is now only ever read by code in
this repository, rather than being written into a `.env` file and handed to a
Docker image pulled from a mutable tag.

Iterate on the design without burning API calls by saving a payload and
re-rendering from it:

```sh
node scripts/generate-metrics.mjs --dump stats.json      # once, hits the API
node scripts/generate-metrics.mjs --fixture stats.json   # offline from here
```

## Design notes

The card is **pure SVG** — no `<foreignObject>`. GitHub serves it through camo
as an `<img>`, and plain `<rect>`/`<text>`/`<path>` is the shape that renders
identically across browsers. The avatar is inlined as a data URI for the same
reason: an SVG loaded as an image cannot fetch external resources.

Colors come from the d17e.dev palette. The categorical order in
`render-card.mjs` was picked by enumerating permutations against the data-viz
validator — worst adjacent CVD ΔE 15.3 against a ≥8 target, worst adjacent
normal-vision ΔE 19.9 against a 15 floor, on surface `#fdfaff`. **Reordering
those hues invalidates that result**; re-run the validator if you change them.
Two slots sit under 3:1 contrast against the surface, which is why every
language carries a direct label in the legend.

Activity is a single 30-day strip rather than a year grid. GitHub already
renders a full contribution calendar further down the profile, so repeating it
here added height without adding information. The strip is a single-hue
sequential ramp, light to dark — not GitHub's green, and deliberately not a
multi-hue scale.

Cells are sized against a full 30 slots, never against the number of days
returned, so a short history leaves the row unfinished instead of inflating into
oversized blocks.

## Cache busting

The README points at the card by **commit SHA**, not by branch plus a `?v=`
query string:

```
https://raw.githubusercontent.com/dxviie/dxviie/<sha>/github-metrics.svg
```

The workflow commits the card, then rewrites that SHA in a second commit. A
query string only busts caches that key on it; changing the path itself cannot
be normalised away, so the profile page always fetches the new card.
