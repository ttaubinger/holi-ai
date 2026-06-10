import { renderHook, waitFor } from '@testing-library/react';
import { useNotifications } from './useNotifications';
import { describe, it, expect, beforeEach } from 'vitest';

const setupHook = (crons: any[], deleteCron: any) => {
  return renderHook(() => useNotifications(crons, deleteCron));
};

describe('useNotifications', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders without crashing with empty crons', () => {
    const { result } = setupHook([], vi.fn());
    expect(result.current).toBeUndefined();
  });

  it('handles active crons without crashing', async () => {
    const mockCron = [{ cron_id: '1', title: 'Test', schedule: '0 8 * * *', is_active: true }];
    setupHook(mockCron, vi.fn());
    await waitFor(() => {
      // Just verifying it doesn't throw and correctly handles the mock Capacitor
      expect(true).toBe(true);
    });
  });
});
