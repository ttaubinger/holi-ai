import { renderHook, waitFor, act } from '@testing-library/react';
import { useCache } from './useCache';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockFetcher = vi.fn();

const setupHook = (key: string, initData: any) => {
  return renderHook(() => useCache(key, mockFetcher, initData));
};

const resetMocks = () => {
  mockFetcher.mockReset();
  window.localStorage.clear();
};

const testInitStorage = () => {
  window.localStorage.setItem('my-cache', JSON.stringify({ stored: true }));
  const { result } = setupHook('my-cache', { fallback: true });
  expect(result.current.data).toEqual({ stored: true });
};

const testEmptyStorageFallback = () => {
  const { result } = setupHook('empty-cache', { fallback: true });
  expect(result.current.data).toEqual({ fallback: true });
};

const testRevalidateUpdates = async () => {
  mockFetcher.mockResolvedValueOnce({ new: 'data' });
  const { result } = setupHook('my-cache', null);
  result.current.revalidate();
  await waitFor(() => {
    expect(result.current.data).toEqual({ new: 'data' });
  });
  expect(JSON.parse(window.localStorage.getItem('my-cache') || '')).toEqual({ new: 'data' });
};

const testMutateUpdates = () => {
  const { result } = setupHook('my-cache', null);
  act(() => {
    result.current.mutate({ manual: 'update' });
  });
  expect(result.current.data).toEqual({ manual: 'update' });
  expect(JSON.parse(window.localStorage.getItem('my-cache') || '')).toEqual({ manual: 'update' });
};

const testRevalidateUndefined = async () => {
  mockFetcher.mockResolvedValueOnce(undefined);
  const { result } = setupHook('my-cache', { existing: 'data' });
  await act(async () => {
    await result.current.revalidate();
  });
  expect(result.current.data).toEqual({ existing: 'data' });
};

const describeTests = () => {
  beforeEach(resetMocks);
  it('initializes from localStorage if available', testInitStorage);
  it('uses fallback if localStorage is empty', testEmptyStorageFallback);
  it('calls fetcher on revalidate and updates storage', testRevalidateUpdates);
  it('mutates data directly', testMutateUpdates);
  it('does not update state if fetcher returns undefined', testRevalidateUndefined);
};

describe('useCache', describeTests);