import { describe, it, expect } from 'vitest';
import { buildThemeExport, parseThemeImport } from './theme-io';

const good = {
  fondo: '#FFF8EC',
  primario: '#FF5A1F',
  acento: '#FFD23F',
  urgente: '#B83A42',
};

describe('export/import de temas', () => {
  it('exporta solo nombre y cuatro colores', () => {
    const out = buildThemeExport([
      {
        id: 'custom:1',
        nombre: 'Prueba',
        version: 1,
        colores: good,
        creado: '2026-01-01T00:00:00.000Z',
        actualizado: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(out).toEqual({ schemaVersion: 1, temas: [{ nombre: 'Prueba', colores: good }] });
  });

  it('rechaza versión desconocida y claves ajenas', () => {
    const r = parseThemeImport({ schemaVersion: 99, temas: [], secreto: true }, false);
    expect(r.accepted).toEqual([]);
    expect(r.rejected.join(' ')).toMatch(/Clave no permitida|Versión/);
  });

  it('bloquea temas con contraste insuficiente', () => {
    const r = parseThemeImport(
      {
        schemaVersion: 1,
        temas: [
          {
            nombre: 'Mal',
            colores: { fondo: '#FFFFFF', primario: '#EEEEEE', acento: '#DDDDDD', urgente: '#CCCCCC' },
          },
        ],
      },
      false,
    );
    expect(r.accepted).toEqual([]);
    expect(r.rejected[0]).toMatch(/contraste/i);
  });

  it('acepta tema con contraste AA', () => {
    const r = parseThemeImport({ schemaVersion: 1, temas: [{ nombre: 'Ok', colores: good }] }, false);
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected).toEqual([]);
  });
});
