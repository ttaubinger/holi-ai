import { useState, useCallback } from 'react';

export interface LlmTrace {
  id: string;
  user_id: string;
  model: string;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  payload_input: any;
  payload_output: any;
  created_at: string;
}

const getDebugMode = () => {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('DEBUG_MODE') !== 'false';
};

const getEcosystemKeys = () => {
  return {
    groqKey: localStorage.getItem('GROQ_KEY') || '',
    groqModel: localStorage.getItem('GROQ_MODEL') || 'llama-3.3-70b-versatile',
    ragThreshold: localStorage.getItem('RAG_THRESHOLD') || '0.5',
    debugMode: getDebugMode(),
    sbConnUrl: localStorage.getItem('SUPABASE_CONN_URL') || '',
    neonUrl: localStorage.getItem('NEON_URL') || '',
    userId: localStorage.getItem('USER_ID') || 'usr_1'
  };
};

const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const doFetchTraces = async (keys: any, limit: number, offset: number) => {
  const url = `${getApiUrl()}/debug/traces?limit=${limit}&offset=${offset}`;
  const response = await fetch(url, { headers: { 'x-ecosystem-keys': JSON.stringify(keys) } });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to fetch traces: ${response.status} ${errText}`);
  }
  return await response.json();
};

const doFetchQueue = async (keys: any, userId: string) => {
  const url = `${getApiUrl()}/chat/queue?userId=${userId}`;
  const response = await fetch(url, { headers: { 'x-ecosystem-keys': JSON.stringify(keys) } });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to fetch queue: ${response.status} ${errText}`);
  }
  return await response.json();
};

const useFetchTraces = (setTraces: any, setIsLoading: any, setError: any) => {
  return useCallback(async (limit = 50, offset = 0) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await doFetchTraces(getEcosystemKeys(), limit, offset);
      setTraces(data.traces || []);
    } catch (err: any) {
      setError(err.message || 'Unknown error fetching traces');
    } finally {
      setIsLoading(false);
    }
  }, [setTraces, setIsLoading, setError]);
};

const useFetchQueue = (setQueueItems: any, setIsQueueLoading: any, setQueueError: any) => {
  return useCallback(async () => {
    setIsQueueLoading(true);
    setQueueError(null);
    try {
      const keys = getEcosystemKeys();
      const data = await doFetchQueue(keys, keys.userId);
      setQueueItems(data.queue || []);
    } catch (err: any) {
      setQueueError(err.message || 'Unknown error fetching queue');
    } finally {
      setIsQueueLoading(false);
    }
  }, [setQueueItems, setIsQueueLoading, setQueueError]);
};

export function useDebug() {
  const [traces, setTraces] = useState<LlmTrace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queueItems, setQueueItems] = useState<string[]>([]);
  const [isQueueLoading, setIsQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  const fetchTraces = useFetchTraces(setTraces, setIsLoading, setError);
  const fetchQueue = useFetchQueue(setQueueItems, setIsQueueLoading, setQueueError);

  return { traces, isLoading, error, fetchTraces, queueItems, isQueueLoading, queueError, fetchQueue };
}
