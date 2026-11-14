import { describe, it, expect } from 'vitest';
import { migrateFoodIds, profileSchema } from './domain';
const p = {
    id: 'local',
    intencion: 'mantener',
    dormirMejor: true,
    edad: 21,
    estatura: 165,
    peso: 65,
    coeficiente: 'no-calcular',
    alergias: [],
    padecimientos: '',
    medicamentos: '',
    consentimiento: true,
    consentimientoSalud: false,
    despensa: ['a', 'b', 'c'],
    creado: '2026-11-07',
  };
describe('consentimiento', () => {
  it('permite omitir padecimientos', () => expect(profileSchema.safeParse(p).success).toBe(true));
  it('no acepta perfil sin consentimiento', () =>
    expect(profileSchema.safeParse({ ...p, consentimiento: false }).success).toBe(false));
  it('no acepta datos de salud opcionales sin permiso', () =>
    expect(profileSchema.safeParse({ ...p, padecimientos: 'ejemplo' }).success).toBe(false));
  it('no acepta despensa vacía (el mínimo de 3 se exige al elegir)', () =>
    expect(profileSchema.safeParse({ ...p, despensa: [] }).success).toBe(false));
});
describe('migración crudo/cocido de v0.4.3', () => {
  it('mapea IDs viejos al ingrediente único sin duplicar ni perder los demás', () => {
    // arroz integral crudo + cocido, huevo duro + crudo, nopales cocidos y un ID sin cambio.
    const viejo = ['usda-169703', 'usda-169704', 'usda-173424', 'usda-171287', 'usda-169388', 'usda-170457'];
    expect(migrateFoodIds(viejo)).toEqual(['usda-169704', 'usda-171287', 'usda-168571', 'usda-170457']);
  });
  it('un perfil guardado con IDs viejos se lee ya migrado y sigue siendo válido', () => {
    const r = profileSchema.safeParse({ ...p, despensa: ['usda-174030', 'usda-171794', 'usda-175179'] });
    expect(r.success).toBe(true);
    expect(r.success && r.data.despensa).toEqual(['usda-171794', 'usda-175180']);
  });
  it('es idempotente', () => {
    const una = migrateFoodIds(['usda-172420', 'usda-174284', 'usda-172421']);
    expect(migrateFoodIds(una)).toEqual(una);
    expect(una).toEqual(['usda-172421']);
  });
});
