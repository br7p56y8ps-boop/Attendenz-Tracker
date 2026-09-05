import assert from 'node:assert/strict';
import { isAllowedBackupKey, validateBackupPayload } from '../src/utils/dataTransferSecurity.ts';

assert.equal(isAllowedBackupKey('attendance_tracker_subjects'), true);
assert.equal(isAllowedBackupKey('att_pwa_update_ready'), false);
assert.equal(isAllowedBackupKey('att_pending_update_restore'), false);
assert.deepEqual(
  validateBackupPayload({
    attendance_tracker_subjects: '{"Anatomy":{}}',
    att_pwa_update_ready: 'true',
  }),
  { attendance_tracker_subjects: '{"Anatomy":{}}' },
);
assert.throws(
  () => validateBackupPayload({ unsupported_secret: 'value' }),
  /no supported Attendenz data|Unsupported backup field/,
);

console.log('backup/restore security tests passed');
