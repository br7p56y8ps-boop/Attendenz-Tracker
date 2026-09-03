import { buildPushPayload, type PushSubscription as WebPushSubscription, type VapidKeys } from '@block65/webcrypto-web-push';

const MAX_BODY_BYTES = 128 * 1024;
const MAX_OCCURRENCES = 500;
const DEVICE_TTL_DAYS = 45;
const DEFAULT_ALLOWED_ORIGIN = 'https://benz-attendance-tracker.pages.dev';
const CATEGORY_VALUES = new Set(['academic', 'clinical', 'sgt', 'ward']);
const DOCUMENTED_PUSH_ENDPOINTS = [
  'https://fcm.googleapis.com/',
  'https://updates.push.services.mozilla.com/',
  'https://wns2-par02p.notify.windows.com/',
  'https://web.push.apple.com/',
] as const;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitBuckets = new Map<string, { startedAt: number; count: number }>();

export interface Env {
  DB: D1Database;
  VAPID_SUBJECT: string;
  VAPID_SERVER_PUBLIC_KEY: string;
  VAPID_SERVER_PRIVATE_KEY: string;
  ALLOWED_ORIGIN?: string;
  RELEASE_VERSION?: string;
}

export interface A1Preferences {
  needAttentionSummary: boolean;
  needAttentionSubjects: boolean;
  safeToMiss: boolean;
  lastPlannedClassToday: boolean;
  firstClassOfDay: boolean;
  beforeClassWarnings: boolean;
  allScheduledClasses: boolean;
  unmarkedAttendanceToday: boolean;
  updateAvailable: boolean;
  leadMinutes: 15 | 30 | 60;
}

export interface ReminderOccurrence {
  id: string;
  localDate: string;
  startMinute: number;
  endMinute: number;
  subjectLabel: string;
  category: 'academic' | 'clinical' | 'sgt' | 'ward';
  needsAttention: boolean;
  attentionLevel: 'mustAttend' | 'needAttention' | 'safeToMiss' | 'onTrack' | 'neutral';
  attendanceMarked: boolean;
  isFinalForSubject: boolean;
}

export interface A1ReminderPayload {
  version: 3;
  appVersion: string;
  deviceId: string;
  deviceToken: string;
  subscription: WebPushSubscription;
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
  subscription_json: string;
  timezone: string;
  notifications_enabled: number;
  midnight_need_attention: number;
  final_class_today: number;
  first_class_today: number;
  pre_class_need_attention: number;
  all_scheduled_digest: number;
  lead_minutes: number;
  need_attention_subjects: number;
  safe_to_miss: number;
  unmarked_attendance_today: number;
  app_version: string;
  update_available: number;
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

const json = (body: unknown, status = 200, origin = DEFAULT_ALLOWED_ORIGIN): Response =>
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
  const configured = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  const requestOrigin = request.headers.get('Origin');
  return requestOrigin === configured ? configured : configured;
}

function hasAllowedOrigin(request: Request, env: Env): boolean {
  const configured = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
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
    Number.isInteger(item.endMinute) &&
    (item.endMinute as number) >= (item.startMinute as number) &&
    (item.endMinute as number) <= 1440 &&
    typeof item.subjectLabel === 'string' &&
    item.subjectLabel.trim().length > 0 &&
    item.subjectLabel.length <= 120 &&
    typeof item.category === 'string' &&
    CATEGORY_VALUES.has(item.category) &&
    typeof item.needsAttention === 'boolean' &&
    ['mustAttend', 'needAttention', 'safeToMiss', 'onTrack', 'neutral'].includes(item.attentionLevel as string) &&
    typeof item.attendanceMarked === 'boolean' &&
    typeof item.isFinalForSubject === 'boolean'
  );
}

function isDocumentedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && DOCUMENTED_PUSH_ENDPOINTS.some(prefix => endpoint.startsWith(prefix));
  } catch {
    return false;
  }
}

function isValidSubscription(value: unknown): value is WebPushSubscription {
  if (!value || typeof value !== 'object') return false;
  const subscription = value as Partial<WebPushSubscription>;
  return Boolean(
    typeof subscription.endpoint === 'string' && isDocumentedPushEndpoint(subscription.endpoint) && subscription.endpoint.length <= 2048 &&
    subscription.keys && typeof subscription.keys.p256dh === 'string' && subscription.keys.p256dh.length >= 40 && subscription.keys.p256dh.length <= 200 &&
    typeof subscription.keys.auth === 'string' && subscription.keys.auth.length >= 16 && subscription.keys.auth.length <= 200
  );
}

function isValidPreferences(value: unknown): value is A1Preferences {
  if (!value || typeof value !== 'object') return false;
  const prefs = value as Partial<A1Preferences>;
  return (
    typeof prefs.needAttentionSummary === 'boolean' &&
    typeof prefs.needAttentionSubjects === 'boolean' &&
    typeof prefs.safeToMiss === 'boolean' &&
    typeof prefs.lastPlannedClassToday === 'boolean' &&
    typeof prefs.firstClassOfDay === 'boolean' &&
    typeof prefs.beforeClassWarnings === 'boolean' &&
    typeof prefs.allScheduledClasses === 'boolean' &&
    typeof prefs.unmarkedAttendanceToday === 'boolean' &&
    typeof prefs.updateAvailable === 'boolean' &&
    (prefs.leadMinutes === 15 || prefs.leadMinutes === 30 || prefs.leadMinutes === 60)
  );
}

function validatePayload(payload: unknown): payload is A1ReminderPayload {
  if (!payload || typeof payload !== 'object') return false;
  const item = payload as Partial<A1ReminderPayload>;
  return (
    item.version === 3 &&
    typeof item.appVersion === 'string' && item.appVersion.length > 0 && item.appVersion.length <= 32 &&
    isValidId(item.deviceId, 16, 96) &&
    isValidId(item.deviceToken, 32, 160) &&
    isValidSubscription(item.subscription) &&
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

function clientAddress(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
}

function consumeRateLimit(request: Request, deviceId?: string): boolean {
  const now = Date.now();
  const keys = [`ip:${clientAddress(request)}`, deviceId ? `device:${deviceId}` : null].filter((key): key is string => Boolean(key));
  for (const key of keys) {
    const existing = rateLimitBuckets.get(key);
    if (!existing || now - existing.startedAt >= RATE_LIMIT_WINDOW_MS) rateLimitBuckets.set(key, { startedAt: now, count: 1 });
    else if (existing.count >= RATE_LIMIT_MAX_REQUESTS) return false;
    else existing.count += 1;
  }
  return true;
}

async function syncDevice(request: Request, env: Env): Promise<Response> {
  const origin = allowedOrigin(request, env);
  if (!hasAllowedOrigin(request, env)) return error('origin_not_allowed', 403, origin);
  const token = authToken(request);
  if (!token || token.length < 32) return error('authorization_required', 401, origin);
  if (!consumeRateLimit(request)) return error('rate_limited', 429, origin);

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
      device_id, token_hash, subscription_json, timezone, notifications_enabled,
      midnight_need_attention, final_class_today, first_class_today,
      pre_class_need_attention, all_scheduled_digest,
      lead_minutes, need_attention_subjects, safe_to_miss, unmarked_attendance_today,
      app_version, update_available, last_sync_at, expires_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
    ON CONFLICT(device_id) DO UPDATE SET
      token_hash = excluded.token_hash,
      subscription_json = excluded.subscription_json,
      timezone = excluded.timezone,
      notifications_enabled = excluded.notifications_enabled,
      midnight_need_attention = excluded.midnight_need_attention,
      final_class_today = excluded.final_class_today,
      first_class_today = excluded.first_class_today,
      pre_class_need_attention = excluded.pre_class_need_attention,
      all_scheduled_digest = excluded.all_scheduled_digest,
      lead_minutes = excluded.lead_minutes,
      need_attention_subjects = excluded.need_attention_subjects,
      safe_to_miss = excluded.safe_to_miss,
      unmarked_attendance_today = excluded.unmarked_attendance_today,
      app_version = excluded.app_version,
      update_available = excluded.update_available,
      last_sync_at = excluded.last_sync_at,
      expires_at = excluded.expires_at`,
    ).bind(
    payload.deviceId,
    tokenHash,
    JSON.stringify(payload.subscription),
    payload.timezone,
    boolInt(payload.notificationsEnabled),
    boolInt(payload.preferences.needAttentionSummary),
    boolInt(payload.preferences.lastPlannedClassToday),
    boolInt(payload.preferences.firstClassOfDay),
    boolInt(payload.preferences.beforeClassWarnings),
    boolInt(payload.preferences.allScheduledClasses),
    payload.preferences.leadMinutes,
    boolInt(payload.preferences.needAttentionSubjects),
    boolInt(payload.preferences.safeToMiss),
    boolInt(payload.preferences.unmarkedAttendanceToday),
    payload.appVersion,
    boolInt(payload.preferences.updateAvailable),
    now,
    expiryIso(),
  );

  const statements: D1PreparedStatement[] = [
    deviceStatement,
    env.DB.prepare('DELETE FROM occurrences WHERE device_id = ?1').bind(payload.deviceId),
    ...payload.occurrences.map(occurrence => env.DB.prepare(
      `INSERT INTO occurrences (
        occurrence_id, device_id, local_date, start_minute, subject_label,
        category, needs_attention, attention_level, attendance_marked, end_minute, is_final_for_subject, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    ).bind(
      occurrence.id,
      payload.deviceId,
      occurrence.localDate,
      occurrence.startMinute,
      occurrence.subjectLabel.trim(),
      occurrence.category,
      boolInt(occurrence.needsAttention),
      occurrence.attentionLevel,
      boolInt(occurrence.attendanceMarked),
      occurrence.endMinute,
      boolInt(occurrence.isFinalForSubject),
      now,
    )),
  ];

  await env.DB.batch(statements);
  return json({ ok: true, expiresAt: expiryIso(), occurrenceCount: payload.occurrences.length }, 200, origin);
}

async function testDevice(request: Request, env: Env): Promise<Response> {
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
  if (!payload || typeof payload !== 'object') return error('invalid_test_payload', 400, origin);
  const item = payload as { deviceId?: unknown };
  if (!isValidId(item.deviceId, 16, 96)) return error('invalid_test_payload', 400, origin);
  if (!consumeRateLimit(request, item.deviceId)) return error('rate_limited', 429, origin);

  const existing = await env.DB.prepare(
    'SELECT device_id, token_hash, subscription_json FROM devices WHERE device_id = ?1',
  ).bind(item.deviceId).first<{ device_id: string; token_hash: string; subscription_json: string }>();
  if (!existing) return error('device_not_registered', 404, origin);
  const tokenHash = await hashToken(token);
  if (existing.token_hash !== tokenHash) return error('device_authorization_failed', 401, origin);
  let subscription: WebPushSubscription;
  try { subscription = JSON.parse(existing.subscription_json) as WebPushSubscription; } catch { return error('subscription_invalid', 409, origin); }

  const messageId = await sendPush(
    env,
    subscription,
    'Test Notification',
    'System Notifications are enabled on this device.',
    DEFAULT_ALLOWED_ORIGIN,
    `${existing.device_id}:remote-test:${Date.now()}`,
  );
  return json({ ok: true, sent: Boolean(messageId) }, 200, origin);
}

async function deleteDevice(request: Request, env: Env): Promise<Response> {
  const origin = allowedOrigin(request, env);
  if (!hasAllowedOrigin(request, env)) return error('origin_not_allowed', 403, origin);
  const token = authToken(request);
  if (!token) return error('authorization_required', 401, origin);
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!isValidId(deviceId, 16, 96)) return error('invalid_device_id', 400, origin);
  if (!consumeRateLimit(request, deviceId)) return error('rate_limited', 429, origin);
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

function cleanLabel(value: string, category: OccurrenceRow['category']): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const suffixMatch = normalized.match(/\s+\((Lecture\/Integrated|Lecture|Integrated|Clinical|SGT)\)$/i);
  const base = (suffixMatch ? normalized.slice(0, suffixMatch.index) : normalized).trim().slice(0, 120);
  const existingKind = suffixMatch?.[1].toLowerCase();
  const kind = category === 'sgt'
    ? 'SGT'
    : category === 'clinical' || category === 'ward'
      ? 'Clinical'
      : existingKind === 'integrated'
        ? 'Integrated'
        : 'Lecture/Integrated';
  return `${base} (${kind})`;
}

function formatMinute(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function nextLocalDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function isWithinFiveMinuteWindow(currentMinute: number, dueMinute: number): boolean {
  return currentMinute >= dueMinute && currentMinute < dueMinute + 5;
}

function isBeforeClassDue(currentMinute: number, startMinute: number, leadMinutes: number): boolean {
  return isWithinFiveMinuteWindow(currentMinute, startMinute - leadMinutes);
}

async function sendPush(env: Env, subscription: WebPushSubscription, heading: string, body: string, url: string, collapseId: string): Promise<string | null> {
  if (!env.VAPID_SUBJECT || !env.VAPID_SERVER_PUBLIC_KEY || !env.VAPID_SERVER_PRIVATE_KEY) {
    throw new Error('vapid_secrets_missing');
  }
  const vapid: VapidKeys = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_SERVER_PUBLIC_KEY,
    privateKey: env.VAPID_SERVER_PRIVATE_KEY,
  };
  const payload = await buildPushPayload({
    data: JSON.stringify({ title: heading, body, url }),
    options: { ttl: 300, urgency: 'high', topic: collapseId.slice(0, 32) },
  }, subscription, vapid);
  const response = await fetch(subscription.endpoint, payload as RequestInit);
  if (!response.ok) throw new Error(`push_${response.status}`);
  return crypto.randomUUID();
}

async function deliverIfNew(env: Env, device: DeviceRow, deliveryKey: string, heading: string, body: string, url: string): Promise<boolean> {
  const existing = await env.DB.prepare(
    'SELECT delivery_key FROM deliveries WHERE delivery_key = ?1',
  ).bind(deliveryKey).first<{ delivery_key: string }>();
  if (existing) return false;
  let subscription: WebPushSubscription;
  try { subscription = JSON.parse(device.subscription_json) as WebPushSubscription; } catch { throw new Error('subscription_invalid'); }
  const messageId = await sendPush(env, subscription, heading, body, url, deliveryKey);
  if (!messageId) return false;
  await env.DB.prepare(
    'INSERT OR IGNORE INTO deliveries (delivery_key, device_id, sent_at, push_message_id) VALUES (?1, ?2, ?3, ?4)',
  ).bind(deliveryKey, device.device_id, new Date().toISOString(), messageId).run();
  return true;
}

function listNames(rows: OccurrenceRow[], limit = 6): string {
  const names = [...new Set(rows.map(row => cleanLabel(row.subjectLabel, row.category)))];
  const visible = names.slice(0, limit);
  const suffix = names.length > limit ? ` and ${names.length - limit} more` : '';
  return `${visible.join(', ')}${suffix}`;
}

function listLeadNames(rows: OccurrenceRow[], limit = 6): string {
  const names = [...new Set(rows.map(row => cleanLabel(row.subjectLabel, row.category)))];
  const clinicalCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.category !== 'clinical') continue;
    const label = cleanLabel(row.subjectLabel, row.category);
    clinicalCounts.set(label, (clinicalCounts.get(label) || 0) + 1);
  }
  const visible = names.slice(0, limit).map(name => {
    const count = clinicalCounts.get(name) || 0;
    return count >= 2 ? `${name} — Attend BOTH` : count === 1 ? `${name} — Attend ONE of them` : name;
  });
  const suffix = names.length > limit ? ` and ${names.length - limit} more` : '';
  return `${visible.join(', ')}${suffix}`;
}

async function processDevice(env: Env, device: DeviceRow, scheduledAt: number): Promise<void> {
  const clock = localClock(scheduledAt, device.timezone);
  const midnightWindow = (clock.hour === 23 && clock.minute >= 30) || (clock.hour === 0 && clock.minute < 5);
  // Midnight reminders always describe tomorrow, including the first few
  // minutes after midnight. Lead-time reminders are handled separately.
  const scheduleDate = midnightWindow ? nextLocalDate(clock.date) : clock.date;
  const rows = await env.DB.prepare(
    `SELECT occurrence_id as id, device_id, local_date as localDate,
      start_minute as startMinute, end_minute as endMinute, subject_label as subjectLabel,
      category, needs_attention as needsAttention, attention_level as attentionLevel,
      attendance_marked as attendanceMarked,
      is_final_for_subject as isFinalForSubject
     FROM occurrences WHERE device_id = ?1 AND local_date = ?2
     ORDER BY start_minute ASC`,
  ).bind(device.device_id, scheduleDate).all<OccurrenceRow>();
  const occurrences = rows.results || [];
  const url = DEFAULT_ALLOWED_ORIGIN;

  const currentMinute = clock.hour * 60 + clock.minute;

  if (midnightWindow) {
    const mustAttend = device.midnight_need_attention ? occurrences.filter(item => item.attentionLevel === 'mustAttend') : [];
    const needAttention = device.need_attention_subjects ? occurrences.filter(item => item.attentionLevel === 'needAttention') : [];
    const finalClasses = device.final_class_today ? occurrences.filter(item => item.isFinalForSubject) : [];
    const first = device.first_class_today && occurrences.length > 0 ? occurrences[0] : null;
    const digest = device.all_scheduled_digest && occurrences.length > 0 ? occurrences : [];

    const hasUrgent = mustAttend.length > 0 || needAttention.length > 0 || finalClasses.length > 0;
    const hasInfo = first || digest.length > 0;

    if (hasUrgent) {
      const parts: string[] = [];
      if (mustAttend.length > 0) parts.push(`Must Attend: ${listNames(mustAttend)}`);
      if (needAttention.length > 0) parts.push(`Need Attention: ${listNames(needAttention)}`);
      if (finalClasses.length > 0) parts.push(`Upcoming Last Planned Class: ${listNames(finalClasses)}`);
      const body = parts.join('. ') + '.';
      await deliverIfNew(env, device, `${device.device_id}:urgent-midnight:${scheduleDate}`, 'Urgent Schedule Alert', body, url);
    } else if (hasInfo) {
      const body = first ? `First Upcoming Class: ${cleanLabel(first.subjectLabel, first.category)} at ${formatMinute(first.startMinute)}.` : `Upcoming: ${listNames(digest)}.`;
      await deliverIfNew(env, device, `${device.device_id}:info-midnight:${scheduleDate}`, 'Upcoming Schedule', body, url);
    }
  }

  const latestEndMinute = occurrences.reduce((latest, item) => Math.max(latest, item.endMinute), 0);
  const unmarkedReminderMinute = latestEndMinute >= 21 * 60 ? 23 * 60 : 21 * 60 + 30;
  if (scheduleDate === clock.date && device.unmarked_attendance_today && isWithinFiveMinuteWindow(currentMinute, unmarkedReminderMinute)) {
    const unmarked = occurrences.filter(item => item.startMinute < currentMinute && !item.attendanceMarked && !item.isFinalForSubject);
    if (unmarked.length > 0) {
      await deliverIfNew(env, device, `${device.device_id}:unmarked:${clock.date}`, 'Attendance Still Unmarked', `${unmarked.length} Class${unmarked.length === 1 ? '' : 'es'} from today still need an attendance status: ${listNames(unmarked)}.`, url);
    }
  }

  if (!midnightWindow && device.pre_class_need_attention) {
    const due = occurrences.filter(item => isBeforeClassDue(currentMinute, item.startMinute, device.lead_minutes));
    const dueMust = due.filter(item => item.attentionLevel === 'mustAttend');
    const dueNeed = device.need_attention_subjects ? due.filter(item => item.attentionLevel === 'needAttention') : [];
    const dueSafe = device.safe_to_miss ? due.filter(item => item.attentionLevel === 'safeToMiss') : [];
    for (const item of dueMust) {
      await deliverIfNew(env, device, `${device.device_id}:before-must:${clock.date}:${item.id}:${device.lead_minutes}`, 'Must Attend', `${listLeadNames([item])} start in ${device.lead_minutes} minutes. Attend these Classes to protect your attendance percentage.`, url);
    }
    for (const item of dueNeed) {
      await deliverIfNew(env, device, `${device.device_id}:before-attention:${clock.date}:${item.id}:${device.lead_minutes}`, 'Need Attention', `${listLeadNames([item])} start in ${device.lead_minutes} minutes. Your attendance is at the preferred percentage without the recommended safety margin.`, url);
    }
    for (const item of dueSafe) {
      await deliverIfNew(env, device, `${device.device_id}:before-safe:${clock.date}:${item.id}:${device.lead_minutes}`, 'Safe to Miss a Class', `${listLeadNames([item])} start in ${device.lead_minutes} minutes. Missing these Classes would keep you at or above the preferred percentage.`, url);
    }
  }
}

async function runScheduled(env: Env, scheduledAt: number): Promise<void> {
  const devices = await env.DB.prepare(
    `SELECT device_id, subscription_json, timezone, notifications_enabled,
            midnight_need_attention, final_class_today, first_class_today,
      pre_class_need_attention, all_scheduled_digest, lead_minutes,
      need_attention_subjects, safe_to_miss, unmarked_attendance_today,
      app_version, update_available
      FROM devices WHERE notifications_enabled = 1 AND expires_at > ?1`,
  ).bind(new Date(scheduledAt).toISOString()).all<DeviceRow>();
  for (const device of devices.results || []) {
    try {
      const releaseVersion = env.RELEASE_VERSION || '1.6.5';
      if (device.update_available && device.app_version !== releaseVersion) {
        await deliverIfNew(env, device, `${device.device_id}:update-available:${releaseVersion}`, 'Update Available', `A new version ${releaseVersion} is ready. Open the app to review and update.`, DEFAULT_ALLOWED_ORIGIN);
      }
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
    if (url.pathname === '/v1/device/test' && request.method === 'POST') return testDevice(request, env);
    if (url.pathname === '/v1/device/reminder-state' && request.method === 'DELETE') return deleteDevice(request, env);
    return error('not_found', 404, origin);
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await runScheduled(env, controller.scheduledTime);
  },
};

export const __test = { localClock, validatePayload, isValidTimezone, isBeforeClassDue, formatMinute, isWithinFiveMinuteWindow };
