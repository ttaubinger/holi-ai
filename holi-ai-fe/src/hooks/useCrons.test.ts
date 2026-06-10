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
    json: () => Promise.resolve({ crons: [{ cron_id: 'c1', title: 'test cron' }, { cron_id: 'c99', title: 'other' }] })
  });
};

const testFetchNoCronsInJson = async () => {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  const { result } = setupHook(true, 'coach');
  await waitFor(() => expect(result.current.crons).toEqual([]));
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
  await waitFor(() => expect(result.current.crons).toHaveLength(2));
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

const testUpdatesCron = async () => {
  mockFetchCrons();
  const { result } = setupHook(true, 'coach');
  await waitFor(() => expect(result.current.crons).toBeDefined());
  await act(async () => await result.current.updateCron('c1', { title: 'updated' }));
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/chat/crons/c1'),
    expect.objectContaining({ method: 'PUT' })
  );
};

const testCreatesCron = async () => {
  mockFetchEmpty();
  const { result } = setupHook(true, 'coach');
  await waitFor(() => expect(result.current.crons).toBeDefined());
  await act(async () => await result.current.createCron('c2', { title: 'new' }));
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/chat/crons/c2'),
    expect.objectContaining({ method: 'PUT' })
  );
};

const testUpdateNetworkError = async () => {
  mockFetchCrons();
  const { result } = setupHook(true, 'coach');
  await waitFor(() => expect(result.current.crons).toBeDefined());
  mockFetch.mockRejectedValueOnce(new Error('Network failure'));
  await act(async () => await result.current.updateCron('c1', { title: 'updated' }));
};

const testActionsWithoutCrons = async () => {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ crons: [] }) });
  const { result } = setupHook(true, 'coach');
  await act(async () => {
    await result.current.deleteCron('c1');
    await result.current.createCron('c2', { title: 'new' });
    await result.current.updateCron('c1', { title: 'updated' });
    await result.current.toggleCron('c1', false);
  });
  expect(mockFetch).toHaveBeenCalled();
};

const registerTestsPart1 = () => {
  beforeEach(setupBeforeEach);
  it('fetches crons when configured is true', testFetchesCrons);
  it('deletes cron and revalidates cache', testDeletesCron);
  it('handles network error when fetching crons', testFetchNetworkError);
  it('does not fetch when configured is false', testNotConfigured);
  it('handles http error when fetching', testFetchHttpError);
  it('handles no crons in JSON', testFetchNoCronsInJson);
  it('toggles cron and revalidates cache', testTogglesCron);
};

const registerTestsPart2 = () => {
  it('handles network error when toggling', testToggleNetworkError);
  it('handles network error when deleting', testDeleteNetworkError);
  it('updates cron and revalidates cache', testUpdatesCron);
  it('creates cron and revalidates cache', testCreatesCron);
  it('handles network error when updating', testUpdateNetworkError);
  it('handles actions when crons is undefined', testActionsWithoutCrons);
};

describe('useCrons', () => {
  registerTestsPart1();
  registerTestsPart2();
});
