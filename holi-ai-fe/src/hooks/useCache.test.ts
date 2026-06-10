import { renderHook, waitFor } from '@testing-library/react';
import { useCache } from './useCache';
import { describe, it, expect, beforeEach } from 'vitest';

const mockFetcher = vi.fn();

const setupHook = (key: string, initData: any) => {
  return renderHook(() => useCache(key, mockFetcher, initData));
};

describe('useCache', () => {
  beforeEach(() => {
    mockFetcher.mockReset();
    window.localStorage.clear();
  });

  it('initializes from localStorage if available', () => {
    window.localStorage.setItem('my-cache', JSON.stringify({ stored: true }));
    const { result } = setupHook('my-cache', { fallback: true });
    expect(result.current.data).toEqual({ stored: true });
  });

  it('uses fallback if localStorage is empty', () => {
    const { result } = setupHook('empty-cache', { fallback: true });
    expect(result.current.data).toEqual({ fallback: true });
  });

  it('calls fetcher on revalidate and updates storage', async () => {
    mockFetcher.mockResolvedValueOnce({ new: 'data' });
    const { result } = setupHook('my-cache', null);
    result.current.revalidate();
    await waitFor(() => {
      expect(result.current.data).toEqual({ new: 'data' });
    });
    expect(JSON.parse(window.localStorage.getItem('my-cache') || '')).toEqual({ new: 'data' });
  });
});
