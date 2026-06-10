import { renderHook, waitFor } from '@testing-library/react';
import { useChat } from './useChat';
import { describe, it, expect, beforeEach } from 'vitest';
import { getMockFetch } from '../../vitest.setup';

const setupHook = (userId: string, lang: string) => {
  return renderHook(() => useChat(userId, lang));
};

describe('useChat', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = getMockFetch();
    mockFetch.mockReset();
    window.localStorage.clear();
  });

  it('initializes state from localStorage if available', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ messages: [] }) });
    window.localStorage.setItem('chat-cache', JSON.stringify([{ id: 'h-1', role: 'user', content: 'hello' }]));
    const { result } = setupHook('usr_1', 'en');
    expect(result.current.state.messages).toHaveLength(1);
    expect(result.current.state.messages[0].content).toBe('hello');
  });

  it('fetches history on mount and updates localStorage', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ messages: [{ role: 'assistant', message: 'Hi there' }] }) });
    const { result } = setupHook('usr_1', 'en');
    await waitFor(() => {
      expect(result.current.state.messages).toHaveLength(1);
    });
    expect(result.current.state.messages[0].content).toBe('Hi there');
    expect(JSON.parse(window.localStorage.getItem('chat-cache') || '')).toHaveLength(1);
  });
});
