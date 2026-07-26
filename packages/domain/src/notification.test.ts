import { expect, test } from 'bun:test';

import { defaultNotificationEnabled, notificationIdempotencyKey } from './notification';

test('notification defaults enable new episodes, extras, and new volumes only', () => {
  expect(defaultNotificationEnabled('new_episode')).toBe(true);
  expect(defaultNotificationEnabled('extra')).toBe(true);
  expect(defaultNotificationEnabled('new_volume')).toBe(true);
  expect(defaultNotificationEnabled('announcement')).toBe(false);
  expect(defaultNotificationEnabled('availability_changed')).toBe(false);
  expect(defaultNotificationEnabled('republication')).toBe(false);
});

test('notification idempotency key scopes delivery to user, event, channel, and kind', () => {
  expect(notificationIdempotencyKey('reader', 'event-1', 'in_app', 'new_episode')).toBe(
    'notification:reader:event-1:in_app:new_episode',
  );
});
