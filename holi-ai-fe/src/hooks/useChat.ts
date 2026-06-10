import { useState, useEffect } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatState {
  messages: ChatMessage[];
  isThinking: boolean;
  error: string | null;
}

const getEcosystemKeys = () => {
  if (typeof window === 'undefined') return '{}';
  return JSON.stringify({
    sbConnUrl: localStorage.getItem('SUPABASE_CONN_URL') || '',
    neonUrl: localStorage.getItem('NEON_URL') || '',
    groqKey: localStorage.getItem('GROQ_KEY') || '',
    groqModel: localStorage.getItem('GROQ_MODEL') || 'llama-3.3-70b-versatile',
    appleHealth: localStorage.getItem('APPLE_HEALTH_TOKEN') || '',
    garmin: localStorage.getItem('GARMIN_TOKEN') || ''
  });
};

const sendChatMessage = async (userId: string, message: string, lang: string): Promise<string> => {
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  let response;
  try {
    response = await fetch(`${url}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ecosystem-Keys': getEcosystemKeys() },
      body: JSON.stringify({ userId, message, lang }),
    });
  } catch (err: any) {
    throw new Error(`Network Error: ${err.message}\nStack: ${err.stack}`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${response.statusText}\nResponse: ${text}`);
  }
  const data = await response.json();
  return data.jobId;
};

const pollJobStatus = async (jobId: string): Promise<any> => {
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  let response;
  try {
    response = await fetch(`${url}/chat/status?jobId=${jobId}`, {
      headers: { 'X-Ecosystem-Keys': getEcosystemKeys() }
    });
  } catch (err: any) {
    throw new Error(`Network Error: ${err.message}\nStack: ${err.stack}`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${response.statusText}\nResponse: ${text}`);
  }
  return response.json();
};

const fetchHistory = async (userId: string, limit: number, offset: number): Promise<any> => {
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  let response;
  try {
    response = await fetch(`${url}/chat/history?userId=${userId}&limit=${limit}&offset=${offset}`, {
      headers: { 'X-Ecosystem-Keys': getEcosystemKeys() }
    });
  } catch (err: any) {
    throw new Error(`Network Error: ${err.message}\nStack: ${err.stack}`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${response.statusText}\nResponse: ${text}`);
  }
  return response.json();
};

const handleFailedJob = (jobId: string, result: any, setState: any, setActiveJobId: any, setOffset: any) => {
  let aiReply = '';
  let errMsg = 'Job failed';
  try {
    if (result?.error) {
      const idx = result.error.indexOf('{');
      if (idx >= 0) aiReply = JSON.parse(result.error.substring(idx))?.error?.failed_generation || '';
    }
  } catch (_e) {}
  if (aiReply) {
    setState((p: ChatState) => ({ ...p, isThinking: false, messages: [...p.messages, { id: jobId, role: 'assistant', content: JSON.stringify({ chat_message: aiReply }) }] }));
    setOffset((o: number) => o + 1);
  } else {
    setState((p: ChatState) => ({ ...p, isThinking: false, error: result?.error || errMsg }));
  }
  setActiveJobId(null);
};



export const useChat = (userId: string, lang: string) => {
  const [state, setState] = useState<ChatState>(() => {
    if (typeof window === 'undefined') return { messages: [], isThinking: false, error: null };
    const cached = localStorage.getItem('chat-cache');
    return { messages: cached ? JSON.parse(cached) : [], isThinking: false, error: null };
  });
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const limit = 20;

  const loadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      await new Promise(r => setTimeout(r, 400));
      const data = await fetchHistory(userId, limit, offset);
      if (data.messages) {
        const hist = data.messages.map((m: any, i: number) => ({ id: `h-${offset + i}`, role: m.role, content: m.message }));
        setState(prev => {
          return { ...prev, messages: [...hist, ...prev.messages] };
        });
        setOffset(prev => prev + data.messages.length);
        if (data.messages.length < limit) setHasMore(false);
      }
    } catch (_e) {
      console.error(_e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    // Only reset if empty, otherwise keep cache
    if (state.messages.length === 0) setState({ messages: [], isThinking: false, error: null });
    setOffset(0);
    setHasMore(true);
    let isMounted = true;
    fetchHistory(userId, limit, 0).then(data => {
      if (isMounted && data.messages) {
        const hist = data.messages.map((m: any, i: number) => ({ id: `h-${i}`, role: m.role, content: m.message }));
        setState(prev => ({ ...prev, messages: hist }));
        setOffset(data.messages.length);
        if (data.messages.length < limit) setHasMore(false);
      }
    }).catch(console.error);
    return () => { isMounted = false; };
  }, [userId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && state.messages.length > 0) {
      localStorage.setItem('chat-cache', JSON.stringify(state.messages));
    }
  }, [state.messages]);

  useEffect(() => {
    if (!activeJobId) return;
    let timerId: NodeJS.Timeout;
    const isMounted = { current: true };
    const handledDelays = new Set<string>();

    const tick = async () => {
      if (!isMounted.current) return;
      try {
        const { status, result } = await pollJobStatus(activeJobId);
        if (!isMounted.current) return;

        if (status === 'completed') {
          setState((prev: ChatState) => ({ ...prev, isThinking: false, messages: [...prev.messages, { id: activeJobId, role: 'assistant', content: JSON.stringify(result) }] }));
          setOffset(prev => prev + 1);
          setActiveJobId(null);
          return;
        } else if (status === 'delayed') {
          if (result?.message && !handledDelays.has(activeJobId)) {
            handledDelays.add(activeJobId);
            setState((prev: ChatState) => ({ ...prev, isThinking: false, messages: [...prev.messages, { id: `delay-${activeJobId}`, role: 'system', content: JSON.stringify({ chat_message: result.message }) }] }));
            setOffset(prev => prev + 1);
          } else {
            setState((prev: ChatState) => ({ ...prev, isThinking: false }));
          }
          let waitTime = 2000;
          if (result?.resumeAt) {
            const diff = result.resumeAt - Date.now();
            if (diff > 0) waitTime = diff + 2000;
          }
          timerId = setTimeout(tick, waitTime);
          return;
        } else if (status === 'failed') {
          handleFailedJob(activeJobId, result, setState, setActiveJobId, setOffset);
          return;
        }

        timerId = setTimeout(tick, 2000);
      } catch (err: any) {
        if (!isMounted.current) return;
        setState((prev: ChatState) => ({ ...prev, isThinking: false, error: err.message }));
        setActiveJobId(null);
      }
    };

    tick();

    return () => {
      isMounted.current = false;
      clearTimeout(timerId);
    };
  }, [activeJobId]);

  const sendMessage = async (message: string) => {
    setState((prev) => ({ ...prev, error: null, isThinking: true, messages: [...prev.messages, { id: Date.now().toString(), role: 'user', content: message }] }));
    try {
      const jobId = await sendChatMessage(userId, message, lang);
      setOffset(prev => prev + 1);
      setActiveJobId(jobId);
    } catch (err: any) {
      setState((prev) => ({ ...prev, isThinking: false, error: err.message }));
    }
  };

  const retryMessage = async (message: string) => {
    setState((prev) => ({ ...prev, error: null, isThinking: true }));
    try {
      const jobId = await sendChatMessage(userId, message, lang);
      setOffset(prev => prev + 1);
      setActiveJobId(jobId);
    } catch (err: any) {
      setState((prev) => ({ ...prev, isThinking: false, error: err.message }));
    }
  };

  return { state, sendMessage, retryMessage, loadMore, hasMore, isLoadingMore };
};
