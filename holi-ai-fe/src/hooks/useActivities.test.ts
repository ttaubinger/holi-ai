import { renderHook, waitFor, act } from '@testing-library/react';
import { useActivities } from './useActivities';
import { describe, it, expect, beforeEach } from 'vitest';
import { getMockFetch } from '../../vitest.setup';

let mockFetch: any;

const setupHook = (userId: string) => {
  return renderHook(() => useActivities(userId));
};

const resetMocks = () => {
  mockFetch = getMockFetch();
  mockFetch.mockReset();
  window.localStorage.clear();
};

const setupFetchLogsMock = () => {
  const data = { logs: [{ activity_title: 'Read 10 pages', log_type: 'boolean', boolean_value: true }] };
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(data) });
};

const testFetchLogs = async () => {
  setupFetchLogsMock();
  const { result } = setupHook('usr_1');
  await act(async () => {
    await result.current.fetchLogs();
  });
  await waitFor(() => {
    expect(result.current.logs).toHaveLength(1);
  });
  expect(result.current.logs[0]!.activity_title).toBe('Read 10 pages');
};

const handleActivitiesLogsUrl = (url: string) => {
  const data = { logs: [{ activity_title: 'Drink Water', log_type: 'number', number_value: 1 }] };
  if (url.includes('/activities/logs')) {
    return { ok: true, json: () => Promise.resolve(data) };
  }
  return null;
};

const createSubmitLogSuccessMock = () => {
  return async (url: string) => {
    const logsRes = handleActivitiesLogsUrl(url);
    if (logsRes) return logsRes;
    if (url.includes('/activities/log')) return { ok: true };
    return { ok: false, status: 404 };
  };
};

const createEmptyLogsMock = () => {
  return async (url: string) => {
    if (url.includes('/activities/logs')) return { ok: true, json: () => Promise.resolve({ logs: [] }) };
    if (url.includes('/activities/log')) return { ok: true };
    return { ok: false, status: 404 };
  };
};

const doSubmitLog = async (result: any) => {
  return await result.current.submitLog({
    activity_title: 'Drink Water',
    log_type: 'number',
    number_value: 1
  });
};

const testSubmitLog = async () => {
  mockFetch.mockImplementation(createEmptyLogsMock());
  const { result } = setupHook('usr_1');
  await waitFor(() => expect(result.current.logs).toEqual([]));
  mockFetch.mockImplementation(createSubmitLogSuccessMock());
  let success = false;
  await act(async () => {
    success = await doSubmitLog(result);
  });
  expect(success).toBe(true);
  await waitFor(() => {
    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0]!.activity_title).toBe('Drink Water');
  });
};

const createSubmitLogErrorMock = () => {
  return async (url: string) => {
    if (url.includes('/activities/logs')) return { ok: true, json: () => Promise.resolve({ logs: [] }) };
    if (url.includes('/activities/log')) return { ok: false, status: 500 };
    return { ok: false, status: 404 };
  };
};

const testSubmitLogErrorResponse = async () => {
  mockFetch.mockImplementation(createSubmitLogErrorMock());
  const { result } = setupHook('usr_1');
  let success = true;
  await act(async () => {
    success = await doSubmitLog(result);
  });
  expect(success).toBe(false);
  expect(result.current.isSubmitting).toBe(false);
};

const createNetworkErrorMock = () => {
  return async (url: string) => {
    if (url.includes('/activities/logs')) return { ok: true, json: () => Promise.resolve({ logs: [] }) };
    if (url.includes('/activities/log')) throw new Error('Network Failure');
    return { ok: false, status: 404 };
  };
};

const testNetworkErrorDuringSubmit = async () => {
  mockFetch.mockImplementation(createNetworkErrorMock());
  const { result } = setupHook('usr_1');
  let success = true;
  await act(async () => {
    success = await doSubmitLog(result);
  });
  expect(success).toBe(false);
  expect(result.current.isSubmitting).toBe(false);
};

const describeTests = () => {
  beforeEach(resetMocks);
  it('fetches logs on mount and caches them', testFetchLogs);
  it('submits log successfully and revalidates', testSubmitLog);
  it('handles submit log error response', testSubmitLogErrorResponse);
  it('handles network error during submit', testNetworkErrorDuringSubmit);
};

describe('useActivities', describeTests);