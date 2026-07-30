import { Injectable } from '@angular/core';

/**
 * Safe JSON-backed wrapper over Web Storage. Supports both localStorage
 * (persistent) and sessionStorage (tab-scoped). Degrades gracefully when a
 * store is unavailable (private mode, disabled, SSR) — reads return null and
 * writes are no-ops instead of throwing.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly local = this.pick(() => localStorage);
  private readonly session = this.pick(() => sessionStorage);

  // ---- Persistent (localStorage) ----
  getItem<T>(key: string): T | null {
    return this.read<T>(this.local, key);
  }
  setItem(key: string, value: unknown): void {
    this.write(this.local, key, value);
  }
  removeItem(key: string): void {
    this.delete(this.local, key);
  }

  // ---- Tab-scoped (sessionStorage) ----
  getSessionItem<T>(key: string): T | null {
    return this.read<T>(this.session, key);
  }
  setSessionItem(key: string, value: unknown): void {
    this.write(this.session, key, value);
  }
  removeSessionItem(key: string): void {
    this.delete(this.session, key);
  }

  private read<T>(store: Storage | null, key: string): T | null {
    if (!store) {
      return null;
    }
    try {
      const raw = store.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private write(store: Storage | null, key: string, value: unknown): void {
    if (!store) {
      return;
    }
    try {
      store.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / serialization errors */
    }
  }

  private delete(store: Storage | null, key: string): void {
    if (!store) {
      return;
    }
    try {
      store.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  private pick(get: () => Storage): Storage | null {
    try {
      const store = get();
      const testKey = '__fb_storage_test__';
      store.setItem(testKey, '1');
      store.removeItem(testKey);
      return store;
    } catch {
      return null;
    }
  }
}
