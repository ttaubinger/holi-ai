import { renderHook, waitFor, act } from '@testing-library/react';
import { useBiometricsLog } from './useBiometricsLog';
import { describe, it, expect, beforeEach } from 'vitest';
import { getMockFetch } from '../../vitest.setup';

let mockFetch: any;

const setupHook = (userId: string) => {
  return renderHook(() => useBiometricsLog(userId));
};

const setupInitStorageMock = () => {
  window.localStorage.setItem('biometrics-log-cache', JSON.stringify([{ id: 1, type: 'sleep' }]));
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ logs: [] }) });
};

const testInitStorage = async () => {
  setupInitStorageMock();
  const { result } = setupHook('usr_1');
  expect(result.current.logs).toHaveLength(1);
  await waitFor(() => {
    expect(result.current.isLoadingLogs).toBe(false);
  });
};

const setupFetchSyncMock = () => {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ logs: [{ id: 2 }] }) });
};

const testFetchSync = async () => {
  setupFetchSyncMock();
  const { result } = setupHook('usr_1');
  await waitFor(() => {
    expect(result.current.logs).toHaveLength(1);
  });
  const cached = JSON.parse(window.localStorage.getItem('biometrics-log-cache') || '[]');
  expect(cached).toHaveLength(1);
};

const setupSubmitLogMock = () => {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ logs: [] }) });
};

const testSubmitLog = async () => {
  setupSubmitLogMock();
  const { result } = setupHook('usr_1');
  await act(async () => {
    const ok = await result.current.submitLog({ val: 5 });
    expect(ok).toBe(true);
  });
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/biometrics/log'),
    expect.objectContaining({ method: 'POST' })
  );
};

const resetMocks = () => {
  mockFetch = getMockFetch();
  mockFetch.mockReset();
  window.localStorage.clear();
};

const describeTests = () => {
  beforeEach(resetMocks);
  it('initializes from localStorage', testInitStorage);
  it('fetches logs and syncs to localStorage', testFetchSync);
  it('submits log successfully', testSubmitLog);
};

describe('useBiometricsLog', describeTests);