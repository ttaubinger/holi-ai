import { useState, useCallback, useRef, useEffect } from 'react';

export interface LlmTrace {
  id: string; user_id: string; model: string; latency_ms: number; prompt_tokens: number;
  completion_tokens: number; total_tokens: number; payload_input: any; payload_output: any; created_at: string;
}

const PAGE_SIZE = 50;

const getEcosystemKeys = () => ({
  groqKey: localStorage.getItem('GROQ_KEY') || '',
  groqModel: localStorage.getItem('GROQ_MODEL') || 'openai/gpt-oss-120b',
  ragThreshold: localStorage.getItem('RAG_THRESHOLD') || '0.5',
  debugMode: typeof window === 'undefined' ? true : localStorage.getItem('DEBUG_MODE') !== 'false',
  sbConnUrl: localStorage.getItem('SUPABASE_CONN_URL') || '',
  neonUrl: localStorage.getItem('NEON_URL') || '',
  userId: localStorage.getItem('USER_ID') || 'usr_1'
});

const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const doFetchTraces = async (keys: any, limit: number, offset: number) => {
  const url = `${getApiUrl()}/debug/traces?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, { headers: { 'x-ecosystem-keys': JSON.stringify(keys) } });
  if (!res.ok) throw new Error(`Failed to fetch traces: ${res.status} ${await res.text()}`);
  return res.json();
};

const doFetchQueue = async (keys: any, userId: string) => {
  const url = `${getApiUrl()}/chat/queue?userId=${userId}`;
  const res = await fetch(url, { headers: { 'x-ecosystem-keys': JSON.stringify(keys) } });
  if (!res.ok) throw new Error(`Failed to fetch queue: ${res.status} ${await res.text()}`);
  return res.json();
};



const fetchTracesCb = async (setTraces: any, setIsLoading: any, setError: any, setHasMore: any, offsetRef: any) => {
  setIsLoading(true); setError(null); offsetRef.current = 0;
  try {
    const { traces } = await doFetchTraces(getEcosystemKeys(), PAGE_SIZE, 0);
    setTraces(() => traces || []); setHasMore((traces || []).length >= PAGE_SIZE); offsetRef.current = (traces || []).length;
  } catch (err: any) { setError(err.message || 'Unknown error'); } 
  finally { setIsLoading(false); }
};

const loadMoreCb = async (setTraces: any, setIsLoadingMore: any, setError: any, setHasMore: any, offsetRef: any) => {
  setIsLoadingMore(true); setError(null);
  try {
    const { traces } = await doFetchTraces(getEcosystemKeys(), PAGE_SIZE, offsetRef.current || 0);
    const fetched = traces || [];
    setTraces((prev: LlmTrace[]) => {
      const ids = new Set(prev.map(t => t.id)); return [...prev, ...fetched.filter((t: LlmTrace) => !ids.has(t.id))];
    });
    setHasMore(fetched.length >= PAGE_SIZE); offsetRef.current = (offsetRef.current || 0) + fetched.length;
  } catch (err: any) { setError(err.message || 'Error'); } 
  finally { setIsLoadingMore(false); }
};

const fetchQueueCb = async (setQueueItems: any, setIsQueueLoading: any, setQueueError: any) => {
  setIsQueueLoading(true); setQueueError(null);
  try {
    const keys = getEcosystemKeys();
    const data = await doFetchQueue(keys, keys.userId);
    setQueueItems(data.queue || []);
  } catch (err: any) { setQueueError(err.message || 'Unknown error'); } 
  finally { setIsQueueLoading(false); }
};



const useTraceState = () => {
  const [traces, setTraces] = useState<LlmTrace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return { traces, setTraces, isLoading, setIsLoading, isLoadingMore, setIsLoadingMore, hasMore, setHasMore, error, setError };
};

const useQueueState = () => {
  const [queueItems, setQueueItems] = useState<string[]>([]);
  const [isQueueLoading, setIsQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  return { queueItems, setQueueItems, isQueueLoading, setIsQueueLoading, queueError, setQueueError };
};

export function useDebug() {
  const t = useTraceState();
  const q = useQueueState();
  const offsetRef = useRef<number>(0);
  const fetchTraces = useCallback(() => fetchTracesCb(t.setTraces, t.setIsLoading, t.setError, t.setHasMore, offsetRef), [t.setTraces, t.setIsLoading, t.setError, t.setHasMore, offsetRef]);
  const loadMoreTraces = useCallback(() => loadMoreCb(t.setTraces, t.setIsLoadingMore, t.setError, t.setHasMore, offsetRef), [t.setTraces, t.setIsLoadingMore, t.setError, t.setHasMore, offsetRef]);
  const fetchQueue = useCallback(() => fetchQueueCb(q.setQueueItems, q.setIsQueueLoading, q.setQueueError), [q.setQueueItems, q.setIsQueueLoading, q.setQueueError]);
  useEffect(() => { fetchTraces(); fetchQueue(); const iv = setInterval(fetchQueue, 5000); return () => clearInterval(iv); }, [fetchTraces, fetchQueue]);
  return { ...t, ...q, fetchTraces, loadMoreTraces, fetchQueue, offsetRef };
}
