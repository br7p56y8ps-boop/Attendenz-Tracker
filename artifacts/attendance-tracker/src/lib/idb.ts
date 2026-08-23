const DB_NAME = 'AttendenzDatabase';
const STORE_NAME = 'key_value_store';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;
let pendingStorageWrites: Promise<void> = Promise.resolve();
export const STORAGE_ERROR_EVENT = 'att-storage-error';

function notifyStorageError(error: unknown, operation: string, key?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, {
    detail: { error, operation, key },
  }));
}

function resetDB(): void {
  dbInstance = null;
  dbPromise = null;
}

function getDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    try {
      // Test if instance is still open (if objectStoreNames is accessible and connection is open)
      if (dbInstance.objectStoreNames) {
        return Promise.resolve(dbInstance);
      }
    } catch {
      resetDB();
    }
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        resetDB();
        reject(new Error('IndexedDB not supported in this environment'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        dbInstance = db;

        db.onclose = () => {
          resetDB();
        };

        db.onversionchange = () => {
          try {
            db.close();
          } catch {}
          resetDB();
        };

        db.onerror = () => {
          resetDB();
        };

        resolve(db);
      };

      request.onerror = () => {
        resetDB();
        reject(request.error || new Error('Failed to open IndexedDB'));
      };

      request.onblocked = () => {
        resetDB();
      };
    });
  }

  return dbPromise;
}

async function withStore<T = void>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  let attempts = 0;
  while (attempts < 2) {
    try {
      const db = await getDB();
      return await new Promise<T | undefined>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(STORE_NAME, mode);
        } catch (txErr) {
          resetDB();
          reject(txErr);
          return;
        }

        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));

        const store = tx.objectStore(STORE_NAME);
        const req = callback(store);
        if (req) {
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => reject(req.error);
        } else {
          tx.oncomplete = () => resolve(undefined);
        }
      });
    } catch (err) {
      resetDB();
      attempts++;
      if (attempts >= 2) {
        throw err;
      }
    }
  }
  return undefined;
}

export async function idbGet(key: string): Promise<string | null> {
  try {
    const res = await withStore<{ key: string; value: string }>('readonly', store => store.get(key));
    return res ? res.value : null;
  } catch (err) {
    notifyStorageError(err, 'get', key);
    return null;
  }
}

export async function idbSet(key: string, value: string): Promise<void> {
  try {
    await withStore('readwrite', store => store.put({ key, value }));
  } catch (err) {
    notifyStorageError(err, 'set', key);
    throw err;
  }
}

export async function idbSetMany(entries: Array<[string, string]>): Promise<void> {
  try {
    await withStore('readwrite', store => {
      entries.forEach(([key, value]) => store.put({ key, value }));
    });
  } catch (err) {
    notifyStorageError(err, 'set-many');
    throw err;
  }
}

export async function idbRemove(key: string): Promise<void> {
  try {
    await withStore('readwrite', store => store.delete(key));
  } catch (err) {
    notifyStorageError(err, 'remove', key);
    throw err;
  }
}

export async function idbRemoveMany(keys: string[]): Promise<void> {
  try {
    await withStore('readwrite', store => {
      keys.forEach(key => store.delete(key));
    });
  } catch (err) {
    notifyStorageError(err, 'remove-many');
    throw err;
  }
}

export async function idbGetAll(): Promise<Record<string, string>> {
  try {
    const items = await withStore<Array<{ key: string; value: string }>>('readonly', store => store.getAll());
    const result: Record<string, string> = {};
    if (items) {
      items.forEach(item => {
        if (item && item.key) {
          result[item.key] = item.value;
        }
      });
    }
    return result;
  } catch (err) {
    notifyStorageError(err, 'get-all');
    return {};
  }
}

export async function idbClear(): Promise<void> {
  try {
    await withStore('readwrite', store => store.clear());
  } catch (err) {
    notifyStorageError(err, 'clear');
    throw err;
  }
}

/**
 * Initializes IndexedDB storage, migrates existing localStorage data to IndexedDB,
 * and populates local cache for instant synchronous reading.
 */
export async function initStorageAndMigrate(): Promise<void> {
  try {
    const alreadyMigrated = await idbGet('att_idb_migrated_v1');
    if (!alreadyMigrated) {
      const localData: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) {
          const v = localStorage.getItem(k);
          if (v !== null) localData[k] = v;
        }
      }

      for (const [k, v] of Object.entries(localData)) {
        await idbSet(k, v);
      }

      await idbSet('att_idb_migrated_v1', 'true');
    }

    const allIdbData = await idbGetAll();
    for (const [k, v] of Object.entries(allIdbData)) {
      if (k !== 'att_idb_migrated_v1') {
        localStorage.setItem(k, v);
      }
    }

    if (typeof window !== 'undefined' && navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch (err) {
    notifyStorageError(err, 'initialization');
  }
}

/**
 * Storage helpers that perform dual updates to IndexedDB (source of truth)
 * and localStorage (instant read cache).
 */
function queueStorageWrite(operation: () => Promise<void>): Promise<void> {
  const next = pendingStorageWrites.then(operation);
  pendingStorageWrites = next.catch(() => undefined);
  return next;
}

export function storageSetItem(key: string, value: string): Promise<void> {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    notifyStorageError(err, 'local-cache-set', key);
  }
  return queueStorageWrite(() => idbSet(key, value)).catch(() => undefined);
}

export function storageRemoveItem(key: string): Promise<void> {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    notifyStorageError(err, 'local-cache-remove', key);
  }
  return queueStorageWrite(() => idbRemove(key)).catch(() => undefined);
}

export function storageClear(): Promise<void> {
  try {
    localStorage.clear();
  } catch (err) {
    notifyStorageError(err, 'local-cache-clear');
  }
  return queueStorageWrite(() => idbClear()).catch(() => undefined);
}

export function flushStorageWrites(): Promise<void> {
  return pendingStorageWrites;
}
