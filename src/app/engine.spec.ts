import { describe, it, expect } from 'vitest';
import {
  mifflin,
  recipeSafety,
  selectRecipes,
  streak,
  validateAiSuggestion,
  nutrition,
  dayBefore,
} from './engine';
import { Alimento, Receta, Perfil, Registro } from './domain';
const foods: Alimento[] = [
  {
    id: 'huevo',
    nombre: 'Huevo entero crudo',
    kcal100g: 143,
    proteina100g: 12.56,
    carbohidratos100g: 0.72,
    grasa100g: 9.51,
    alergenos: ['huevo'],
    source_ref: 'https://fdc.nal.usda.gov/food-details/171287/nutrients',
  },
  {
    id: 'arroz',
    nombre: 'Arroz cocido',
    kcal100g: 130,
    proteina100g: 2.69,
    carbohidratos100g: 28.17,
    grasa100g: 0.28,
    alergenos: [],
    source_ref: 'https://fdc.nal.usda.gov/food-details/168878/nutrients',
  },
];
const recipe: Receta = {
  id: 'r1',
  nombre: 'Prueba',
  ingredientes: [
    { alimento: 'huevo', gramos: 50 },
    { alimento: 'arroz', gramos: 100 },
  ],
  pasos: ['Cocinar completamente.'],
  source_ref: ['https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures'],
};
const profile: Pick<Perfil, 'alergias' | 'despensa'> = {
  alergias: [],
  despensa: ['huevo', 'arroz'],
};
describe('Mifflin–St Jeor: reposo, no objetivo de dieta', () => {
  it('coeficiente hombre', () =>
    expect(mifflin({ edad: 30, peso: 70, estatura: 175, coeficiente: 'hombre' })).toBe(1649));
  it('coeficiente mujer', () =>
    expect(mifflin({ edad: 21, peso: 65, estatura: 165, coeficiente: 'mujer' })).toBe(1415));
  it('permite omitir', () =>
    expect(mifflin({ edad: 21, peso: 65, estatura: 165, coeficiente: 'no-calcular' })).toBeNull());
  it.each([17, 101, NaN])('rechaza edad %s', (edad) =>
    expect(mifflin({ edad, peso: 65, estatura: 165, coeficiente: 'mujer' })).toBeNull(),
  );
  it('rechaza altura imposible', () =>
    expect(mifflin({ edad: 21, peso: 65, estatura: 0, coeficiente: 'mujer' })).toBeNull());
});
describe('reglas de alergias y despensa, fail closed', () => {
  it('acepta ingredientes conocidos', () =>
    expect(recipeSafety(recipe, foods, []).segura).toBe(true));
  it.each(['huevo', 'HUEVOS', ' huevo '])('excluye %s', (allergy) =>
    expect(recipeSafety(recipe, foods, [allergy]).segura).toBe(false),
  );
  it('no adivina alergias desconocidas', () =>
    expect(recipeSafety(recipe, foods, ['alergia rara']).segura).toBe(false));
  it('falla si falta un ingrediente', () =>
    expect(recipeSafety(recipe, [], []).segura).toBe(false));
  it('solo selecciona de la despensa', () =>
    expect(selectRecipes([recipe], foods, { alergias: [], despensa: ['arroz'] })).toEqual([]));
  it('filtra por seguridad antes de sugerir', () =>
    expect(selectRecipes([recipe], foods, { ...profile, alergias: ['huevo'] })).toEqual([]));
  it('calcula nutrientes con gramos', () => expect(nutrition(recipe, foods)).toBe(202));
  it('no inventa calorías faltantes', () =>
    expect(nutrition(recipe, [{ ...foods[0]!, kcal100g: null }, foods[1]!])).toBeNull());
});
describe('adaptador IA revalida y nunca añade ingredientes', () => {
  const raw = (content: string) => ({ choices: [{ message: { content } }] });
  it('acepta solo id curado', () =>
    expect(validateAiSuggestion(raw('{"receta_id":"r1"}'), [recipe], foods, profile)).toEqual(
      recipe,
    ));
  it('bloquea id inventado', () =>
    expect(() =>
      validateAiSuggestion(raw('{"receta_id":"inventada"}'), [recipe], foods, profile),
    ).toThrow());
  it('no se salta alergias', () =>
    expect(() =>
      validateAiSuggestion(raw('{"receta_id":"r1"}'), [recipe], foods, {
        ...profile,
        alergias: ['huevo'],
      }),
    ).toThrow());
  it('no se salta despensa', () =>
    expect(() =>
      validateAiSuggestion(raw('{"receta_id":"r1"}'), [recipe], foods, {
        ...profile,
        despensa: [],
      }),
    ).toThrow());
  it.each([{}, null, { choices: [] }, raw('no es JSON')])('rechaza formato inválido %#', (value) =>
    expect(() => validateAiSuggestion(value, [recipe], foods, profile)).toThrow(),
  );
});
describe('racha por días reales', () => {
  const r = (fecha: string, habito = 'agua', hecho = true): Registro => ({
    id: fecha + habito,
    fecha,
    habito,
    hecho,
  });
  it('inicia en cero', () => expect(streak([], '2026-11-07')).toBe(0));
  it('dos hábitos el mismo día cuentan como un día', () =>
    expect(streak([r('2026-11-07'), r('2026-11-07', 'mover')], '2026-11-07')).toBe(1));
  it('continúa si ayer se registró aunque hoy no todavía', () =>
    expect(streak([r('2026-11-06'), r('2026-11-05')], '2026-11-07')).toBe(2));
  it('un hueco rompe la racha', () =>
    expect(streak([r('2026-11-07'), r('2026-11-05')], '2026-11-07')).toBe(1));
  it('desmarcar y registros futuros no cuentan', () =>
    expect(streak([r('2026-11-07', 'agua', false), r('2026-11-08')], '2026-11-07')).toBe(0));
  it('cruza mes sin UTC', () => expect(dayBefore('2026-03-01')).toBe('2026-02-28'));
});
