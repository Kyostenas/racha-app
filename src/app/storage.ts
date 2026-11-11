import { Injectable } from '@angular/core';
import { z } from 'zod';
export const cambiosLocales = new EventTarget();
export const STORES = ['perfil', 'hábitos', 'rachas', 'registros', 'ajustes', 'temasPersonalizados', 'comunidad', 'cuenta'];
export const STORES_SYNC = ['perfil', 'hábitos', 'rachas', 'registros', 'ajustes', 'temasPersonalizados', 'comunidad'] as const;
export const DB_VERSION = 4;
@Injectable({ providedIn: 'root' })
export class LocalStore {
  private connection: Promise<IDBDatabase> | null = null;
  private db(): Promise<IDBDatabase> {
    this.connection ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('racha', DB_VERSION);
      request.onupgradeneeded = () => {
        for (const name of STORES)
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name, { keyPath: 'id' });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          this.connection = null;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        this.connection = null;
        reject(new Error('No pudimos abrir tus datos. Revisa permisos de almacenamiento.'));
      };
    });
    return this.connection;
  }
  async get<T>(store: string, id: string, schema: z.ZodType<T>): Promise<T | null> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).get(id);
      request.onsuccess = () => {
        if (request.result === undefined) resolve(null);
        else {
          const result = schema.safeParse(request.result);
          result.success
            ? resolve(result.data)
            : reject(
                new Error(
                  'Tus datos locales no tienen el formato esperado. Puedes borrarlos en Ajustes.',
                ),
              );
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
  async all<T>(store: string, schema: z.ZodType<T[]>): Promise<T[]> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => {
        const result = schema.safeParse(r.result);
        result.success ? resolve(result.data) : reject(new Error('No pudimos leer tus registros.'));
      };
      r.onerror = () => reject(r.error);
    });
  }
  async put(store: string, value: unknown): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => { if (store !== 'cuenta') cambiosLocales.dispatchEvent(new Event('cambio')); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async delete(store: string, id: string): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => { if (store !== 'cuenta') cambiosLocales.dispatchEvent(new Event('cambio')); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async clear(): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES, 'readwrite');
      for (const name of STORES) tx.objectStore(name).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  // Volcado de solo texto para el respaldo cifrado. No incluye la sesión (token).
  async exportarSync(): Promise<Record<string, unknown[]>> {
    const db = await this.db();
    const out: Record<string, unknown[]> = {};
    for (const name of STORES_SYNC) {
      out[name] = await new Promise((resolve, reject) => {
        const r = db.transaction(name).objectStore(name).getAll();
        r.onsuccess = () => resolve(r.result as unknown[]);
        r.onerror = () => reject(r.error);
      });
    }
    return out;
  }
  async importarSync(datos: Record<string, unknown[]>): Promise<void> {
    const db = await this.db();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...STORES_SYNC], 'readwrite');
      for (const name of STORES_SYNC) {
        const store = tx.objectStore(name);
        store.clear();
        for (const fila of datos[name] ?? []) store.put(fila);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}
