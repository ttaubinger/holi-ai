import { useState } from 'react';
import { useCache } from './useCache';

export interface ActivityLog {
  id?: string;
  user_id?: string;
  cron_id?: string;
  activity_title: string;
  log_type: string;
  number_value?: number;
  boolean_value?: boolean;
  text_value?: string;
  logged_at?: string;
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

const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const doFetchLogs = async (userId: string) => {
  const response = await fetch(`${getApiUrl()}/activities/logs?userId=${userId}`, {
    headers: { 'x-ecosystem-keys': getEcosystemKeys() }
  });
  const data = await response.json();
  return data.logs || [];
};

const doSubmitLog = async (userId: string, data: ActivityLog) => {
  const response = await fetch(`${getApiUrl()}/activities/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ecosystem-keys': getEcosystemKeys() },
    body: JSON.stringify({ userId, ...data }),
  });
  return response.ok;
};

const createSubmitter = (userId: string, revalidate: any, setIsSubmitting: any) => async (data: ActivityLog) => {
  setIsSubmitting(true);
  try {
    const ok = await doSubmitLog(userId, data);
    if (ok) await revalidate();
    return ok;
  } catch (_e) { return false; } 
  finally { setIsSubmitting(false); }
};

export const useActivities = (userId: string) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: logs, revalidate } = useCache<ActivityLog[]>('activities-cache', () => doFetchLogs(userId), []);
  const submitLog = createSubmitter(userId, revalidate, setIsSubmitting);
  return { logs, isSubmitting, submitLog, fetchLogs: revalidate };
};
