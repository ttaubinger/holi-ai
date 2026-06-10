import { renderHook, waitFor, act } from '@testing-library/react';
import { useGarminLog } from './useGarminLog';
import { describe, it, expect, beforeEach } from 'vitest';
import { getMockFetch } from '../../vitest.setup';

const setupHook = (userId: string) => {
  return renderHook(() => useGarminLog(userId));
};

describe('useGarminLog', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = getMockFetch();
    mockFetch.mockReset();
    window.localStorage.clear();
  });

  it('initializes from localStorage', () => {
    window.localStorage.setItem('garmin-cache', JSON.stringify([{ id: 1, type: 'sleep' }]));
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ logs: [] }) });
    const { result } = setupHook('usr_1');
    expect(result.current.logs).toHaveLength(1);
  });

  it('fetches logs and syncs to localStorage', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ logs: [{ id: 2 }] }) });
    const { result } = setupHook('usr_1');
    await waitFor(() => {
      expect(result.current.logs).toHaveLength(1);
    });
    expect(JSON.parse(window.localStorage.getItem('garmin-cache') || '')).toHaveLength(1);
  });

  it('submits log successfully', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ logs: [] }) });
    const { result } = setupHook('usr_1');
    await act(async () => {
      const ok = await result.current.submitLog({ val: 5 });
      expect(ok).toBe(true);
    });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/garmin/log'), expect.objectContaining({ method: 'POST' }));
  });
});
