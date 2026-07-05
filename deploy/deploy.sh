#!/usr/bin/env bash
# Day-to-day deploy: pull, rebuild, publish.
# Lives at /usr/local/bin/deploy-site on the container (placed by site.yml).
# The Ansible playbook is for bootstrap; this is everything after.
set -euo pipefail

APP=/opt/personal-site
WEB=/var/www/site

cd "$APP"
git pull --ff-only
npm ci
npm run build

# build into dist/, then sync into the live web root so nginx never
# serves a half-built site
rsync -a --delete "$APP/dist/" "$WEB/"

echo "deployed $(git rev-parse --short HEAD) at $(date '+%Y-%m-%d %H:%M:%S')"
