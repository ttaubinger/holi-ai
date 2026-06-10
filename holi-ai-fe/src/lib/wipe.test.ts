import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wipeClientStorage, clearWebStorage, clearIndexedDb, clearCachesAndWorkers } from './wipe';

const installIdb = (dbs: { name: string }[]) => {
  const deleted: string[] = [];
  const idb = {
    databases: vi.fn().mockResolvedValue(dbs),
    deleteDatabase: vi.fn((name: string) => {
      deleted.push(name);
      const req: any = {};
      setTimeout(() => req.onsuccess && req.onsuccess(), 0);
      return req;
    })
  };
  (window as any).indexedDB = idb;
  return { idb, deleted };
};

const installCaches = (keys: string[]) => {
  const deleted: string[] = [];
  (window as any).caches = {
    keys: vi.fn().mockResolvedValue(keys),
    delete: vi.fn((k: string) => { deleted.push(k); return Promise.resolve(true); })
  };
  return deleted;
};

const installServiceWorker = (regs: any[]) => {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistrations: vi.fn().mockResolvedValue(regs) }
  });
};

const testClearWebStorage = () => {
  clearWebStorage();
  expect(localStorage.getItem('a')).toBeNull();
  expect(sessionStorage.getItem('b')).toBeNull();
};

const testClearIdb = async () => {
  const { idb, deleted } = installIdb([{ name: 'db1' }, { name: 'db2' }]);
  await clearIndexedDb();
  expect(idb.databases).toHaveBeenCalled();
  expect(deleted).toEqual(['db1', 'db2']);
};

const testClearIdbNoop = async () => {
  (window as any).indexedDB = {};
  await expect(clearIndexedDb()).resolves.toBeUndefined();
};

const testClearCachesAndWorkers = async () => {
  const deletedCaches = installCaches(['c1', 'c2']);
  const unregister = vi.fn().mockResolvedValue(true);
  installServiceWorker([{ unregister }, { unregister }]);
  await clearCachesAndWorkers();
  expect(deletedCaches).toEqual(['c1', 'c2']);
  expect(unregister).toHaveBeenCalledTimes(2);
};

const testWipeEndToEnd = async () => {
  const { deleted: idbDel } = installIdb([{ name: 'dbX' }]);
  const cacheDel = installCaches(['cX']);
  const unregister = vi.fn().mockResolvedValue(true);
  installServiceWorker([{ unregister }]);
  await wipeClientStorage();
  expect(localStorage.getItem('a')).toBeNull();
  expect(sessionStorage.getItem('b')).toBeNull();
  expect(idbDel).toEqual(['dbX']);
  expect(cacheDel).toEqual(['cX']);
  expect(unregister).toHaveBeenCalledTimes(1);
};

const testWipeSwallowsErrors = async () => {
  (window as any).indexedDB = { databases: () => { throw new Error('idb boom'); } };
  (window as any).caches = { keys: () => Promise.reject(new Error('caches boom')) };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistrations: () => Promise.reject(new Error('sw boom')) }
  });
  await expect(wipeClientStorage()).resolves.toBeUndefined();
  expect(localStorage.getItem('a')).toBeNull();
};

const seedStorage = () => {
  localStorage.setItem('a', '1');
  sessionStorage.setItem('b', '2');
};

describe('wipeClientStorage', () => {
  beforeEach(seedStorage);
  it('clearWebStorage clears localStorage and sessionStorage', testClearWebStorage);
  it('clearIndexedDb deletes every database returned by databases()', testClearIdb);
  it('clearIndexedDb is a no-op when indexedDB.databases is unavailable', testClearIdbNoop);
  it('clearCachesAndWorkers deletes all caches and unregisters all service workers', testClearCachesAndWorkers);
  it('wipeClientStorage runs all clearers end-to-end', testWipeEndToEnd);
  it('wipeClientStorage swallows errors from any individual layer', testWipeSwallowsErrors);
});
