import { useEffect } from 'react';
import { useCache } from './useCache';
import { Cron } from '../types';

const fetchDbCrons = async (): Promise<Cron[] | undefined> => {
  try {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const keys = { sbConnUrl: localStorage.getItem('SUPABASE_CONN_URL'), neonUrl: localStorage.getItem('NEON_URL') };
    const res = await fetch(`${url}/chat/crons?userId=usr_1&_t=${Date.now()}`, { 
      headers: { 'x-ecosystem-keys': JSON.stringify(keys), 'Cache-Control': 'no-cache' },
      cache: 'no-store'
    });
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
      headers: { 'Content-Type': 'application/json', 'x-ecosystem-keys': JSON.stringify(keys) },
      body: JSON.stringify({ userId: 'usr_1', is_active: isActive })
    });
  } catch (_e) { }
};

const updateDbCron = async (cronId: string, cronData: Partial<Cron>) => {
  try {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const keys = { sbConnUrl: localStorage.getItem('SUPABASE_CONN_URL'), neonUrl: localStorage.getItem('NEON_URL') };
    await fetch(`${url}/chat/crons/${cronId}`, { 
      method: 'PUT', 
      headers: { 'Content-Type': 'application/json', 'x-ecosystem-keys': JSON.stringify(keys) },
      body: JSON.stringify({ userId: 'usr_1', ...cronData })
    });
  } catch (_e) { }
};

const del = (crons: any, mutate: any, rev: any) => async (id: string) => {
  if (crons) mutate(crons.filter((c: any) => c.cron_id !== id));
  await deleteDbCron(id); await rev();
};

const cre = (crons: any, mutate: any, rev: any) => async (id: string, d: any) => {
  if (crons) mutate([...crons, { ...d, cron_id: id, is_active: true }]);
  await updateDbCron(id, { ...d, is_active: true }); await rev();
};

const upd = (crons: any, mutate: any, rev: any) => async (mapFn: any, p: Promise<any>) => {
  if (crons) mutate(crons.map(mapFn));
  await p; await rev();
};

export const useCrons = (configured: boolean, tab: string, syncTrigger?: any) => {
  const { data: crons, revalidate: rev, mutate } = useCache<Cron[]>('crons-cache', fetchDbCrons, []);
  useEffect(() => { if (configured) rev(); }, [configured, tab, syncTrigger]);
  const updateCron = async (id: string, d: any) => upd(crons, mutate, rev)((c: any) => c.cron_id === id ? { ...c, ...d } : c, updateDbCron(id, d));
  const toggleCron = async (id: string, a: boolean) => upd(crons, mutate, rev)((c: any) => c.cron_id === id ? { ...c, is_active: a } : c, toggleDbCron(id, a));
  return { crons, deleteCron: del(crons, mutate, rev), createCron: cre(crons, mutate, rev), toggleCron, updateCron };
};
