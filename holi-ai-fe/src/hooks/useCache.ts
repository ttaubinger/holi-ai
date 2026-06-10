import { useState } from 'react';

const getInitialCache = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  const cached = localStorage.getItem(key);
  return cached ? JSON.parse(cached) : fallback;
};

export const useCache = <T>(key: string, fetcher: () => Promise<T | undefined>, initial: T) => {
  const [data, setData] = useState<T>(() => getInitialCache(key, initial));
  const revalidate = async () => {
    const fresh = await fetcher();
    if (fresh === undefined) return;
    setData(fresh);
    if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(fresh));
  };
  const mutate = (newData: T) => {
    setData(newData);
    if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(newData));
  };
  return { data, revalidate, mutate };
};
