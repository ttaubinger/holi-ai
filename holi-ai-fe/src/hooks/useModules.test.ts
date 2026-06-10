import { renderHook, waitFor, act } from '@testing-library/react';
import { useModules } from './useModules';
import { describe, it, expect, beforeEach } from 'vitest';
import { getMockFetch } from '../../vitest.setup';

let mockFetch: any;

const setupHook = (configured: boolean, tab: string) => {
  return renderHook(() => useModules(configured, tab));
};

const resetMocks = () => {
  mockFetch = getMockFetch();
  mockFetch.mockReset();
  window.localStorage.clear();
};

const setupFetchModulesMock = () => {
  const data = { modules: [{ module_title: 'M1' }] };
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(data) });
};

const testFetchModules = async () => {
  setupFetchModulesMock();
  const { result } = setupHook(true, 'coach');
  await waitFor(() => {
    expect(result.current.modules).toHaveLength(1);
  });
  expect(result.current.modules[0]!.module_title).toBe('M1');
};

const setupDeleteModuleMock = () => {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ modules: [] }) });
};

const testDeleteModule = async () => {
  setupDeleteModuleMock();
  const { result } = setupHook(true, 'coach');
  await waitFor(() => {
    expect(result.current.modules).toBeDefined();
  });
  await act(async () => {
    await result.current.deleteModule('M1');
  });
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/chat/modules/M1'),
    expect.objectContaining({ method: 'DELETE' })
  );
};

const testFetchError = async () => {
  mockFetch.mockRejectedValue(new Error('Network failure'));
  const { result } = setupHook(true, 'coach');
  await waitFor(() => {
    expect(result.current.modules).toEqual([]);
  });
};

const testNotConfigured = async () => {
  setupHook(false, 'coach');
  expect(mockFetch).not.toHaveBeenCalled();
};

const testHttpError = async () => {
  mockFetch.mockResolvedValue({ ok: false });
  const { result } = setupHook(true, 'coach');
  await waitFor(() => {
    expect(result.current.modules).toEqual([]);
  });
};

const describeTests = () => {
  beforeEach(resetMocks);
  it('fetches modules when configured is true', testFetchModules);
  it('deletes module and revalidates cache', testDeleteModule);
  it('handles network error when fetching modules', testFetchError);
  it('does not fetch when configured is false', testNotConfigured);
  it('handles http error when fetching', testHttpError);
};

describe('useModules', describeTests);