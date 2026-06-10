import { renderHook, waitFor, act } from '@testing-library/react';
import { useCrons } from './useCrons';
import { describe, it, expect, beforeEach } from 'vitest';
import { getMockFetch } from '../../vitest.setup';

let mockFetch: any;

const setupBeforeEach = () => {
  mockFetch = getMockFetch();
  mockFetch.mockReset();
  window.localStorage.clear();
};

const setupHook = (configured: boolean, tab: string) => {
  return renderHook(() => useCrons(configured, tab));
};

const mockFetchCrons = () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ crons: [{ cron_id: 'c1', title: 'test cron' }] })
  });
};

const mockFetchEmpty = () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ crons: [] })
  });
};

const testFetchesCrons = async () => {
  mockFetchCrons();
  const { result } = setupHook(true, 'coach');
  await waitFor(() => expect(result.current.crons).toHaveLength(1));
  expect(result.current.crons[0]!.title).toBe('test cron');
};

const testDeletesCron = async () => {
  mockFetchEmpty();
  const { result } = setupHook(true, 'coach');
  await waitFor(() => expect(result.current.crons).toBeDefined());
  await act(async () => await result.current.deleteCron('c1'));
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/chat/crons/c1'),
    expect.objectContaining({ method: 'DELETE' })
  );
};

const testFetchNetworkError = async () => {
  mockFetch.mockRejectedValue(new Error('Network failure'));
  const { result } = setupHook(true, 'coach');
  await waitFor(() => expect(result.current.crons).toEqual([]));
};

const testNotConfigured = async () => {
  setupHook(false, 'coach');
  expect(mockFetch).not.toHaveBeenCalled();
};

const testFetchHttpError = async () => {
  mockFetch.mockResolvedValue({ ok: false });
  const { result } = setupHook(true, 'coach');
  await waitFor(() => expect(result.current.crons).toEqual([]));
};

const testTogglesCron = async () => {
  mockFetchEmpty();
  const { result } = setupHook(true, 'coach');
  await waitFor(() => expect(result.current.crons).toBeDefined());
  await act(async () => await result.current.toggleCron('c1', false));
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/chat/crons/c1/toggle'),
    expect.objectContaining({ method: 'POST' })
  );
};

const testToggleNetworkError = async () => {
  mockFetchEmpty();
  const { result } = setupHook(true, 'coach');
  await waitFor(() => expect(result.current.crons).toBeDefined());
  mockFetch.mockRejectedValueOnce(new Error('Network failure'));
  await act(async () => await result.current.toggleCron('c1', false));
};

const testDeleteNetworkError = async () => {
  mockFetchEmpty();
  const { result } = setupHook(true, 'coach');
  await waitFor(() => expect(result.current.crons).toBeDefined());
  mockFetch.mockRejectedValueOnce(new Error('Network failure'));
  await act(async () => await result.current.deleteCron('c1'));
};

const registerTests = () => {
  beforeEach(setupBeforeEach);
  it('fetches crons when configured is true', testFetchesCrons);
  it('deletes cron and revalidates cache', testDeletesCron);
  it('handles network error when fetching crons', testFetchNetworkError);
  it('does not fetch when configured is false', testNotConfigured);
  it('handles http error when fetching', testFetchHttpError);
  it('toggles cron and revalidates cache', testTogglesCron);
  it('handles network error when toggling', testToggleNetworkError);
  it('handles network error when deleting', testDeleteNetworkError);
};

describe('useCrons', registerTests);
