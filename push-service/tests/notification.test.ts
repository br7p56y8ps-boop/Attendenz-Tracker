import assert from 'node:assert/strict';
import { __test } from '../src/index.ts';

const { cleanLabel, isBeforeClassDue, isValidNightlyReminderTime, parseReminderTime, isWithinFiveMinuteWindow, isWithinNightlyWindow, nightlyScheduleDate } = __test;

assert.equal(isValidNightlyReminderTime('22:30'), true);
assert.equal(isValidNightlyReminderTime('23:59'), true);
assert.equal(isValidNightlyReminderTime('00:00'), true);
assert.equal(isValidNightlyReminderTime('02:00'), true);
assert.equal(isValidNightlyReminderTime('22:29'), false);
assert.equal(isValidNightlyReminderTime('02:01'), false);
assert.equal(isValidNightlyReminderTime('24:00'), false);
assert.equal(parseReminderTime('23:30'), 1410);
assert.equal(isWithinFiveMinuteWindow(1410, 1410), true);
assert.equal(isWithinNightlyWindow(1410, 1410), true);
assert.equal(isWithinNightlyWindow(1414, 1410), true);
assert.equal(isWithinNightlyWindow(300, 1410), false);
assert.equal(isWithinNightlyWindow(0, 30), false);
assert.equal(isWithinNightlyWindow(30, 30), true);
assert.equal(nightlyScheduleDate('2026-09-06', 30), '2026-09-06');
assert.equal(nightlyScheduleDate('2026-09-06', 120), '2026-09-06');
assert.equal(nightlyScheduleDate('2026-09-06', 1350), '2026-09-07');
assert.equal(isWithinFiveMinuteWindow(1414, 1410), true);
assert.equal(isWithinFiveMinuteWindow(1415, 1410), false);

// Lead minutes remain individual class timing, not nightly-batch timing.
assert.equal(isBeforeClassDue(690, 720, 30), true);
assert.equal(isBeforeClassDue(1410, 720, 30), false);

assert.equal(cleanLabel('Anatomy (Lecture)', 'academic'), 'Anatomy (Lecture)');
assert.equal(cleanLabel('Anatomy (Integrated)', 'academic'), 'Anatomy (Integrated)');
assert.equal(cleanLabel('Anatomy (Lecture/Integrated)', 'academic'), 'Anatomy (Lecture)');
assert.equal(cleanLabel('Anatomy', 'academic'), 'Anatomy (Lecture)');
assert.equal(cleanLabel('Medicine (Clinical)', 'clinical'), 'Medicine (Clinical)');
assert.equal(cleanLabel('Ward Round', 'ward'), 'Ward Round (Clinical)');
assert.equal(cleanLabel('Small Group Teaching', 'sgt'), 'Small Group Teaching (SGT)');

console.log('notification regression tests passed');


const { processDevice, buildNotificationData, localClock } = __test;
assert.deepEqual(buildNotificationData('Need Attention Reminder', 'Medicine (Lecture) starts in 30 minutes.\nThis class needs extra attention to help you stay on track.', '/'), {
  title: 'Need Attention Reminder',
  body: 'Medicine (Lecture) starts in 30 minutes.\nThis class needs extra attention to help you stay on track.',
  url: '/',
});
assert.deepEqual(buildNotificationData('Attendance & Risk Reminder', 'Must Attend: Anatomy (Lecture)\nNeed Attention: Medicine (Lecture)', '/'), {
  title: 'Attendance & Risk Reminder',
  body: 'Must Attend: Anatomy (Lecture)\nNeed Attention: Medicine (Lecture)',
  url: '/',
});

const base64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const generatedVapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const vapidJwk = await crypto.subtle.exportKey('jwk', generatedVapid.privateKey);
const vapidPublic = new Uint8Array([4, ...Buffer.from(vapidJwk.x!, 'base64url'), ...Buffer.from(vapidJwk.y!, 'base64url')]);
const generatedClient = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const clientJwk = await crypto.subtle.exportKey('jwk', generatedClient.publicKey);
const clientPublic = new Uint8Array([4, ...Buffer.from(clientJwk.x!, 'base64url'), ...Buffer.from(clientJwk.y!, 'base64url')]);
const deliveryKeys = new Set<string>();
let pushCount = 0;
const db = {
  prepare(query: string) {
    let values: unknown[] = [];
    return {
      bind(...next: unknown[]) { values = next; return this; },
      async first() { return query.includes('FROM deliveries') && deliveryKeys.has(String(values[0])) ? { delivery_key: values[0] } : null; },
      async all() { return query.includes('FROM occurrences') ? { results: [{
        id: 'medicine-2026-09-06', device_id: 'device-test-123456', localDate: '2026-09-06', startMinute: 150, endMinute: 180,
        subjectLabel: 'Medicine (Lecture)', category: 'academic', needsAttention: true, attentionLevel: 'needAttention',
        attendanceMarked: false, status: 'unmarked', isFinalForSubject: false,
      }, {
        id: 'medicine-2026-09-07', device_id: 'device-test-123456', localDate: '2026-09-07', startMinute: 600, endMinute: 630,
        subjectLabel: 'Medicine (Lecture)', category: 'academic', needsAttention: true, attentionLevel: 'needAttention',
        attendanceMarked: false, status: 'unmarked', isFinalForSubject: false,
      }, {
        id: 'holiday-2026-09-07', device_id: 'device-test-123456', localDate: '2026-09-07', startMinute: 700, endMinute: 730,
        subjectLabel: 'Holiday Subject', category: 'academic', needsAttention: true, attentionLevel: 'mustAttend',
        attendanceMarked: false, status: 'off', isFinalForSubject: false,
      }, {
        id: 'completed-2026-09-07', device_id: 'device-test-123456', localDate: '2026-09-07', startMinute: 800, endMinute: 830,
        subjectLabel: 'Completed Subject', category: 'academic', needsAttention: true, attentionLevel: 'mustAttend',
        attendanceMarked: true, status: 'completed', isFinalForSubject: false,
      }] } : { results: [] }; },
      async run() { if (query.includes('INSERT OR IGNORE INTO deliveries')) deliveryKeys.add(String(values[0])); return {}; },
    };
  },
  async batch() { return []; },
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { pushCount += 1; return new Response('', { status: 201 }); };
try {
  const device = {
    device_id: 'device-test-123456', subscription_json: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', expirationTime: null, keys: { p256dh: base64Url(clientPublic), auth: base64Url(crypto.getRandomValues(new Uint8Array(16))) } }),
    timezone: 'America/New_York', notifications_enabled: 1, midnight_need_attention: 1, final_class_today: 0, first_class_today: 1,
    pre_class_need_attention: 0, all_scheduled_digest: 0, lead_minutes: 30, nightly_reminder_time: '23:30', need_attention_subjects: 1,
    safe_to_miss: 0, unmarked_attendance_today: 0, app_version: '1.6.8', update_available: 0,
  };
  assert.deepEqual(localClock(Date.parse('2026-09-07T03:30:00Z'), 'America/New_York'), { date: '2026-09-06', hour: 23, minute: 30 });
  await processDevice({ DB: db, VAPID_SUBJECT: 'https://benz-attendance-tracker.pages.dev', VAPID_SERVER_PUBLIC_KEY: base64Url(vapidPublic), VAPID_SERVER_PRIVATE_KEY: vapidJwk.d! }, device, Date.parse('2026-09-07T03:30:00Z'));
  assert.equal(pushCount, 2, 'nightly attendance and daily schedule groups should send separate pushes');
  await processDevice({ DB: db, VAPID_SUBJECT: 'https://benz-attendance-tracker.pages.dev', VAPID_SERVER_PUBLIC_KEY: base64Url(vapidPublic), VAPID_SERVER_PRIVATE_KEY: vapidJwk.d! }, device, Date.parse('2026-09-07T08:00:00Z'));
  assert.equal(pushCount, 2, 'nightly batch should not send after the 4 AM cutoff');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('nightly delivery simulation passed');
