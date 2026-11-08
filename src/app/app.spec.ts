import { describe, it, expect } from 'vitest';
import { profileSchema } from './domain';
describe('consentimiento', () => {
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
  it('permite omitir padecimientos', () => expect(profileSchema.safeParse(p).success).toBe(true));
  it('no acepta perfil sin consentimiento', () =>
    expect(profileSchema.safeParse({ ...p, consentimiento: false }).success).toBe(false));
  it('no acepta datos de salud opcionales sin permiso', () =>
    expect(profileSchema.safeParse({ ...p, padecimientos: 'ejemplo' }).success).toBe(false));
  it('exige tres ingredientes', () =>
    expect(profileSchema.safeParse({ ...p, despensa: ['a'] }).success).toBe(false));
});
