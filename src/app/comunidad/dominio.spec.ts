import { describe, it, expect } from 'vitest';
import type { Perfil } from '../domain';
import {
  INTERRUPTORES,
  cambioPesoPct,
  claveAleatoria,
  edadRango,
  estaturaRango,
  imcCategoria,
  pctHabitosSemana,
  perfilPublico,
  semanaISO,
  todoApagado,
} from './dominio';

const perfil: Perfil = {
  id: 'local',
  intencion: 'bajar',
  dormirMejor: true,
  edad: 27,
  estatura: 168,
  peso: 82,
  coeficiente: 'no-calcular',
  alergias: ['cacahuate'],
  padecimientos: 'hipertensión',
  medicamentos: 'losartán',
  consentimiento: true,
  consentimientoSalud: true,
  despensa: ['a', 'b', 'c'],
  creado: '2026-11-01',
};

describe('rangos de la comunidad', () => {
  it('edad en rangos de 5 años, desde 18', () => {
    expect(edadRango(18)).toBe('18-24');
    expect(edadRango(24)).toBe('18-24');
    expect(edadRango(25)).toBe('25-29');
    expect(edadRango(59)).toBe('55-59');
    expect(edadRango(60)).toBe('60+');
  });
  it('estatura en rangos de 10 cm con bordes exactos', () => {
    expect(estaturaRango(159.9)).toBe('150-159');
    expect(estaturaRango(160)).toBe('160-169');
    expect(estaturaRango(139)).toBe('<140');
    expect(estaturaRango(200)).toBe('200+');
  });
  it('categoría de IMC de la OMS en los bordes', () => {
    expect(imcCategoria(53.4, 170)).toBe('bajo'); // 18.48
    expect(imcCategoria(53.5, 170)).toBe('normal'); // 18.51
    expect(imcCategoria(72.2, 170)).toBe('normal'); // 24.98
    expect(imcCategoria(72.3, 170)).toBe('sobrepeso'); // 25.02
    expect(imcCategoria(86.7, 170)).toBe('obesidad'); // 30.0
  });
});

describe('perfil público', () => {
  it('todo apagado no envía ningún dato', () => {
    const p = perfilPublico(perfil, { dieta: 'vegana', ejercicios: ['Squat'] }, todoApagado());
    expect(p).toEqual({
      visibles: todoApagado(),
      intencion: null,
      edad_rango: null,
      estatura_rango: null,
      imc_cat: null,
      dieta: null,
      ejercicios: [],
    });
  });
  it('nunca incluye medidas exactas ni datos clínicos', () => {
    const todo = Object.fromEntries(INTERRUPTORES.map((i) => [i.id, true])) as ReturnType<typeof todoApagado>;
    const p = perfilPublico(perfil, { dieta: 'vegana', ejercicios: ['A', 'B', 'C', 'D', 'E', 'F'] }, todo);
    const texto = JSON.stringify(p);
    for (const prohibido of ['82', '168', '27', 'hipertensión', 'losartán', 'cacahuate', '"peso"', 'padecimientos'])
      expect(texto).not.toContain(prohibido);
    expect(Object.keys(p).sort()).toEqual(['dieta', 'edad_rango', 'ejercicios', 'estatura_rango', 'imc_cat', 'intencion', 'visibles']);
    expect(p.ejercicios).toHaveLength(5);
    expect(p.imc_cat).toBe('sobrepeso');
  });
});

describe('progreso semanal', () => {
  it('semana ISO local', () => {
    expect(semanaISO(new Date(2026, 10, 11))).toBe('2026-W46');
    expect(semanaISO(new Date(2026, 10, 16))).toBe('2026-W47');
  });
  it('% de hábitos de lunes a hoy', () => {
    const r = (fecha: string, habito: string) => ({ id: `${fecha}:${habito}`, fecha, habito, hecho: true });
    // miércoles 11/11/2026: 3 días × 2 hábitos = 6 posibles
    const registros = [r('2026-11-09', 'agua'), r('2026-11-10', 'agua'), r('2026-11-11', 'agua'), r('2026-11-08', 'agua')];
    expect(pctHabitosSemana(registros, 2, '2026-11-11')).toBe(50);
    expect(pctHabitosSemana([], 0, '2026-11-11')).toBe(0);
  });
  it('cambio de peso en % redondeado a 0.5 y nunca en kg', () => {
    expect(cambioPesoPct({ '2026-W45': 80 })).toBeNull();
    expect(cambioPesoPct({ '2026-W45': 80, '2026-W46': 78.9 })).toBe(-1.5); // -1.375 → -1.5
    expect(cambioPesoPct({ '2026-W40': 50, '2026-W46': 80 })).toBe(30);
  });
  it('clave aleatoria de 64 hex', () => {
    const a = claveAleatoria();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(claveAleatoria()).not.toBe(a);
  });
});
