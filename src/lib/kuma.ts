/**
 * Client for Uptime Kuma's public status-page API.
 *
 * The site consumes two unauthenticated JSON endpoints that every Kuma
 * status page exposes:
 *
 *   GET {KUMA_URL}/api/status-page/{PAGE}
 *     → { publicGroupList: [{ monitorList: [{ id, name }] }] }
 *   GET {KUMA_URL}/api/status-page/heartbeat/{PAGE}
 *     → { heartbeatList: { [monitorId]: [{ status, time }] },
 *         uptimeList: { [`${monitorId}_24`]: 0..1 } }
 *
 * heartbeat status codes: 0 down · 1 up · 2 pending · 3 maintenance
 *
 * Configuration (set at build time in .env — see .env.example):
 *   PUBLIC_KUMA_URL   base URL of the Kuma instance, absolute
 *                     ("https://status.example.com") or a relative path
 *                     ("/kuma") when nginx proxies to Kuma on the same
 *                     origin, which also sidesteps CORS entirely.
 *   PUBLIC_KUMA_PAGE  status page slug (default "public")
 *
 * Monitors are matched to project cards by slugified monitor name:
 * a Kuma monitor named "Dungeon" or "dungeon" matches `monitor: dungeon`
 * in a project's frontmatter.
 */

export type MonitorState = 'up' | 'down' | 'pending' | 'maintenance';

export interface ServiceStatus {
  name: string;
  state: MonitorState;
  /** 24h uptime as a fraction (0..1), when Kuma reports it */
  uptime24h: number | null;
}

/** keyed by slugified monitor name */
export type StatusMap = Record<string, ServiceStatus>;

const KUMA_URL: string = import.meta.env.PUBLIC_KUMA_URL ?? '';
const KUMA_PAGE: string = import.meta.env.PUBLIC_KUMA_PAGE || 'public';

export const kumaConfigured = KUMA_URL !== '';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const STATES: Record<number, MonitorState> = {
  0: 'down',
  1: 'up',
  2: 'pending',
  3: 'maintenance',
};

async function getJson(path: string): Promise<unknown> {
  const base = KUMA_URL.replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`kuma responded ${res.status}`);
  return res.json();
}

/**
 * Fetch current status for every monitor on the status page.
 * Returns null when Kuma is not configured or unreachable — callers
 * degrade to "status unavailable" rather than breaking.
 */
export async function fetchKumaStatus(): Promise<StatusMap | null> {
  if (!kumaConfigured) return null;
  try {
    const [page, beats] = (await Promise.all([
      getJson(`/api/status-page/${KUMA_PAGE}`),
      getJson(`/api/status-page/heartbeat/${KUMA_PAGE}`),
    ])) as [
      { publicGroupList?: { monitorList?: { id: number; name: string }[] }[] },
      {
        heartbeatList?: Record<string, { status: number }[]>;
        uptimeList?: Record<string, number>;
      },
    ];

    const statuses: StatusMap = {};
    for (const group of page.publicGroupList ?? []) {
      for (const monitor of group.monitorList ?? []) {
        const beatList = beats.heartbeatList?.[String(monitor.id)] ?? [];
        const last = beatList[beatList.length - 1];
        const uptime = beats.uptimeList?.[`${monitor.id}_24`];
        statuses[slugify(monitor.name)] = {
          name: monitor.name,
          state: last ? (STATES[last.status] ?? 'pending') : 'pending',
          uptime24h: typeof uptime === 'number' ? uptime : null,
        };
      }
    }
    return statuses;
  } catch {
    return null;
  }
}
