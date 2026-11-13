import { describe, it, expect } from 'vitest';
import {
  analyzeHabits,
  analyzePantry,
  askLocalAi,
  buildDailyBrief,
  computeRecipeMacros,
  searchFoods,
  suggestLocalExercise,
  suggestLocalRecipe,
} from './local-ai';
import { Alimento, Ejercicio, initialHabits, Perfil, Receta, Registro } from './domain';

const foods: Alimento[] = [
  {
    id: 'usda-arroz',
    nombre: 'Arroz blanco cocido',
    kcal100g: 130,
    proteina100g: 2.7,
    carbohidratos100g: 28,
    grasa100g: 0.3,
    fibra100g: 0.4,
    azucares100g: 0.1,
    source_ref: 'https://fdc.nal.usda.gov/food-details/168878/nutrients',
    alergenos: ['ninguno'],
  },
  {
    id: 'usda-pollo',
    nombre: 'Pechuga de pollo cocida',
    kcal100g: 165,
    proteina100g: 31,
    carbohidratos100g: 0,
    grasa100g: 3.6,
    fibra100g: 0,
    azucares100g: 0,
    source_ref: 'https://fdc.nal.usda.gov/food-details/171477/nutrients',
    alergenos: ['ninguno'],
  },
  {
    id: 'usda-huevo',
    nombre: 'Huevo entero cocido',
    kcal100g: 155,
    proteina100g: 12.6,
    carbohidratos100g: 1.1,
    grasa100g: 10.6,
    fibra100g: 0,
    azucares100g: 1.1,
    source_ref: 'https://fdc.nal.usda.gov/food-details/171287/nutrients',
    alergenos: ['huevo'],
  },
  {
    id: 'usda-tomate',
    nombre: 'Jitomate rojo',
    kcal100g: 18,
    proteina100g: 0.9,
    carbohidratos100g: 3.9,
    grasa100g: 0.2,
    fibra100g: 1.2,
    azucares100g: 2.6,
    source_ref: 'https://fdc.nal.usda.gov/food-details/170457/nutrients',
    alergenos: ['ninguno'],
  },
];

const recipes: Receta[] = [
  {
    id: 'pollo-arroz',
    nombre: 'Tazón de pollo, arroz y jitomate',
    ingredientes: [
      { alimento: 'usda-arroz', gramos: 150 },
      { alimento: 'usda-pollo', gramos: 120 },
      { alimento: 'usda-tomate', gramos: 100 },
    ],
    pasos: ['Mezclar todo.'],
    source_ref: ['https://fdc.nal.usda.gov/food-details/171477/nutrients'],
  },
  {
    id: 'arroz-huevo',
    nombre: 'Arroz con huevo y jitomate',
    ingredientes: [
      { alimento: 'usda-arroz', gramos: 150 },
      { alimento: 'usda-huevo', gramos: 100 },
      { alimento: 'usda-tomate', gramos: 100 },
    ],
    pasos: ['Cocinar el huevo y mezclar.'],
    source_ref: ['https://fdc.nal.usda.gov/food-details/171287/nutrients'],
  },
];

const exercises: Ejercicio[] = [
  {
    id: 'ex-1',
    nombre: 'Sentadilla sin peso',
    instrucciones: ['Separa los pies al ancho de hombros y baja controlado.'],
    source_ref: 'https://example.org/ex1',
  },
  {
    id: 'ex-2',
    nombre: 'Estiramiento suave de cuello y hombros',
    instrucciones: ['Gira suavemente los hombros sin forzar.'],
    source_ref: 'https://example.org/ex2',
  },
];

const baseProfile: Perfil = {
  id: 'local',
  intencion: 'bajar',
  dormirMejor: true,
  edad: 28,
  estatura: 170,
  peso: 72,
  coeficiente: 'no-calcular',
  alergias: ['huevo'],
  padecimientos: '',
  medicamentos: '',
  consentimiento: true,
  consentimientoSalud: false,
  despensa: ['usda-arroz', 'usda-pollo', 'usda-tomate'],
  creado: '2026-11-12T00:00:00.000Z',
};

describe('IA local sin red', () => {
  it('calcula macros reales y respeta alergias al sugerir recetas', () => {
    const macros = computeRecipeMacros(recipes[0], foods);
    expect(macros.kcal).toBe(411);
    expect(macros.proteina).toBeCloseTo(42.2, 1);

    const suggestion = suggestLocalRecipe({
      profile: baseProfile,
      foods,
      recipes,
      exercises,
      habits: initialHabits,
      records: [],
      today: '2026-11-12',
    });
    expect(suggestion?.recipe.id).toBe('pollo-arroz');
    expect(suggestion?.reason).toContain('411 kcal');
  });

  it('detecta ingredientes faltantes seguros sin sugerir alérgenos', () => {
    const sparseProfile: Perfil = {
      ...baseProfile,
      despensa: ['usda-arroz', 'usda-tomate', 'usda-huevo'],
    };
    const pantry = analyzePantry({
      profile: sparseProfile,
      foods,
      recipes,
      exercises,
      habits: initialHabits,
      records: [],
      today: '2026-11-12',
    });
    expect(pantry.safeRecipesCount).toBe(0);
    expect(pantry.unlockable.map((u) => u.recipe.id)).toEqual(['pollo-arroz']);
    expect(pantry.unlockable[0].missingFoods.map((f) => f.id)).toEqual(['usda-pollo']);
  });

  it('analiza hábitos, racha y sugiere el siguiente hábito', () => {
    const records: Registro[] = [
      { id: '2026-11-11:agua', fecha: '2026-11-11', habito: 'agua', hecho: true },
      { id: '2026-11-12:agua', fecha: '2026-11-12', habito: 'agua', hecho: true },
    ];
    const stats = analyzeHabits(initialHabits, records, '2026-11-12', baseProfile);
    expect(stats.streakDays).toBe(2);
    expect(stats.completedToday).toBe(1);
    expect(stats.nextRecommendedHabit?.id).toBe('descanso');
  });

  it('omite energía en reposo si hay padecimientos o medicamentos', () => {
    const medProfile: Perfil = {
      ...baseProfile,
      coeficiente: 'mujer',
      consentimientoSalud: true,
      padecimientos: 'hipertensión',
    };
    const res = askLocalAi('¿Cuántas calorías diarias necesito en reposo?', {
      profile: medProfile,
      foods,
      recipes,
      exercises,
      habits: initialHabits,
      records: [],
      today: '2026-11-12',
    });
    expect(res.intent).toBe('energia');
    expect(res.reply).toMatch(/omite el cálculo/i);
  });

  it('responde consultas sobre alimentos USDA, ejercicios, privacidad y genera resumen diario', () => {
    const ctx = {
      profile: baseProfile,
      foods,
      recipes,
      exercises,
      habits: initialHabits,
      records: [],
      today: '2026-11-12',
    };
    expect(searchFoods('pollo', foods, baseProfile)[0].food.id).toBe('usda-pollo');
    expect(suggestLocalExercise(ctx)?.exercise.id).toBe('ex-1');
    expect(suggestLocalExercise({ ...ctx, profile: { ...baseProfile, intencion: 'mantener' } })?.exercise.id).toBe('ex-2');

    const foodAns = askLocalAi('¿Cuánta proteína tiene el pollo?', ctx);
    expect(foodAns.intent).toBe('alimento');
    expect(foodAns.reply).toContain('31 g prot');

    const exAns = askLocalAi('Recomiéndame una sentadilla', ctx);
    expect(exAns.intent).toBe('ejercicio');
    expect(exAns.action?.type).toBe('select-exercise');

    const privAns = askLocalAi('¿Funciona sin internet y respeta mi privacidad?', ctx);
    expect(privAns.intent).toBe('privacidad');
    expect(privAns.reply).toContain('100% en tu dispositivo');

    const brief = buildDailyBrief(ctx);
    expect(brief.recipeSuggestion?.recipe.id).toBe('pollo-arroz');
    expect(brief.restingEnergyKcal).toBeNull();
  });
});
