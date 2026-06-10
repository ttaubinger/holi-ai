import { useState, useEffect, useCallback } from 'react';

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

const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const doFetchBiometrics = async (userId: string, limit: number, offset: number) => {
  const response = await fetch(`${getApiUrl()}/biometrics/logs?userId=${userId}&limit=${limit}&offset=${offset}`, {
    headers: { 'X-Ecosystem-Keys': getEcosystemKeys() }
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.logs || [];
};

const doSubmitBiometric = async (userId: string, data: any) => {
  const response = await fetch(`${getApiUrl()}/biometrics/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ecosystem-Keys': getEcosystemKeys() },
    body: JSON.stringify({ userId, ...data }),
  });
  if (!response.ok) throw new Error('Failed to save log');
};

const getInitialLogs = () => {
  if (typeof window === 'undefined') return [];
  const cached = localStorage.getItem('biometrics-log-cache');
  return cached ? JSON.parse(cached) : [];
};

const useBiometricsCache = (logs: any[]) => {
  useEffect(() => {
    if (typeof window !== 'undefined' && logs.length > 0) {
      localStorage.setItem('biometrics-log-cache', JSON.stringify(logs));
    }
  }, [logs]);
};

const createLogSubmitter = (userId: string, setIsSubmitting: any, setSubmitError: any, fetchLogs: any) => async (data: any) => {
  setIsSubmitting(true);
  setSubmitError(null);
  try {
    await doSubmitBiometric(userId, data);
    await fetchLogs();
    return true;
  } catch (e: any) {
    setSubmitError(e.message);
    return false;
  } finally {
    setIsSubmitting(false);
  }
};

const useBiometricsState = () => {
  const [logs, setLogs] = useState<any[]>(getInitialLogs);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  return { logs, setLogs, isSubmitting, setIsSubmitting, isLoadingLogs, setIsLoadingLogs, submitError, setSubmitError };
};

export const useBiometricsLog = (userId: string) => {
  const s = useBiometricsState();
  const fetchLogs = useCallback(async (limit = 10, offset = 0) => {
    s.setIsLoadingLogs(true);
    try { s.setLogs(await doFetchBiometrics(userId, limit, offset)); } 
    catch (_e) { console.error(_e); } 
    finally { s.setIsLoadingLogs(false); }
  }, [userId]);
  const submitLog = createLogSubmitter(userId, s.setIsSubmitting, s.setSubmitError, fetchLogs);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useBiometricsCache(s.logs);
  return { logs: s.logs, isSubmitting: s.isSubmitting, isLoadingLogs: s.isLoadingLogs, submitError: s.submitError, submitLog, fetchLogs };
};
