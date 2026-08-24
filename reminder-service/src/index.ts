const MAX_BODY_BYTES = 128 * 1024;
const MAX_OCCURRENCES = 500;
const DEVICE_TTL_DAYS = 45;
const ALLOWED_ORIGIN = 'https://benz-attendance-tracker.pages.dev';
const CATEGORY_VALUES = new Set(['academic', 'clinical', 'sgt', 'ward']);

export interface Env {
  DB: D1Database;
  ONESIGNAL_APP_ID: string;
  ONESIGNAL_REST_API_KEY: string;
  ALLOWED_ORIGIN?: string;
}

export interface A1Preferences {
  midnightNeedAttention: boolean;
  preClassNeedAttention: boolean;
  allScheduledDigest: boolean;
  leadMinutes: 15 | 30 | 60;
}

export interface ReminderOccurrence {
  id: string;
  localDate: string;
  startMinute: number;
  subjectLabel: string;
  category: 'academic' | 'clinical' | 'sgt' | 'ward';
  needsAttention: boolean;
}

export interface A1ReminderPayload {
  version: 1;
  deviceId: string;
  deviceToken: string;
  oneSignalSubscriptionId: string;
  timezone: string;
  notificationsEnabled: boolean;
  preferences: A1Preferences;
  occurrences: ReminderOccurrence[];
}

interface ScheduledController {
  scheduledTime: number;
}

type DeviceRow = {
  device_id: string;
  one_signal_subscription_id: string;
  timezone: string;
  notifications_enabled: number;
  midnight_need_attention: number;
  pre_class_need_attention: number;
  all_scheduled_digest: number;
  lead_minutes: number;
};

type OccurrenceRow = ReminderOccurrence & { device_id: string };

type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};

const json = (body: unknown, status = 200, origin = ALLOWED_ORIGIN): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'Authorization, Content-Type',
      'access-control-allow-methods': 'POST, DELETE, OPTIONS',
      'vary': 'Origin',
    },
  });

const error = (message: string, status: number, origin: string): Response =>
  json({ error: message }, status, origin);

function allowedOrigin(request: Request, env: Env): string {
  const configured = env.ALLOWED_ORIGIN || ALLOWED_ORIGIN;
  const requestOrigin = request.headers.get('Origin');
  return requestOrigin === configured ? configured : configured;
}

function hasAllowedOrigin(request: Request, env: Env): boolean {
  const configured = env.ALLOWED_ORIGIN || ALLOWED_ORIGIN;
  const requestOrigin = request.headers.get('Origin');
  return requestOrigin === configured;
}

function isValidId(value: unknown, min = 8, max = 128): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isValidTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isValidOccurrence(value: unknown): value is ReminderOccurrence {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ReminderOccurrence>;
  return (
    isValidId(item.id, 1, 120) &&
    isValidDate(item.localDate) &&
    Number.isInteger(item.startMinute) &&
    (item.startMinute as number) >= 0 &&
    (item.startMinute as number) <= 1439 &&
    typeof item.subjectLabel === 'string' &&
    item.subjectLabel.trim().length > 0 &&
    item.subjectLabel.length <= 120 &&
    typeof item.category === 'string' &&
    CATEGORY_VALUES.has(item.category) &&
    typeof item.needsAttention === 'boolean'
  );
}

function isValidPreferences(value: unknown): value is A1Preferences {
  if (!value || typeof value !== 'object') return false;
  const prefs = value as Partial<A1Preferences>;
  return (
    typeof prefs.midnightNeedAttention === 'boolean' &&
    typeof prefs.preClassNeedAttention === 'boolean' &&
    typeof prefs.allScheduledDigest === 'boolean' &&
    (prefs.leadMinutes === 15 || prefs.leadMinutes === 30 || prefs.leadMinutes === 60)
  );
}

function validatePayload(payload: unknown): payload is A1ReminderPayload {
  if (!payload || typeof payload !== 'object') return false;
  const item = payload as Partial<A1ReminderPayload>;
  return (
    item.version === 1 &&
    isValidId(item.deviceId, 16, 96) &&
    isValidId(item.deviceToken, 32, 160) &&
    isValidId(item.oneSignalSubscriptionId, 8, 160) &&
    isValidTimezone(item.timezone) &&
    typeof item.notificationsEnabled === 'boolean' &&
    isValidPreferences(item.preferences) &&
    Array.isArray(item.occurrences) &&
    item.occurrences.length <= MAX_OCCURRENCES &&
    item.occurrences.every(isValidOccurrence)
  );
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) throw new Error('payload_too_large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('payload_too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('invalid_json');
  }
}

function authToken(request: Request): string | null {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

function expiryIso(now = Date.now()): string {
  return new Date(now + DEVICE_TTL_DAYS * 86_400_000).toISOString();
}

function boolInt(value: boolean): number {
  return value ? 1 : 0;
}

async function syncDevice(request: Request, env: Env): Promise<Response> {
  const origin = allowedOrigin(request, env);
  if (!hasAllowedOrigin(request, env)) return error('origin_not_allowed', 403, origin);
  const token = authToken(request);
  if (!token || token.length < 32) return error('authorization_required', 401, origin);

  let payload: unknown;
  try {
    payload = await readJson(request);
  } catch (cause) {
    return error(cause instanceof Error && cause.message === 'payload_too_large' ? 'payload_too_large' : 'invalid_json', 400, origin);
  }
  if (!validatePayload(payload)) return error('invalid_reminder_payload', 400, origin);

  const now = new Date().toISOString();
  const tokenHash = await hashToken(token);
  const existing = await env.DB.prepare(
    'SELECT device_id, token_hash FROM devices WHERE device_id = ?1',
  ).bind(payload.deviceId).first<{ device_id: string; token_hash: string }>();

  if (existing && existing.token_hash !== tokenHash) return error('device_authorization_failed', 401, origin);

  const deviceStatement = env.DB.prepare(
    `INSERT INTO devices (
      device_id, token_hash, one_signal_subscription_id, timezone, notifications_enabled,
      midnight_need_attention, pre_class_need_attention, all_scheduled_digest,
      lead_minutes, last_sync_at, expires_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    ON CONFLICT(device_id) DO UPDATE SET
      token_hash = excluded.token_hash,
      one_signal_subscription_id = excluded.one_signal_subscription_id,
      timezone = excluded.timezone,
      notifications_enabled = excluded.notifications_enabled,
      midnight_need_attention = excluded.midnight_need_attention,
      pre_class_need_attention = excluded.pre_class_need_attention,
      all_scheduled_digest = excluded.all_scheduled_digest,
      lead_minutes = excluded.lead_minutes,
      last_sync_at = excluded.last_sync_at,
      expires_at = excluded.expires_at`,
  ).bind(
    payload.deviceId,
    tokenHash,
    payload.oneSignalSubscriptionId,
    payload.timezone,
    boolInt(payload.notificationsEnabled),
    boolInt(payload.preferences.midnightNeedAttention),
    boolInt(payload.preferences.preClassNeedAttention),
    boolInt(payload.preferences.allScheduledDigest),
    payload.preferences.leadMinutes,
    now,
    expiryIso(),
  );

  const statements: D1PreparedStatement[] = [
    deviceStatement,
    env.DB.prepare('DELETE FROM occurrences WHERE device_id = ?1').bind(payload.deviceId),
    ...payload.occurrences.map(occurrence => env.DB.prepare(
      `INSERT INTO occurrences (
        occurrence_id, device_id, local_date, start_minute, subject_label,
        category, needs_attention, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(
      occurrence.id,
      payload.deviceId,
      occurrence.localDate,
      occurrence.startMinute,
      occurrence.subjectLabel.trim(),
      occurrence.category,
      boolInt(occurrence.needsAttention),
      now,
    )),
  ];

  await env.DB.batch(statements);
  return json({ ok: true, expiresAt: expiryIso() }, 200, origin);
}

async function deleteDevice(request: Request, env: Env): Promise<Response> {
  const origin = allowedOrigin(request, env);
  if (!hasAllowedOrigin(request, env)) return error('origin_not_allowed', 403, origin);
  const token = authToken(request);
  if (!token) return error('authorization_required', 401, origin);
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!isValidId(deviceId, 16, 96)) return error('invalid_device_id', 400, origin);
  const tokenHash = await hashToken(token);
  const existing = await env.DB.prepare(
    'SELECT token_hash FROM devices WHERE device_id = ?1',
  ).bind(deviceId).first<{ token_hash: string }>();
  if (existing && existing.token_hash !== tokenHash) return error('device_authorization_failed', 401, origin);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM deliveries WHERE device_id = ?1').bind(deviceId),
    env.DB.prepare('DELETE FROM occurrences WHERE device_id = ?1').bind(deviceId),
    env.DB.prepare('DELETE FROM devices WHERE device_id = ?1').bind(deviceId),
  ]);
  return json({ ok: true }, 200, origin);
}

function localClock(timestamp: number, timezone: string): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const get = (type: string) => parts.find(part => part.type === type)?.value || '0';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

function cleanLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function isWithinFiveMinuteWindow(currentMinute: number, dueMinute: number): boolean {
  return currentMinute >= dueMinute && currentMinute < dueMinute + 5;
}

function isBeforeClassDue(currentMinute: number, startMinute: number, leadMinutes: number): boolean {
  return isWithinFiveMinuteWindow(currentMinute, startMinute - leadMinutes);
}

async function sendPush(env: Env, subscriptionId: string, heading: string, body: string, url: string, collapseId: string): Promise<string | null> {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY) throw new Error('onesignal_secrets_missing');
  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Key ${env.ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: env.ONESIGNAL_APP_ID,
      target_channel: 'push',
      include_subscription_ids: [subscriptionId],
      headings: { en: heading },
      contents: { en: body },
      url,
      collapse_id: collapseId,
    }),
  });
  if (!response.ok) throw new Error(`onesignal_${response.status}`);
  const result = await response.json() as { id?: string };
  return typeof result.id === 'string' ? result.id : null;
}

async function deliverIfNew(env: Env, device: DeviceRow, deliveryKey: string, heading: string, body: string, url: string): Promise<boolean> {
  const existing = await env.DB.prepare(
    'SELECT delivery_key FROM deliveries WHERE delivery_key = ?1',
  ).bind(deliveryKey).first<{ delivery_key: string }>();
  if (existing) return false;
  const messageId = await sendPush(env, device.one_signal_subscription_id, heading, body, url, deliveryKey);
  if (!messageId) return false;
  await env.DB.prepare(
    'INSERT OR IGNORE INTO deliveries (delivery_key, device_id, sent_at, onesignal_message_id) VALUES (?1, ?2, ?3, ?4)',
  ).bind(deliveryKey, device.device_id, new Date().toISOString(), messageId).run();
  return true;
}

function listNames(rows: OccurrenceRow[], limit = 6): string {
  const names = rows.map(row => cleanLabel(row.subjectLabel));
  const visible = names.slice(0, limit);
  const suffix = names.length > limit ? ` and ${names.length - limit} more` : '';
  return `${visible.join(', ')}${suffix}`;
}

async function processDevice(env: Env, device: DeviceRow, scheduledAt: number): Promise<void> {
  const clock = localClock(scheduledAt, device.timezone);
  const rows = await env.DB.prepare(
    `SELECT occurrence_id as id, device_id, local_date as localDate,
      start_minute as startMinute, subject_label as subjectLabel,
      category, needs_attention as needsAttention
     FROM occurrences WHERE device_id = ?1 AND local_date = ?2
     ORDER BY start_minute ASC`,
  ).bind(device.device_id, clock.date).all<OccurrenceRow>();
  const occurrences = rows.results || [];
  const url = ALLOWED_ORIGIN;

  if (clock.hour === 0 && clock.minute < 5 && device.midnight_need_attention) {
    const attention = occurrences.filter(item => Boolean(item.needsAttention));
    if (attention.length > 0) {
      await deliverIfNew(
        env,
        device,
        `${device.device_id}:midnight:${clock.date}`,
        'Attendenz: Need Attention',
        `${attention.length} subject${attention.length === 1 ? '' : 's'} need attention today: ${listNames(attention)}.`,
        url,
      );
    }
  }

  if (clock.hour === 0 && clock.minute < 5 && device.all_scheduled_digest && occurrences.length > 0) {
    await deliverIfNew(
      env,
      device,
      `${device.device_id}:digest:${clock.date}`,
      'Attendenz: Today’s Classes',
      `${occurrences.length} scheduled class${occurrences.length === 1 ? '' : 'es'} today: ${listNames(occurrences)}.`,
      url,
    );
  }

  if (device.pre_class_need_attention) {
    const due = occurrences.filter(item => {
      if (!Boolean(item.needsAttention)) return false;
      const currentMinute = clock.hour * 60 + clock.minute;
      return isBeforeClassDue(currentMinute, item.startMinute, device.lead_minutes);
    });
    for (const item of due) {
      await deliverIfNew(
        env,
        device,
        `${device.device_id}:before:${item.localDate}:${item.id}:${device.lead_minutes}`,
        'Attendenz: Class Reminder',
        `${cleanLabel(item.subjectLabel)} starts in ${device.lead_minutes} minutes.`,
        url,
      );
    }
  }
}

async function runScheduled(env: Env, scheduledAt: number): Promise<void> {
  const devices = await env.DB.prepare(
    `SELECT device_id, one_signal_id, timezone, notifications_enabled,
      midnight_need_attention, pre_class_need_attention,
      all_scheduled_digest, lead_minutes
     FROM devices WHERE notifications_enabled = 1 AND expires_at > ?1`,
  ).bind(new Date(scheduledAt).toISOString()).all<DeviceRow>();
  for (const device of devices.results || []) {
    try {
      await processDevice(env, device, scheduledAt);
    } catch (cause) {
      console.error('Reminder processing failed', device.device_id, cause instanceof Error ? cause.message : 'unknown_error');
    }
  }
  await env.DB.prepare('DELETE FROM deliveries WHERE sent_at < ?1').bind(new Date(scheduledAt - 60 * 86_400_000).toISOString()).run();
  await env.DB.prepare('DELETE FROM occurrences WHERE device_id IN (SELECT device_id FROM devices WHERE expires_at <= ?1)').bind(new Date(scheduledAt).toISOString()).run();
  await env.DB.prepare('DELETE FROM devices WHERE expires_at <= ?1').bind(new Date(scheduledAt).toISOString()).run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'Authorization, Content-Type',
      'access-control-allow-methods': 'POST, DELETE, OPTIONS',
      'access-control-max-age': '86400',
      'vary': 'Origin',
    } });
    const url = new URL(request.url);
    if (url.pathname === '/v1/device/reminder-state' && request.method === 'POST') return syncDevice(request, env);
    if (url.pathname === '/v1/device/reminder-state' && request.method === 'DELETE') return deleteDevice(request, env);
    return error('not_found', 404, origin);
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await runScheduled(env, controller.scheduledTime);
  },
};

export const __test = { localClock, validatePayload, isValidTimezone, isBeforeClassDue };
