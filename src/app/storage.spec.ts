import { describe, it, expect, beforeAll } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { LocalStore, STORES, STORES_SYNC } from './storage';
import { defaultSettings, settingsSchema, recordsSchema } from './domain';
beforeAll(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: indexedDB, configurable: true });
});
describe('IndexedDB local', () => {
  it('usa nombres del Anexo A, ajustes y la identidad anónima de la comunidad', () => {
    expect(STORES).toEqual(['perfil', 'hábitos', 'rachas', 'registros', 'ajustes', 'temasPersonalizados', 'comunidad', 'cuenta']);
    expect([...STORES_SYNC]).not.toContain('cuenta');
  });
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
  it('exporta el volcado y lo restaura sin la sesión', async () => {
    const db = new LocalStore();
    await db.put('registros', { id: '1', fecha: '2026-11-11', habito: 'agua', hecho: true });
    await db.put('cuenta', { id: 'local', token: 'no-debe-salir' });
    const volcado = await db.exportarSync();
    expect(volcado['registros']).toHaveLength(1);
    expect(volcado).not.toHaveProperty('cuenta');
    const json = JSON.stringify(volcado);
    expect(json).not.toContain('no-debe-salir');
    await db.clear();
    await db.importarSync(JSON.parse(json));
    expect(await db.all('registros', recordsSchema)).toHaveLength(1);
    await db.clear();
  });
});
