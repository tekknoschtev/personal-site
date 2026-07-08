# Deploying sjschroeder.com

The model: **push locally, pull-and-rebuild on the box.** The container
never needs inbound access — it pulls from GitHub and the Cloudflare
tunnel carries visitors in. Ansible does the one-time bootstrap;
day-to-day deploys are one command.

What's in this directory:

| file | what it is | where it ends up |
|---|---|---|
| `site.yml` | one-time bootstrap playbook | hand-typed into `~/homelab` |
| `inventory.example` | two-line Ansible inventory | hand-typed into `~/homelab` |
| `deploy.sh` | pull + build + publish script | `/usr/local/bin/deploy-site` (placed by playbook) |
| `nginx-site.conf` | nginx config | `/etc/nginx/sites-available/site` (placed by playbook) |

Only `site.yml` and the inventory ever need typing into WSL2 — the
playbook copies everything else out of the cloned repo on the target.

---

## 1. One-time: create the LXC (Proxmox)

Any Debian 12 container works. Suggested shape:

- 2 CPU, 2 GB RAM, 10 GB rootfs on the `storage` pool
- unprivileged is fine; needs outbound network only
- static-ish IP on `192.168.4.x` (note it for the inventory)

Example, adjust numbers to taste (or use the GUI):

```sh
pct create 150 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname site --memory 2048 --cores 2 \
  --rootfs storage:10 --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1
pct start 150
```

Then get your ed25519 key in for Ansible:

```sh
pct exec 150 -- mkdir -p /root/.ssh
pct exec 150 -- sh -c 'echo "PASTE_YOUR_PUBKEY" > /root/.ssh/authorized_keys'
```

(Or set the key in the GUI when creating the container.)

## 2. One-time: run the playbook

In WSL2, in `~/homelab`: hand-type `site.yml` and the inventory (fix the
IP), then:

```sh
ansible-playbook -i inventory site.yml
```

When it finishes, the site is built and nginx is serving it on port 80
inside the LAN — `curl http://192.168.4.50/` should return HTML.
Re-running the playbook is safe; it skips what's already done.

> The playbook clones over HTTPS, which works for a public repo. If the
> repo is private, put a deploy key on the box and switch `repo:` to the
> SSH URL.

## 3. One-time: the Cloudflare tunnel

Tunnel auth is interactive, so it stays manual (five commands, once).
On the container:

```sh
cloudflared tunnel login                 # opens a URL; approve in browser
cloudflared tunnel create site
cloudflared tunnel route dns site sjschroeder.com
```

Create `/etc/cloudflared/config.yml` — get the tunnel ID from
`cloudflared tunnel list`:

```yaml
tunnel: THE-TUNNEL-ID
credentials-file: /root/.cloudflared/THE-TUNNEL-ID.json
ingress:
  - hostname: sjschroeder.com
    service: http://localhost:80
  - service: http_status:404
```

Then install it as a service and you're live:

```sh
cloudflared service install
systemctl enable --now cloudflared
```

TLS terminates at Cloudflare's edge — nothing to renew locally, ever.

## 4. One-time: wire up Uptime Kuma

Standing Kuma up is a playbook too — `kuma.yml` in this directory
(bare Node in its own small LXC, systemd-managed, no Docker). Create a
Debian 12 container (1 CPU / 1 GB / 8 GB), get your key in, add it to
the inventory as `[kuma]`, then:

```sh
ansible-playbook -i inventory kuma.yml
```

Kuma answers on `http://<kuma-ip>:3001` — open it and create the admin
account. Its data (monitors, history) lives in `/opt/uptime-kuma/data`;
include that path in backups if you start caring about uptime history.
The version is pinned in the playbook's `kuma_version` var — check the
Kuma releases page and bump deliberately.

Once Kuma is running:

1. In Kuma, add monitors for `dungeon`, `trackboard`, and Astral
   Surveyor's public URL. Monitor names must slugify to the `monitor`
   values in the project frontmatter (`Astral Surveyor` →
   `astral-surveyor` is fine). Monitor the **public** URLs
   (`https://dungeon.sjschroeder.com` etc.) rather than LAN addresses —
   that tests the whole path visitors take, tunnel included. Adding a
   monitor for `https://sjschroeder.com` itself is fair game too; extra
   monitors show up on the hub board automatically.
2. Create a status page (slug `public`) and put every monitor on it.
3. Point the site at it — pick one:
   - **Same-origin proxy (recommended, no CORS):** uncomment the
     `/kuma/` block in `/etc/nginx/sites-available/site`, set the Kuma
     IP:port, `nginx -t && systemctl reload nginx`. In
     `/opt/personal-site/.env` set `PUBLIC_KUMA_URL=/kuma`.
   - **Direct:** give Kuma its own tunnel hostname (e.g.
     `status.sjschroeder.com`) and set that as `PUBLIC_KUMA_URL`.
4. `deploy-site` (env values bake in at build time).

Grey LEDs and "status unavailable" are the designed fallback whenever
Kuma is unreachable — the site never breaks because monitoring is down.

## 5. Every deploy after that

```sh
# on the workstation
git push

# on the container (ssh root@192.168.4.50)
deploy-site
```

That's the whole loop. If even that feels like too many steps, a cron
line on the container makes it fully automatic (deploys at :07 past
every hour, only publishes when the build succeeds):

```
7 * * * * /usr/local/bin/deploy-site >> /var/log/deploy-site.log 2>&1
```

## Troubleshooting

- `nginx -t` — config check after editing the site config.
- `journalctl -u cloudflared -f` — tunnel connectivity.
- `node --version` — should be 22.x; the playbook pins NodeSource.
- Build failing on the box but not locally? `cd /opt/personal-site &&
  git status` — a dirty tree from manual edits blocks `git pull
  --ff-only`. `git checkout .` and re-run `deploy-site`.
