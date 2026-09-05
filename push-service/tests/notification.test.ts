import assert from 'node:assert/strict';
import { __test } from '../src/index.ts';

const { cleanLabel, isBeforeClassDue, isValidNightlyReminderTime, parseReminderTime, isWithinFiveMinuteWindow, isWithinNightlyWindow } = __test;

assert.equal(isValidNightlyReminderTime('23:30'), true);
assert.equal(isValidNightlyReminderTime('00:00'), true);
assert.equal(isValidNightlyReminderTime('24:00'), false);
assert.equal(parseReminderTime('23:30'), 1410);
assert.equal(isWithinFiveMinuteWindow(1410, 1410), true);
assert.equal(isWithinNightlyWindow(1410, 1410), true);
assert.equal(isWithinNightlyWindow(1424, 1410), true);
assert.equal(isWithinNightlyWindow(1425, 1410), false);
assert.equal(isWithinNightlyWindow(0, 1410), false);
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
