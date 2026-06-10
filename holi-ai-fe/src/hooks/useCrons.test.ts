import { renderHook, waitFor } from '@testing-library/react';
import { useCrons } from './useCrons';
import { describe, it, expect, beforeEach } from 'vitest';
import { getMockFetch } from '../../vitest.setup';

const setupHook = (configured: boolean, tab: string) => {
  return renderHook(() => useCrons(configured, tab));
};

describe('useCrons', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = getMockFetch();
    mockFetch.mockReset();
    window.localStorage.clear();
  });

  it('fetches crons when configured is true', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ crons: [{ cron_id: 'c1', title: 'test cron' }] }) });
    const { result } = setupHook(true, 'coach');
    await waitFor(() => {
      expect(result.current.crons).toHaveLength(1);
    });
    expect(result.current.crons?.[0].title).toBe('test cron');
  });

  it('deletes cron and revalidates cache', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ crons: [] }) });
    const { result } = setupHook(true, 'coach');
    await waitFor(() => {
      expect(result.current.crons).toBeDefined();
    });
    result.current.deleteCron('c1');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/chat/crons/c1'), expect.objectContaining({ method: 'DELETE' }));
  });
});
