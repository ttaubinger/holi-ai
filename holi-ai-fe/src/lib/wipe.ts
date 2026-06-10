export const clearWebStorage = () => {
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
};

export const clearIndexedDb = async () => {
  try {
    const idb: any = (window as any).indexedDB;
    if (idb && typeof idb.databases === 'function') {
      const dbs = await idb.databases();
      await Promise.all((dbs || []).map((d: any) => d?.name && new Promise(res => {
        const req = idb.deleteDatabase(d.name);
        req.onsuccess = req.onerror = req.onblocked = () => res(null);
      })));
    }
  } catch {}
};

export const clearCachesAndWorkers = async () => {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch {}
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch {}
};

export const wipeClientStorage = async () => {
  clearWebStorage();
  await clearIndexedDb();
  await clearCachesAndWorkers();
};
