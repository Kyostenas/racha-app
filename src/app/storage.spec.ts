import { describe, it, expect, beforeAll } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { LocalStore, STORES } from './storage';
import { defaultSettings, settingsSchema, recordsSchema } from './domain';
beforeAll(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: indexedDB, configurable: true });
});
describe('IndexedDB local', () => {
  it('usa nombres del Anexo A, ajustes y la identidad anónima de la comunidad', () =>
    expect(STORES).toEqual(['perfil', 'hábitos', 'rachas', 'registros', 'ajustes', 'temasPersonalizados', 'comunidad']));
  it('persiste y borra también la clave', async () => {
    const db = new LocalStore();
    await db.put('ajustes', { ...defaultSettings, clave: 'clave-ficticia-solo-test' });
    expect((await db.get('ajustes', 'local', settingsSchema))?.clave).toBe(
      'clave-ficticia-solo-test',
    );
    await db.put('registros', { id: '1', fecha: '2026-11-07', habito: 'agua', hecho: true });
    expect(await db.all('registros', recordsSchema)).toHaveLength(1);
    await db.clear();
    expect(await db.get('ajustes', 'local', settingsSchema)).toBeNull();
    expect(await db.all('registros', recordsSchema)).toEqual([]);
  });
  it('rechaza datos corruptos en frontera', async () => {
    const db = new LocalStore();
    await db.put('ajustes', { id: 'local', clave: 5 });
    await expect(db.get('ajustes', 'local', settingsSchema)).rejects.toThrow();
    await db.clear();
  });
});
