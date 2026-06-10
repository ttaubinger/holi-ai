import { renderHook, waitFor, act } from '@testing-library/react';
import { useChat } from './useChat';
import { App } from '@capacitor/app';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMockFetch } from '../../vitest.setup';

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn().mockReturnValue(Promise.resolve({ remove: vi.fn() })) }
}));

const setupHook = (userId: string, lang: string) => renderHook(() => useChat(userId, lang, true));

let mockFetch: any;

const resetMocks = () => {
  mockFetch = getMockFetch();
  mockFetch.mockReset();
  window.localStorage.clear();
};

const mockStatusRes = (res: any) => {
  if (res.error) return { ok: true, json: () => Promise.resolve({ status: 'failed', result: { error: res.error } }) };
  if (res.status === 500) return { ok: false, status: 500, text: () => Promise.resolve('Server Error') };
  return { ok: true, json: () => Promise.resolve(res) };
};

const setupChatFetchMock = (history: any, statusRes: any[], err?: any, dnsErr?: boolean) => {
  let calls = 0;
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('/history')) return typeof history === 'function' ? history(url) : { ok: true, json: () => Promise.resolve(history) };
    if (url.includes('/status')) return mockStatusRes(typeof statusRes[calls] === 'function' ? statusRes[calls++]() : statusRes[calls++]);
    if (dnsErr && url.includes('/chat')) throw new Error('DNS failure');
    if (err && url.includes('/chat')) return err;
    return { ok: true, json: () => Promise.resolve({ jobId: 'job-123' }) };
  });
};

const setupAppResumeMock = (eventCallback: (cb: any) => void) => {
  (App.addListener as any).mockImplementation((event: string, cb: any) => {
    if (event === 'appStateChange') eventCallback(cb);
    return Promise.resolve({ remove: vi.fn() });
  });
};

const testInitLocalStorage = () => {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ messages: [] }) });
  window.localStorage.setItem('chat-cache', JSON.stringify([{ id: 'h-1', role: 'user', content: 'hello' }]));
  const { result } = setupHook('usr_1', 'en');
  expect(result.current.state.messages).toHaveLength(1);
  expect(result.current.state.messages[0]!.content).toBe('hello');
};

const testFetchHistoryUpdateLocal = async () => {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ messages: [{ role: 'assistant', message: 'Hi there' }] }) });
  const { result } = setupHook('usr_1', 'en');
  await waitFor(() => expect(result.current.state.messages).toHaveLength(1));
  expect(result.current.state.messages[0]!.content).toBe('Hi there');
  expect(JSON.parse(window.localStorage.getItem('chat-cache') || '')).toHaveLength(1);
};

const testSendMsgStartsPolling = async () => {
  setupChatFetchMock({ messages: [] }, [{ status: 'running' }, { status: 'completed', result: { chat_message: 'pong' } }]);
  const { result } = setupHook('usr_1', 'en');
  act(() => { result.current.sendMessage('ping'); });
  expect(result.current.state.isThinking).toBe(true);
  await waitFor(() => {
    expect(result.current.state.messages.some(m => m.role === 'assistant' && m.content.includes('pong'))).toBe(true);
  }, { timeout: 4000 });
  expect(result.current.state.isThinking).toBe(false);
};

const testSendMsgError = async () => {
  setupChatFetchMock({ messages: [] }, [], { ok: false, status: 500, text: () => Promise.resolve('Server Error') });
  const { result } = setupHook('usr_1', 'en');
  await act(async () => { await result.current.sendMessage('ping'); });
  expect(result.current.state.error).toContain('HTTP 500');
  expect(result.current.state.isThinking).toBe(false);
};

const testSendMsgNetworkRejection = async () => {
  setupChatFetchMock({ messages: [] }, [], null, true);
  const { result } = setupHook('usr_1', 'en');
  await act(async () => { await result.current.sendMessage('ping'); });
  expect(result.current.state.error).toContain('Network Error: DNS failure');
};

const testLoadMoreLogic = async () => {
  const historyLogic = (url: string) => {
    const limit = new URLSearchParams(url.split('?')[1]).get('limit');
    if (limit === '50') return { ok: true, json: () => Promise.resolve({ messages: new Array(50).fill({ role: 'assistant', message: 'recent' }) }) };
    return { ok: true, json: () => Promise.resolve({ messages: [{ role: 'user', message: 'older' }] }) };
  };
  setupChatFetchMock(historyLogic, []);
  const { result } = setupHook('usr_1', 'en');
  await waitFor(() => expect(result.current.state.messages).toHaveLength(50));
  await act(async () => { await result.current.loadMore(); });
  expect(result.current.state.messages).toHaveLength(51);
  expect(result.current.state.messages[0]!.content).toBe('older');
};

const testRetryMsgLogic = async () => {
  setupChatFetchMock({ messages: [] }, [{ status: 'running' }, { status: 'completed', result: { chat_message: 'pong' } }]);
  const { result } = setupHook('usr_1', 'en');
  act(() => { result.current.retryMessage('ping'); });
  expect(result.current.state.isThinking).toBe(true);
  await waitFor(() => expect(result.current.state.isThinking).toBe(false), { timeout: 4000 });
};

const testDelayedStatusPolling = async () => {
  let pCount = 0;
  const historyLogic = () => {
    if (pCount > 0) return { ok: true, json: () => Promise.resolve({ messages: [{ role: 'system', message: 'thinking', created_at: new Date().toISOString() }] }) };
    return { ok: true, json: () => Promise.resolve({ messages: [] }) };
  };
  setupChatFetchMock(historyLogic, [
    () => { pCount++; return { status: 'delayed', result: { message: 'thinking', resumeAt: Date.now() + 1000 } }; },
    () => { return { status: 'completed', result: { chat_message: 'pong' } }; }
  ]);
  const { result } = setupHook('usr_1', 'en');
  act(() => { result.current.sendMessage('ping'); });
  await waitFor(() => expect(result.current.state.messages.some(m => m.role === 'system' && m.content.includes('thinking'))).toBe(true), { timeout: 5000 });
  await waitFor(() => expect(result.current.state.messages.some(m => m.role === 'assistant' && m.content.includes('pong'))).toBe(true), { timeout: 6000 });
};

const testFailedStatusPolling = async () => {
  setupChatFetchMock({ messages: [] }, [{ status: 'running' }, { error: 'Internal failure' }]);
  const { result } = setupHook('usr_1', 'en');
  act(() => { result.current.sendMessage('ping'); });
  await waitFor(() => {
    expect(result.current.state.error).toBe('Internal failure');
    expect(result.current.state.isThinking).toBe(false);
  }, { timeout: 4000 });
};

const testFailedJobAIReply = async () => {
  setupChatFetchMock({ messages: [] }, [{ error: 'Error: {"error":{"failed_generation":"Im sorry I cannot answer"}}' }]);
  const { result } = setupHook('usr_1', 'en');
  act(() => { result.current.sendMessage('ping'); });
  await waitFor(() => {
    expect(result.current.state.isThinking).toBe(false);
    expect(result.current.state.messages.some(m => m.role === 'assistant' && m.content.includes('Im sorry I cannot answer'))).toBe(true);
  }, { timeout: 4000 });
};

const testRepeatedDelayedPolling = async () => {
  let pCount = 0;
  const hLogic = () => pCount > 0 ? { ok: true, json: () => Promise.resolve({ messages: [{ role: 'system', message: 'thinking', created_at: new Date().toISOString() }] }) } : { ok: true, json: () => Promise.resolve({ messages: [] }) };
  setupChatFetchMock(hLogic, [
    () => { pCount++; return { status: 'delayed', result: { message: 'thinking', resumeAt: Date.now() + 1000 } }; },
    () => { pCount++; return { status: 'delayed', result: { message: 'thinking', resumeAt: Date.now() + 1000 } }; },
    () => { return { status: 'completed', result: { chat_message: 'pong' } }; }
  ]);
  const { result } = setupHook('usr_1', 'en');
  act(() => { result.current.sendMessage('ping'); });
  await waitFor(() => expect(result.current.state.messages.filter(m => m.role === 'system')).toHaveLength(1), { timeout: 5000 });
  await waitFor(() => expect(result.current.state.messages.some(m => m.role === 'assistant' && m.content.includes('pong'))).toBe(true), { timeout: 8000 });
};

const testAppResume = async () => {
  let resCb: any;
  setupAppResumeMock((cb) => { resCb = cb; });
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ messages: [] }) });
  const { result } = setupHook('usr_1', 'en');
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ messages: [{ role: 'assistant', message: 'Resumed' }] }) });
  await act(async () => { if (resCb) await resCb({ isActive: true }); });
  expect(result.current.state.messages[0]!.content).toBe('Resumed');
};

const testLoadMoreError = async () => {
  const hLogic = (url: string) => {
    const limit = new URLSearchParams(url.split('?')[1]).get('limit');
    if (limit === '50') return { ok: true, json: () => Promise.resolve({ messages: new Array(50).fill({ role: 'assistant', message: 'recent' }) }) };
    throw new Error('History failed');
  };
  setupChatFetchMock(hLogic, []);
  const { result } = setupHook('usr_1', 'en');
  await waitFor(() => expect(result.current.state.messages).toHaveLength(50));
  await act(async () => { await result.current.loadMore(); });
  expect(result.current.state.messages).toHaveLength(50);
};

const testHistoryFetchError = async () => {
  mockFetch.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('Server Error') });
  const { result } = setupHook('usr_1', 'en');
  await waitFor(() => expect(result.current.state.messages).toHaveLength(0));
};

const testAppResumeError = async () => {
  let resCb: any;
  setupAppResumeMock((cb) => { resCb = cb; });
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ messages: [] }) });
  const { result } = setupHook('usr_1', 'en');
  mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('Server Error') });
  await act(async () => { if (resCb) await resCb({ isActive: true }); });
  expect(result.current.state.messages).toHaveLength(0);
};

const testPollingNetworkError = async () => {
  const ogMin = Math.min; Math.min = vi.fn().mockReturnValue(10);
  let dnsThrown = false;
  const mockFn = () => { if (!dnsThrown) { dnsThrown = true; throw new Error('DNS failure'); } return { status: 'completed', result: { chat_message: 'pong' } }; };
  setupChatFetchMock({ messages: [] }, [ mockFn, mockFn ]);
  const { result } = setupHook('usr_1', 'en');
  act(() => { result.current.sendMessage('ping'); });
  await waitFor(() => {
    expect(result.current.state.isThinking).toBe(false);
    expect(result.current.state.messages.some(m => m.role === 'assistant' && m.content.includes('pong'))).toBe(true);
  }, { timeout: 4000 });
  Math.min = ogMin;
};

const testPollingHttpError = async () => {
  const ogMin = Math.min; Math.min = vi.fn().mockReturnValue(10);
  setupChatFetchMock({ messages: [] }, [{ status: 500 }, { status: 'completed', result: { chat_message: 'pong' } }]);
  const { result } = setupHook('usr_1', 'en');
  act(() => { result.current.sendMessage('ping'); });
  await waitFor(() => {
    expect(result.current.state.isThinking).toBe(false);
    expect(result.current.state.messages.some(m => m.role === 'assistant' && m.content.includes('pong'))).toBe(true);
  }, { timeout: 4000 });
  Math.min = ogMin;
};

const testResumeAtDelayedJobs = async () => {
  const hLogic = { messages: [{ role: 'system', message: 'Hold on', created_at: new Date().toISOString() }] };
  setupChatFetchMock(hLogic, [{ status: 'delayed', result: { message: 'Hold on', resumeAt: Date.now() + 100 } }]);
  const { result } = setupHook('usr_1', 'en');
  act(() => { result.current.sendMessage('ping'); });
  await waitFor(() => expect(result.current.state.messages.some(m => m.content.includes('Hold on'))).toBe(true));
};

const testUnmountBailout = async () => {
  let uFn: any;
  setupChatFetchMock({ messages: [] }, [ () => {
    if (uFn) { setTimeout(uFn, 0); }
    throw new Error('Network error');
  }]);
  const { result, unmount } = setupHook('usr_1', 'en');
  uFn = unmount;
  act(() => { result.current.sendMessage('ping'); });
  await waitFor(() => expect(result.current.state.isThinking).toBe(true));
  expect(mockFetch).toHaveBeenCalled();
};

const testRetryMsgFailure = async () => {
  setupChatFetchMock({ messages: [] }, [], { ok: false, status: 500, text: () => Promise.resolve('Server Error') });
  const { result } = setupHook('usr_1', 'en');
  await act(async () => { await result.current.retryMessage('ping'); });
  expect(result.current.state.error).toContain('HTTP 500');
  expect(result.current.state.isThinking).toBe(false);
};

const testClearChat = async () => {
  setupChatFetchMock({ messages: [{ role: 'assistant', message: 'Hi there' }] }, []);
  const { result } = setupHook('usr_1', 'en');
  await waitFor(() => expect(result.current.state.messages).toHaveLength(1));
  act(() => { result.current.clearChat(); });
  expect(result.current.state.messages).toHaveLength(0);
  expect(window.localStorage.getItem('chat-cache')).toBeNull();
};

const testPendingStatusWithSystemMsg = async () => {
  setupChatFetchMock({ messages: [] }, [{ status: 'pending', result: { system_message: 'Custom pending message' } }]);
  const { result } = setupHook('usr_1', 'en');
  await act(async () => { await result.current.sendMessage('ping'); });
  await waitFor(() => expect(result.current.state.aiStatus).toBe('HIDDEN'), { timeout: 4000 });
};

const testPendingStatusNoSystemMsg = async () => {
  setupChatFetchMock({ messages: [] }, [{ status: 'pending', result: {} }]);
  const { result } = setupHook('usr_1', 'en');
  await act(async () => { await result.current.sendMessage('ping'); });
  await waitFor(() => expect(result.current.state.aiStatus).toBe('Waiting for server capacity...'), { timeout: 4000 });
};

const describeTests1 = () => {
  it('initializes state from localStorage if available', testInitLocalStorage);
  it('fetches history on mount and updates localStorage', testFetchHistoryUpdateLocal);
  it('sends message successfully and starts polling', testSendMsgStartsPolling);
  it('handles send message error', testSendMsgError);
  it('handles send message network rejection', testSendMsgNetworkRejection);
  it('handles loadMore logic', testLoadMoreLogic);
  it('handles retryMessage logic', testRetryMsgLogic);
  it('handles delayed status polling', testDelayedStatusPolling);
};

const describeTests2 = () => {
  it('handles failed status polling', testFailedStatusPolling);
  it('handles failed job with AI reply', testFailedJobAIReply);
  it('handles repeated delayed status polling', testRepeatedDelayedPolling, 10000);
  it('handles app resume', testAppResume);
  it('handles loadMore error', testLoadMoreError);
  it('handles history fetch HTTP error on mount', testHistoryFetchError);
  it('handles app resume error gracefully', testAppResumeError);
  it('handles network error in polling and retries', testPollingNetworkError);
};

const describeTests3 = () => {
  it('handles http error in polling and retries', testPollingHttpError);
  it('handles resumeAt logic for delayed jobs', testResumeAtDelayedJobs);
  it('bails out of retry if unmounted', testUnmountBailout);
  it('handles retryMessage failure', testRetryMsgFailure);
  it('clears chat', testClearChat);
  it('handles pending status with system_message', testPendingStatusWithSystemMsg);
  it('handles pending status without system_message', testPendingStatusNoSystemMsg);
};

describe('useChat', () => {
  beforeEach(resetMocks);
  describe('part1', describeTests1);
  describe('part2', describeTests2);
  describe('part3', describeTests3);
});
