# sjschroeder.com

Personal home base for a maker and DIYer — a static [Astro](https://astro.build)
site that acts as a launcher for projects self-hosted around the homelab.
Code, wood, art, and sky, all treated as made things.

## Working on it

```sh
npm install
npm run dev      # dev server at localhost:4321
npm run build    # static output in dist/
npm run preview  # serve dist/ locally
```

## Adding content

Everything is markdown in `src/content/` — drop in a file, rebuild, done.
Frontmatter is validated against `src/content.config.ts` at build time.

| Collection | Directory | What an entry is |
|---|---|---|
| projects | `src/content/projects/` | a card on the projects wall; body = writeup page |
| workshop | `src/content/workshop/` | a woodworking piece with photo + caption |
| art | `src/content/art/` | an artwork (paint, pastel, spray…) on the quiet gallery wall |
| sky | `src/content/sky/` | an astrophotography capture |
| log | `src/content/log/` | a one-line-to-one-paragraph changelog entry |

A project with a `url` links out; without one, its card points at the
generated writeup page. A project with a `monitor` name appears on the hub
status board and gets a live/offline LED on its card.

## Status board (Uptime Kuma)

The hub's "systems" board and the project-card LEDs read from an
[Uptime Kuma](https://github.com/louislam/uptime-kuma) status page —
server-side monitoring, no browser pings. Configuration lives in `.env`
(see `.env.example`); values are baked in at build time.

Expectations on the Kuma side:

- a status page (default slug `public`) listing every monitor the site
  should show;
- monitor names that slugify to the `monitor` values used in project
  frontmatter — `Dungeon` → `dungeon`, `Astral Surveyor` → `astral-surveyor`;
- reachable from visitors' browsers: either on its own subdomain (Kuma
  sends CORS headers for status-page endpoints) or proxied by the site's
  nginx under a path like `/kuma` (no CORS involved).

Endpoints consumed (public, unauthenticated):

```
GET {KUMA_URL}/api/status-page/{PAGE}            # monitor ids + names
GET {KUMA_URL}/api/status-page/heartbeat/{PAGE}  # heartbeats + 24h uptime
```

If Kuma is down or unconfigured the board renders "status unavailable"
and the card LEDs stay grey — the page itself never breaks. Extra
monitors on the status page (beyond the seeded projects) show up on the
hub board automatically.

## Deploying

Static files served by nginx in an LXC, exposed through a Cloudflare
tunnel (TLS terminates at Cloudflare's edge). Day-to-day deploys are a
pull-and-rebuild script on the container; first-time container setup is
an Ansible playbook. Everything lives in [`deploy/`](deploy/README.md) —
the README there is the full runbook, from `pct create` to the tunnel.
