import { useState, useEffect } from 'react';

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

export const useGarminLog = (userId: string) => {
  const [logs, setLogs] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [];
    const cached = localStorage.getItem('garmin-cache');
    return cached ? JSON.parse(cached) : [];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchLogs = async (limit = 10, offset = 0) => {
    setIsLoadingLogs(true);
    try {
      const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const response = await fetch(`${url}/garmin/logs?userId=${userId}&limit=${limit}&offset=${offset}`, {
        headers: { 'X-Ecosystem-Keys': getEcosystemKeys() }
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch (_e) {
      console.error(_e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const submitLog = async (data: any) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const response = await fetch(`${url}/garmin/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ecosystem-Keys': getEcosystemKeys() },
        body: JSON.stringify({ userId, ...data }),
      });
      if (!response.ok) {
        throw new Error('Failed to save log');
      }
      await fetchLogs();
      return true;
    } catch (e: any) {
      setSubmitError(e.message);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [userId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && logs.length > 0) {
      localStorage.setItem('garmin-cache', JSON.stringify(logs));
    }
  }, [logs]);

  return { logs, isSubmitting, isLoadingLogs, submitError, submitLog, fetchLogs };
};
