import { useEffect } from 'react';
import { useCache } from './useCache';
import { Cron } from '../types';

const fetchDbCrons = async (): Promise<Cron[] | undefined> => {
  try {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const keys = { sbConnUrl: localStorage.getItem('SUPABASE_CONN_URL'), neonUrl: localStorage.getItem('NEON_URL') };
    const res = await fetch(`${url}/chat/crons?userId=usr_1`, { headers: { 'x-ecosystem-keys': JSON.stringify(keys) } });
    if (!res.ok) return undefined;
    const { crons } = await res.json();
    return crons || [];
  } catch (_e) {
    return undefined;
  }
};

const deleteDbCron = async (cronId: string) => {
  try {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const keys = { sbConnUrl: localStorage.getItem('SUPABASE_CONN_URL'), neonUrl: localStorage.getItem('NEON_URL') };
    await fetch(`${url}/chat/crons/${cronId}?userId=usr_1`, { method: 'DELETE', headers: { 'x-ecosystem-keys': JSON.stringify(keys) } });
  } catch (_e) { }
};

const toggleDbCron = async (cronId: string, isActive: boolean) => {
  try {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const keys = { sbConnUrl: localStorage.getItem('SUPABASE_CONN_URL'), neonUrl: localStorage.getItem('NEON_URL') };
    await fetch(`${url}/chat/crons/${cronId}/toggle`, { 
      method: 'POST', 
      headers: { 
        'Content-Type': 'application/json',
        'x-ecosystem-keys': JSON.stringify(keys) 
      },
      body: JSON.stringify({ userId: 'usr_1', is_active: isActive })
    });
  } catch (_e) { }
};

export const useCrons = (configured: boolean, tab: string, syncTrigger?: any) => {
  const { data: crons, revalidate } = useCache<Cron[]>('crons-cache', fetchDbCrons, []);
  useEffect(() => { if (configured) revalidate(); }, [configured, tab, syncTrigger]);
  const deleteCron = async (id: string) => {
    await deleteDbCron(id);
    revalidate();
  };
  const toggleCron = async (id: string, isActive: boolean) => {
    await toggleDbCron(id, isActive);
    revalidate();
  };
  return { crons, deleteCron, toggleCron };
};
