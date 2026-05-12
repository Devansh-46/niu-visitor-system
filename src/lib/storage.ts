import { Visitor, AppConfig } from '@/types';

const STORE_KEY = 'niu_visitors';
const CONFIG_KEY = 'niu_config';
const COUNTER_KEY = 'niu_serial_counter';

export function getVisitors(): Visitor[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveVisitors(visitors: Visitor[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORE_KEY, JSON.stringify(visitors));
}

export function getConfig(): AppConfig {
  if (typeof window === 'undefined') {
    return defaultConfig();
  }
  try {
    return { ...defaultConfig(), ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(cfg: AppConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function defaultConfig(): AppConfig {
  return {
    email: '',
    cc: '',
    sheetsURL: '',
    operator: 'Front Desk',
    emailjsKey: '',
    emailjsService: '',
    emailjsTemplate: '',
    autoEmail: false,
  };
}

/**
 * Monotonic counter — never reuses an ID even if entries are deleted.
 * Stored separately from the visitors array so deletions don't affect numbering.
 */
export function nextSerial(): number {
  if (typeof window === 'undefined') return 1;
  const current = parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10);
  const next = current + 1;
  localStorage.setItem(COUNTER_KEY, String(next));
  return next;
}

export function generateVisitorId(serial: number, now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `NIU-${y}${m}${d}-${String(serial).padStart(4, '0')}`;
}
