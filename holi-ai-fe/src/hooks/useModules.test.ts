import { renderHook, waitFor } from '@testing-library/react';
import { useModules } from './useModules';
import { describe, it, expect, beforeEach } from 'vitest';
import { getMockFetch } from '../../vitest.setup';

const setupHook = (configured: boolean, tab: string) => {
  return renderHook(() => useModules(configured, tab));
};

describe('useModules', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = getMockFetch();
    mockFetch.mockReset();
    window.localStorage.clear();
  });

  it('fetches modules when configured is true', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ modules: [{ module_title: 'M1' }] }) });
    const { result } = setupHook(true, 'coach');
    await waitFor(() => {
      expect(result.current.modules).toHaveLength(1);
    });
    expect(result.current.modules?.[0].module_title).toBe('M1');
  });

  it('deletes module and revalidates cache', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ modules: [] }) });
    const { result } = setupHook(true, 'coach');
    await waitFor(() => {
      expect(result.current.modules).toBeDefined();
    });
    result.current.deleteModule('M1');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/chat/modules/M1'), expect.objectContaining({ method: 'DELETE' }));
  });
});
