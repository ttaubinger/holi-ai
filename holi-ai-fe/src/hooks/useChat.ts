import { useState, useEffect, useCallback } from 'react';
import { App } from '@capacitor/app';
import { DICTIONARY } from '../locales';
import { JobIdResponseSchema, JobStatusResponseSchema, ChatHistoryResponseSchema } from '../lib/schemas';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
}

export interface ChatState {
  messages: ChatMessage[];
  isThinking: boolean;
  aiStatus: string | null;
  error: string | null;
}

const getDebugMode = () => {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('DEBUG_MODE') !== 'false';
};

const getEcosystemKeys = () => {
  if (typeof window === 'undefined') return '{}';
  return JSON.stringify({
    sbConnUrl: localStorage.getItem('SUPABASE_CONN_URL') || '',
    neonUrl: localStorage.getItem('NEON_URL') || '',
    groqKey: localStorage.getItem('GROQ_KEY') || '',
    groqModel: localStorage.getItem('GROQ_MODEL') || 'llama-3.3-70b-versatile',
    ragThreshold: localStorage.getItem('RAG_THRESHOLD') || '0.5',
    debugMode: getDebugMode(),
    appleHealth: localStorage.getItem('APPLE_HEALTH_TOKEN') || '',
    garmin: localStorage.getItem('GARMIN_TOKEN') || ''
  });
};

const doFetch = async (url: string, opts?: RequestInit) => {
  const finalOpts = { ...opts, headers: { ...opts?.headers, 'X-Ecosystem-Keys': getEcosystemKeys() } };
  let res;
  try { res = await fetch(url, finalOpts); }
  catch (e: any) { throw new Error(`Network Error: ${e.message}\nStack: ${e.stack}`); }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}\nResponse: ${text}`);
  }
  return res.json();
};

const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const sendChatMessage = async (userId: string, msg: string, lang: string) => {
  const url = `${getApiUrl()}/chat`;
  const body = JSON.stringify({ userId, message: msg, lang });
  const raw = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  return JobIdResponseSchema.parse(raw).jobId;
};

const pollJobStatus = async (jobId: string) => {
  const url = `${getApiUrl()}/chat/status?jobId=${jobId}`;
  const raw = await doFetch(url);
  return JobStatusResponseSchema.parse(raw);
};

const fetchHistory = async (userId: string, limit: number, offset: number) => {
  const url = `${getApiUrl()}/chat/history?userId=${userId}&limit=${limit}&offset=${offset}`;
  const raw = await doFetch(url);
  return ChatHistoryResponseSchema.parse(raw);
};

const extractAiReply = (result: any) => {
  if (!result?.error) return '';
  const idx = result.error.indexOf('{');
  if (idx < 0) return '';
  return JSON.parse(result.error.substring(idx))?.error?.failed_generation || '';
};

const applyHistory = (data: any) => {
  if (!data.messages) return [];
  return data.messages.map((m: any, i: number) => ({ id: `h-${m.id||i}`, role: m.role, content: m.message, created_at: m.created_at || new Date().toISOString() }));
};

const getInitialState = (): ChatState => {
  if (typeof window === 'undefined') return { messages: [], isThinking: false, aiStatus: null, error: null };
  const cached = localStorage.getItem('chat-cache');
  return { messages: cached ? JSON.parse(cached) : [], isThinking: false, aiStatus: null, error: null };
};

const handleJobFailed = (jobId: string, result: any, setState: any, setActive: any, setOffset: any) => {
  let aiReply = '';
  try { aiReply = extractAiReply(result); } catch (_e) {}
  if (aiReply) {
    const msg: ChatMessage = { id: jobId, role: 'assistant', content: JSON.stringify({ chat_message: aiReply }) };
    setState((p: ChatState) => ({ ...p, isThinking: false, aiStatus: null, messages: [...p.messages, msg] }));
    setOffset((o: number) => o + 1);
  } else {
    setState((p: ChatState) => ({ ...p, isThinking: false, aiStatus: null, error: result?.error || 'Job failed' }));
  }
  setActive(null);
};

const updateHistState = (setState: any, setOffset: any, setHasMore: any, data: any, limit: number) => {
  const hist = applyHistory(data);
  if (hist.length > 0) {
    setState((p: ChatState) => ({ ...p, messages: hist }));
    setOffset(data.messages.length);
    if (data.messages.length < limit) setHasMore(false);
  } else {
    setState((p: ChatState) => ({ ...p, messages: [] }));
    setOffset(0);
    setHasMore(false);
  }
};

const useInitHistory = (userId: string, configured: boolean, setState: any, setOffset: any, setHasMore: any) => {
  useEffect(() => {
    let isMounted = true;
    if (!configured) return;
    fetchHistory(userId, 50, 0).then(data => {
      if (isMounted) updateHistState(setState, setOffset, setHasMore, data, 50);
    }).catch(console.error);
    return () => { isMounted = false; };
  }, [userId, configured, setState, setOffset, setHasMore]);
};

const handleAppResume = async (isActive: boolean, configured: boolean, userId: string, setState: any, setOffset: any) => {
  if (!isActive || !configured) return;
  try {
    const data = await fetchHistory(userId, 50, 0);
    updateHistState(setState, setOffset, () => null, data, 50);
  } catch (e) { console.error(e); }
};

const useAppResume = (userId: string, configured: boolean, setState: any, setOffset: any) => {
  useEffect(() => {
    let handle: any = null;
    if (typeof window !== 'undefined') {
      App.addListener('appStateChange', (s: any) => handleAppResume(s.isActive, configured, userId, setState, setOffset)).then(h => { handle = h; });
    }
    return () => { if (handle) handle.remove(); };
  }, [userId, configured, setState, setOffset]);
};

const useCacheSync = (messages: ChatMessage[]) => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (messages.length > 0) localStorage.setItem('chat-cache', JSON.stringify(messages));
    else localStorage.removeItem('chat-cache');
  }, [messages]);
};

const handleJobCompleted = async (jobId: string, result: any, setState: any, setActive: any, setOffset: any, userId: string) => {
  const msg: ChatMessage = { id: jobId, role: 'assistant', content: JSON.stringify(result), created_at: new Date().toISOString() };
  setState((p: ChatState) => ({ ...p, isThinking: false, aiStatus: null, messages: [...p.messages, msg] }));
  setOffset((prev: number) => prev + 1);
  setActive(null);
  try {
    const data = await fetchHistory(userId, 50, 0);
    const hist = applyHistory(data);
    if (hist.some((m: any) => m.role === 'assistant')) {
      setState((p: ChatState) => ({ ...p, messages: hist }));
      setOffset(data.messages.length);
    }
  } catch(_e) {}
};

const getWaitTimeForDelayed = (result: any) => {
  let waitTime = 2000;
  if (result?.resumeAt) {
    const diff = result.resumeAt - Date.now();
    if (diff > 0) waitTime = Math.min(diff + 2000, 10000);
  }
  return waitTime;
};

const handleJobDelayed = async (result: any, setState: any, setOffset: any, userId: string, runNext: (w: number) => void) => {
  try {
    const data = await fetchHistory(userId, 50, 0);
    const hist = applyHistory(data);
    if (hist.length > 0) {
      setState((p: ChatState) => ({ ...p, isThinking: false, aiStatus: null, messages: hist }));
      setOffset(data.messages.length);
    }
  } catch(_e) {}
  runNext(getWaitTimeForDelayed(result));
};

const updatePendingState = (result: any, lang: string, status: string) => (p: ChatState) => {
  if (result?.system_message) {
    const rawSysMessage = JSON.stringify({ chat_message: result.system_message });
    const lastMsg = p.messages[p.messages.length - 1];
    if (lastMsg && lastMsg.role === 'system' && lastMsg.content === rawSysMessage) {
      return { ...p, isThinking: true, aiStatus: 'HIDDEN' };
    }
    const newMsg = { id: `sys-${Date.now()}`, role: 'system', content: rawSysMessage, created_at: new Date().toISOString() };
    return { ...p, isThinking: true, aiStatus: 'HIDDEN', messages: [...p.messages, newMsg] };
  }
  const dict = DICTIONARY[lang as keyof typeof DICTIONARY] as any;
  const txt = status === 'pending' ? (dict?.waitingForServer || 'Waiting for server capacity...') : null;
  return { ...p, isThinking: true, aiStatus: txt };
};

const handleJobPending = (status: string, result: any, lang: string, setState: any, runNext: () => void) => {
  setState(updatePendingState(result, lang, status));
  runNext();
};

const runTick = async (activeJobId: string, isMounted: any, setState: any, setActive: any, setOffset: any, userId: string, lang: string, runNext: any, onError: any) => {
  try {
    const { status, result } = await pollJobStatus(activeJobId);
    if (!isMounted.current) return;
    if (status === 'completed') return handleJobCompleted(activeJobId, result, setState, setActive, setOffset, userId);
    if (status === 'delayed') return handleJobDelayed(result, setState, setOffset, userId, runNext);
    if (status === 'failed') return handleJobFailed(activeJobId, result, setState, setActive, setOffset);
    return handleJobPending(status, result, lang, setState, runNext);
  } catch { onError(); }
};

const createTick = (activeJobId: string, m: any, setState: any, setActive: any, setOffset: any, userId: string, lang: string, ctx: any) => () => {
  if (!m.current) return;
  const runNext = (d = 2000) => {
    ctx.tid = setTimeout(ctx.tick, d);
  };
  const onError = () => {
    if (!m.current) return;
    ctx.errs++;
    ctx.tid = setTimeout(ctx.tick, Math.min(2000 * Math.pow(2, ctx.errs), 30000));
  };
  runTick(activeJobId, m, setState, setActive, setOffset, userId, lang, runNext, onError);
};

const useJobPoller = (activeJobId: string | null, userId: string, lang: string, setState: any, setActive: any, setOffset: any) => {
  useEffect(() => {
    if (!activeJobId) return;
    const m = { current: true };
    const ctx: any = { errs: 0, tid: null };
    ctx.tick = createTick(activeJobId, m, setState, setActive, setOffset, userId, lang, ctx);
    ctx.tick();
    return () => { m.current = false; clearTimeout(ctx.tid); };
  }, [activeJobId, userId, lang, setState, setActive, setOffset]);
};

const createLoadMore = (hasMore: boolean, isLoadingMore: boolean, setIsLoadingMore: any, userId: string, offset: number, setState: any, setOffset: any, setHasMore: any) => async () => {
  if (!hasMore || isLoadingMore) return;
  setIsLoadingMore(true);
  try {
    await new Promise(r => setTimeout(r, 400));
    const data = await fetchHistory(userId, 20, offset);
    const hist = applyHistory(data);
    if (hist.length > 0) {
      setState((p: any) => ({ ...p, messages: [...hist, ...p.messages] }));
      setOffset((p: number) => p + data.messages.length);
      if (data.messages.length < 20) setHasMore(false);
    }
  } catch (e) { console.error(e); }
  setIsLoadingMore(false);
};

const createMsgSender = (userId: string, lang: string, setState: any, setOffset: any, setActiveJobId: any) => async (message: string) => {
  setState((p: any) => ({ ...p, error: null, isThinking: true, aiStatus: null }));
  try {
    const jobId = await sendChatMessage(userId, message, lang);
    setOffset((prev: number) => prev + 1);
    setActiveJobId(jobId);
  } catch (err: any) { setState((p: any) => ({ ...p, isThinking: false, aiStatus: null, error: err.message })); }
};

const createChatClearer = (setState: any, setOffset: any, setHasMore: any) => () => {
  localStorage.removeItem('chat-cache');
  setState({ messages: [], isThinking: false, aiStatus: null, error: null });
  setOffset(0);
  setHasMore(true);
};

const useChatState = () => {
  const [state, setState] = useState<ChatState>(getInitialState);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [chatInput, setChatInput] = useState('');
  return { state, setState, activeJobId, setActiveJobId, offset, setOffset, hasMore, setHasMore, isLoadingMore, setIsLoadingMore, chatInput, setChatInput };
};

export const useChat = (userId: string, lang: string, configured: boolean) => {
  const s = useChatState();
  useInitHistory(userId, configured, s.setState, s.setOffset, s.setHasMore);
  useAppResume(userId, configured, s.setState, s.setOffset);
  useCacheSync(s.state.messages);
  useJobPoller(s.activeJobId, userId, lang, s.setState, s.setActiveJobId, s.setOffset);
  const loadMore = useCallback(createLoadMore(s.hasMore, s.isLoadingMore, s.setIsLoadingMore, userId, s.offset, s.setState, s.setOffset, s.setHasMore), [s.hasMore, s.isLoadingMore, userId, s.offset]);
  const sendNewMessage = createMsgSender(userId, lang, s.setState, s.setOffset, s.setActiveJobId);
  const sendMessage = async (message: string) => {
    s.setState(p => ({ ...p, messages: [...p.messages, { id: Date.now().toString(), role: 'user', content: message }] }));
    await sendNewMessage(message);
  };
  const clearChat = useCallback(createChatClearer(s.setState, s.setOffset, s.setHasMore), []);
  return { state: s.state, sendMessage, retryMessage: sendNewMessage, loadMore, hasMore: s.hasMore, isLoadingMore: s.isLoadingMore, clearChat, chatInput: s.chatInput, setChatInput: s.setChatInput };
};
