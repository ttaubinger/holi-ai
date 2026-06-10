import { useEffect } from 'react';
import { useCache } from './useCache';
import { ActionModule } from '../types';

const fetchDbModules = async (): Promise<ActionModule[] | undefined> => {
  try {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const keys = { sbConnUrl: localStorage.getItem('SUPABASE_CONN_URL'), neonUrl: localStorage.getItem('NEON_URL') };
    const res = await fetch(`${url}/chat/modules?userId=usr_1`, { headers: { 'x-ecosystem-keys': JSON.stringify(keys) } });
    if (!res.ok) return undefined;
    const { modules } = await res.json();
    return modules || [];
  } catch (_e) {
    return undefined;
  }
};

const deleteDbModule = async (title: string) => {
  try {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const keys = { sbConnUrl: localStorage.getItem('SUPABASE_CONN_URL'), neonUrl: localStorage.getItem('NEON_URL') };
    await fetch(`${url}/chat/modules/${encodeURIComponent(title)}?userId=usr_1`, { method: 'DELETE', headers: { 'x-ecosystem-keys': JSON.stringify(keys) } });
  } catch (_e) { }
};

export const useModules = (configured: boolean, tab: string) => {
  const { data: modules, revalidate } = useCache<ActionModule[]>('modules-cache', fetchDbModules, []);
  
  useEffect(() => {
    if (configured) revalidate();
  }, [configured, tab]);

  const deleteModule = async (title: string) => {
    await deleteDbModule(title);
    revalidate();
  };

  return { modules, deleteModule };
};
