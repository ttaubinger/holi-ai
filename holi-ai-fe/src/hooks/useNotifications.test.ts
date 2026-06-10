import { renderHook, waitFor } from '@testing-library/react';
import { useNotifications, Cron } from './useNotifications';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const setupBeforeEach = () => {
  window.localStorage.clear();
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
  global.Notification = Object.assign(vi.fn(), {
    requestPermission: vi.fn().mockResolvedValue('granted')
  }) as unknown as typeof Notification;
};

const setupHook = (crons: Cron[], deleteCron: any, onDeepLink?: any) => {
  return renderHook(() => useNotifications(crons, deleteCron, onDeepLink));
};

const getTestCrons = (): Cron[] => [{
  cron_id: '1',
  title: 'Test',
  schedule: '30 8 * * *',
  cron_expression: '30 8 * * *',
  is_active: true
}];

const getOneOffCron = (): Cron[] => [{
  cron_id: '1',
  title: 'Test One Off',
  schedule: 'today at 8:30',
  cron_expression: '30 8 15 6 *',
  is_active: true
}];

const testRendersEmpty = () => {
  const { result } = setupHook([], vi.fn());
  expect(result.current).toBeUndefined();
};

const testWebSchedulingActive = async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2023, 5, 15, 8, 30));
  setupHook(getTestCrons(), vi.fn());
  expect(global.Notification).toHaveBeenCalledWith('Test', {
    body: 'Holistic Coach Routine'
  });
  vi.useRealTimers();
};

const testWebSchedulingOneOff = async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2023, 5, 15, 8, 30));
  const mockDelete = vi.fn();
  setupHook(getOneOffCron(), mockDelete);
  expect(global.Notification).toHaveBeenCalledWith('Test One Off', {
    body: 'Holistic Coach Routine'
  });
  expect(mockDelete).toHaveBeenCalledWith('1');
  vi.useRealTimers();
};

const testNoWebTriggerMismatch = async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2023, 5, 15, 9, 30));
  setupHook(getTestCrons(), vi.fn());
  expect(global.Notification).not.toHaveBeenCalled();
  vi.useRealTimers();
};

const testNoTriggerSameMinute = async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2023, 5, 15, 8, 30));
  setupHook(getTestCrons(), vi.fn());
  expect(global.Notification).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(10000);
  expect(global.Notification).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
};

const mockNativePlatform = () => {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
};

const getDeepLinkCron = (): Cron[] => [{
  cron_id: 'c1',
  title: 'Test',
  schedule: '30 8 * * *',
  cron_expression: '30 8 * * *',
  is_active: true,
  requires_logging: true
}];

const setupDeepLinkNative = () => {
  mockNativePlatform();
  let capturedCallback: any;
  vi.mocked(LocalNotifications.addListener).mockImplementation(async (_e, cb) => {
    capturedCallback = cb;
    return { remove: vi.fn() };
  });
  vi.mocked(LocalNotifications.getPending).mockResolvedValue({
    notifications: [{ id: 999 } as any]
  });
  return () => capturedCallback;
};

const testNativeSchedulingDeepLink = async () => {
  const getCallback = setupDeepLinkNative();
  const mockDeepLink = vi.fn();
  setupHook(getDeepLinkCron(), vi.fn(), mockDeepLink);
  await waitFor(() => {
    expect(LocalNotifications.cancel).toHaveBeenCalled();
    expect(LocalNotifications.schedule).toHaveBeenCalled();
  });
  const cb = getCallback();
  if (cb) {
    cb({ notification: { extra: { route: 'activities', cron_id: 'c1' } } });
    expect(mockDeepLink).toHaveBeenCalledWith('activities', { route: 'activities', cron_id: 'c1' });
  }
};

const getInvalidCron = (): Cron[] => [{
  cron_id: 'c1',
  title: 'Test',
  schedule: 'invalid',
  cron_expression: 'invalid cron',
  is_active: true
}];

const testInvalidCronExpression = async () => {
  mockNativePlatform();
  setupHook(getInvalidCron(), vi.fn());
  await waitFor(() => {
    expect(LocalNotifications.getPending).toHaveBeenCalled();
  });
  expect(LocalNotifications.schedule).not.toHaveBeenCalled();
};

const testMissingNotificationWeb = () => {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
  const origNotification = global.Notification;
  delete (global as any).Notification;
  const { unmount } = setupHook(getTestCrons(), vi.fn());
  expect(unmount).not.toThrow();
  global.Notification = origNotification;
};

const testNativeUnmountListener = async () => {
  mockNativePlatform();
  const mockRemove = vi.fn();
  vi.mocked(LocalNotifications.addListener).mockResolvedValue({
    remove: mockRemove
  });
  const { unmount } = setupHook(getTestCrons(), vi.fn());
  unmount();
  await waitFor(() => expect(mockRemove).toHaveBeenCalled());
};

const setupDeepLinkNoCallbackNative = () => {
  mockNativePlatform();
  let capturedCallback: any;
  vi.mocked(LocalNotifications.addListener).mockImplementation(async (_e, cb) => {
    capturedCallback = cb;
    return { remove: vi.fn() };
  });
  return () => capturedCallback;
};

const testNativeDeepLinkMissingCallback = async () => {
  const getCallback = setupDeepLinkNoCallbackNative();
  setupHook(getTestCrons(), vi.fn());
  let cb: any;
  await waitFor(() => {
    cb = getCallback();
    expect(cb).toBeDefined();
  });
  expect(() => cb({ notification: { extra: { route: 'act' } } })).not.toThrow();
  expect(() => cb({ notification: { extra: {} } })).not.toThrow();
};

const registerTests1 = () => {
  beforeEach(setupBeforeEach);
  afterEach(() => vi.clearAllMocks());
  it('renders without crashing with empty crons', testRendersEmpty);
  it('handles web scheduling for active cron match', testWebSchedulingActive);
  it('handles web scheduling for one-off cron deletion', testWebSchedulingOneOff);
  it('does not trigger web cron if time does not match', testNoWebTriggerMismatch);
  it('does not trigger web cron if previously fired this minute', testNoTriggerSameMinute);
  it('handles native scheduling for deep link', testNativeSchedulingDeepLink);
};

const registerTests2 = () => {
  it('ignores invalid cron expressions for native scheduling', testInvalidCronExpression);
  it('safely handles missing Notification API in web', testMissingNotificationWeb);
  it('unmounts native listener correctly', testNativeUnmountListener);
  it('handles native deep link when route or callback is missing', testNativeDeepLinkMissingCallback);
};

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false)
  }
}));

describe('useNotifications part 1', registerTests1);
describe('useNotifications part 2', registerTests2);
