import { useEffect, useState } from 'react';
import {
  fetchKumaStatus,
  kumaConfigured,
  type StatusMap,
  type MonitorState,
} from '../lib/kuma';
import './StatusBoard.css';

export interface Service {
  key: string;
  label: string;
}

type Phase = 'loading' | 'ready' | 'unavailable';

const STATE_TEXT: Record<MonitorState, string> = {
  up: 'online',
  down: 'offline',
  pending: 'pending',
  maintenance: 'maintenance',
};

function ledClass(state: MonitorState | undefined): string {
  if (state === 'up') return 'led on';
  if (state === 'down') return 'led off';
  return 'led unknown';
}

function uptimeText(uptime: number | null): string {
  if (uptime === null) return '';
  return `${(uptime * 100).toFixed(1)}% / 24h`;
}

export default function StatusBoard({ services }: { services: Service[] }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [statuses, setStatuses] = useState<StatusMap>({});

  useEffect(() => {
    let alive = true;

    async function poll() {
      const result = await fetchKumaStatus();
      if (!alive) return;
      if (result === null) {
        setPhase('unavailable');
      } else {
        setStatuses(result);
        setPhase('ready');
      }
    }

    poll();
    const timer = setInterval(poll, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // anything Kuma monitors beyond the seeded projects shows up too
  const extras = Object.entries(statuses)
    .filter(([key]) => !services.some((service) => service.key === key))
    .map(([key, status]) => ({ key, label: status.name }));
  const rows = [...services, ...extras];

  return (
    <div className="status-board">
      <div className="status-rows" role="list">
        {rows.map((service) => {
          const status = statuses[service.key];
          return (
            <div className="svc" role="listitem" key={service.key}>
              <span className={ledClass(status?.state)} aria-hidden="true" />
              <span className="name">{service.label}</span>
              {status?.uptime24h != null && (
                <span className="up24">{uptimeText(status.uptime24h)}</span>
              )}
              <span className="st">
                {phase === 'loading' && 'polling…'}
                {phase === 'unavailable' && '—'}
                {phase === 'ready' &&
                  (status ? STATE_TEXT[status.state] : 'not monitored')}
              </span>
            </div>
          );
        })}
      </div>
      {phase === 'unavailable' && (
        <p className="board-note">
          {kumaConfigured
            ? "status unavailable — can't reach the uptime monitor. it (or the whole rack) may be offline."
            : 'status board not wired to the uptime monitor yet.'}
        </p>
      )}
      {phase === 'ready' && (
        <p className="board-note">live from the homelab's uptime monitor</p>
      )}
    </div>
  );
}
