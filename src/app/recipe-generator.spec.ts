import { describe, it, expect } from 'vitest';
import alimentos from '../../public/data/alimentos.json';
import recetas from '../../public/data/recetas.json';
import { Alimento, foodSchema, Receta, recipeSchema } from './domain';
import { normalize, recipeSafety, selectRecipes } from './engine';
import { healthLimits, healthSafety } from './health-rules';
import { computeRecipeMacros, acceptPolishedRecipe, DEVICE_MODEL_SYSTEM_PROMPT } from './local-ai';
import { FOOD_ALIASES } from './alimentos-alias';
import {
  buildDayPlan,
  dailyReference,
  GenProfile,
  generateAllRecipes,
  generateRecipes,
  mealTarget,
  MEAL_SHARE,
} from './recipe-generator';

const foods: Alimento[] = (alimentos as unknown[]).map((f) => foodSchema.parse(f));
const curated: Receta[] = (recetas as unknown[]).map((r) => recipeSchema.parse(r));
const byId = new Map(foods.map((f) => [f.id, f]));
// Caso de prueba de 6 ingredientes: arroz, huevo, jitomate, pechuga de pollo, tortilla de maíz y cebolla.
const SEIS = ['usda-168878', 'usda-171287', 'usda-170457', 'usda-171477', 'usda-175036', 'usda-170000'];
const base: GenProfile = {
  alergias: [],
  despensa: SEIS,
  padecimientos: '',
  medicamentos: '',
  intencion: 'mantener',
  edad: 30,
  estatura: 170,
  peso: 70,
  coeficiente: 'hombre',
};
const contains = (r: Receta, re: RegExp) => r.ingredientes.some((i) => re.test(normalize(byId.get(i.alimento)!.nombre)));

describe('catálogo v0.4.4', () => {
  it('ya no distingue crudo/cocido y trae ingredientes mexicanos', () => {
    expect(foods.length).toBeGreaterThanOrEqual(300);
    expect(foods.some((f) => /\b(crud|cocid|hervid)/i.test(f.nombre))).toBe(false);
    for (const n of ['Chile poblano', 'Queso Oaxaca', 'Cilantro', 'Epazote', 'Tostadas de maíz', 'Flor de jamaica', 'Chorizo de cerdo'])
      expect(foods.some((f) => f.nombre === n)).toBe(true);
    expect(new Set(foods.map((f) => f.nombre)).size).toBe(foods.length);
  });
  it('cada alias apunta a un ingrediente publicado', () => {
    for (const nuevo of Object.values(FOOD_ALIASES)) expect(byId.has(nuevo)).toBe(true);
    for (const viejo of Object.keys(FOOD_ALIASES)) expect(byId.has(viejo)).toBe(false);
  });
});

describe('generador local de recetas', () => {
  it('con 6 ingredientes produce muchas más recetas que el catálogo curado', () => {
    const antes = selectRecipes(curated, foods, base).length;
    const gen = generateAllRecipes({ profile: base, foods });
    expect(antes).toBeLessThanOrEqual(2);
    expect(gen.length).toBeGreaterThanOrEqual(20);
    for (const m of ['desayuno', 'comida', 'cena'] as const)
      expect(gen.filter((r) => r.momentos[0] === m).length).toBeGreaterThanOrEqual(3);
  });
  it('solo usa ingredientes de la despensa, sin duplicados y con fuentes reales de inocuidad', () => {
    const gen = generateAllRecipes({ profile: base, foods });
    expect(new Set(gen.map((r) => r.id)).size).toBe(gen.length);
    for (const m of ['desayuno', 'comida', 'cena']) {
      const names = gen.filter((r) => r.momentos[0] === m).map((r) => r.nombre);
      expect(new Set(names).size).toBe(names.length);
    }
    for (const r of gen) {
      expect(recipeSchema.safeParse(r).success).toBe(true);
      expect(r.origen).toBe('ia-local');
      expect(r.ingredientes.every((i) => SEIS.includes(i.alimento))).toBe(true);
      expect(new Set(r.ingredientes.map((i) => i.alimento)).size).toBe(r.ingredientes.length);
      expect(r.source_ref.every((u) => u.startsWith('https://www.foodsafety.gov/'))).toBe(true);
      expect(r.pasos.length).toBeGreaterThanOrEqual(3);
      expect(r.ingredientes.every((i) => i.gramos > 0 && i.gramos % 5 === 0 || i.gramos === 2)).toBe(true);
    }
  });
  it('los pasos con pollo o huevo incluyen temperatura segura', () => {
    const gen = generateAllRecipes({ profile: base, foods });
    for (const r of gen.filter((x) => contains(x, /pollo|huevo/)))
      expect(r.pasos.join(' ')).toMatch(/7[14] °C/);
  });
  it('macros calculados con computeRecipeMacros y porciones ajustadas a la meta (Mifflin)', () => {
    const ref = dailyReference(base)!;
    expect(ref).toBe(Math.round(Math.round(10 * 70 + 6.25 * 170 - 5 * 30 + 5) * 1.2));
    expect(mealTarget(base, 'comida')).toBe(Math.round(ref * MEAL_SHARE.comida));
    const des = generateRecipes({ profile: base, foods }, 'desayuno');
    const desBajar = generateRecipes({ profile: { ...base, intencion: 'bajar', peso: 55, estatura: 155, coeficiente: 'mujer' }, foods }, 'desayuno');
    const kcal = (rs: Receta[]) => rs.reduce((s, r) => s + computeRecipeMacros(r, foods).kcal, 0) / rs.length;
    expect(kcal(desBajar)).toBeLessThan(kcal(des));
    const macros = computeRecipeMacros(des[0], foods);
    expect(macros.kcal).toBeGreaterThan(0);
  });
  it('respeta alergias: nunca incluye el alérgeno declarado', () => {
    const gen = generateAllRecipes({ profile: { ...base, alergias: ['huevo'] }, foods });
    expect(gen.length).toBeGreaterThan(0);
    expect(gen.some((r) => r.ingredientes.some((i) => i.alimento === 'usda-171287'))).toBe(false);
    for (const r of gen) expect(recipeSafety(r, foods, ['huevo']).segura).toBe(true);
  });
  it('alergia desconocida: no genera nada (fail closed)', () =>
    expect(generateAllRecipes({ profile: { ...base, alergias: ['alergia no reconocida'] }, foods })).toEqual([]));
  it('diabetes: sin endulzantes ni más de 15 g de azúcares por porción', () => {
    const despensa = [...SEIS, 'usda-169640', 'usda-173944', 'usda-172217', 'usda-169705', 'usda-168165'];
    const p = { ...base, despensa, padecimientos: 'Diabetes tipo 2' };
    const gen = generateAllRecipes({ profile: p, foods });
    expect(gen.length).toBeGreaterThan(0);
    for (const r of gen) {
      expect(contains(r, /miel|azucar|pasas/)).toBe(false);
      expect(computeRecipeMacros(r, foods).azucares).toBeLessThanOrEqual(15);
    }
    const sin = generateAllRecipes({ profile: { ...base, despensa }, foods });
    expect(sin.some((r) => computeRecipeMacros(r, foods).azucares > 15 || contains(r, /miel|pasas/))).toBe(true);
  });
  it('hipertensión: sin embutidos ni salsas de lata y máx. 600 mg de sodio', () => {
    const despensa = [...SEIS, 'usda-746781', 'usda-173864', 'usda-171824', 'usda-172223'];
    const p = { ...base, despensa, padecimientos: 'hipertensión' };
    const gen = generateAllRecipes({ profile: p, foods });
    expect(gen.length).toBeGreaterThan(0);
    for (const r of gen) {
      expect(contains(r, /chorizo|jamon|salsa verde lista/)).toBe(false);
      const sodio = r.ingredientes.reduce((s, i) => s + ((byId.get(i.alimento)!.sodio_mg100g ?? 0) * i.gramos) / 100, 0);
      expect(sodio).toBeLessThanOrEqual(600);
    }
    expect(generateAllRecipes({ profile: { ...base, despensa }, foods }).some((r) => contains(r, /chorizo|jamon/))).toBe(true);
  });
  it('medicamentos: estatinas excluyen toronja, IMAO quesos madurados, quinolonas lácteos', () => {
    const despensa = [...SEIS, 'usda-174673', 'usda-171284', 'usda-170898', 'usda-172223', 'usda-172217'];
    const est = generateAllRecipes({ profile: { ...base, despensa, medicamentos: 'atorvastatina' }, foods });
    expect(est.some((r) => contains(r, /toronja/))).toBe(false);
    const imao = generateAllRecipes({ profile: { ...base, despensa, medicamentos: 'selegilina' }, foods });
    expect(imao.some((r) => contains(r, /cotija/))).toBe(false);
    const cipro = generateAllRecipes({ profile: { ...base, despensa, medicamentos: 'ciprofloxacino' }, foods });
    expect(cipro.some((r) => contains(r, /yogur|leche|queso/))).toBe(false);
  });
  it('padecimiento no reconocido aplica filtro prudente y lo informa', () => {
    const l = healthLimits({ padecimientos: 'algo raro', medicamentos: '' });
    expect(l.sinReconocer).toBe(true);
    expect(l.maxSodio).toBe(600);
    const chorizo: Receta = {
      id: 'x', nombre: 'x', pasos: ['x'], source_ref: ['https://www.foodsafety.gov/'],
      ingredientes: [{ alimento: 'usda-746781', gramos: 100 }],
    };
    expect(healthSafety(chorizo, foods, { padecimientos: 'algo raro', medicamentos: '' }).segura).toBe(false);
  });
  it('celiaquía en padecimientos se trata como alergia al trigo', () => {
    const despensa = ['usda-175037', 'usda-171287', 'usda-170457', 'usda-172223', 'usda-175036'];
    const gen = generateAllRecipes({ profile: { ...base, despensa, padecimientos: 'celiaquía' }, foods });
    expect(gen.some((r) => r.ingredientes.some((i) => i.alimento === 'usda-175037'))).toBe(false);
  });
});

describe('plan del día: mañana, tarde y noche', () => {
  it('arma desayuno, comida y cena distintos, seguros y repartidos según la meta', () => {
    const plan = buildDayPlan({ profile: base, foods, curated }, '2026-11-13');
    expect(plan.comidas.map((c) => c.momento)).toEqual(['desayuno', 'comida', 'cena']);
    expect(plan.comidas.every((c) => c.receta)).toBe(true);
    expect(plan.referenciaKcal).toBe(dailyReference(base));
    const tpl = plan.comidas.map((c) => (c.receta as { plantilla?: string }).plantilla);
    expect(new Set(tpl).size).toBe(3);
    for (const c of plan.comidas) {
      expect(c.receta!.momentos).toContain(c.momento);
      expect(c.metaKcal).toBe(mealTarget(base, c.momento));
    }
  });
  it('cambia de un día a otro y con «otra opción»', () => {
    const gen = generateAllRecipes({ profile: base, foods });
    const ids = (d: string, choice = {}) =>
      buildDayPlan({ profile: base, foods }, d, gen, choice).comidas.map((c) => c.receta!.id).join();
    const semana = new Set(['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'].map((d) => ids(d)));
    expect(semana.size).toBeGreaterThan(1);
    expect(ids('2026-11-13', { comida: 1 })).not.toBe(ids('2026-11-13'));
  });
  it('con alergia el plan no trae el alérgeno', () => {
    const plan = buildDayPlan({ profile: { ...base, alergias: ['huevo'] }, foods, curated }, '2026-11-13');
    for (const c of plan.comidas) if (c.receta) expect(c.receta.ingredientes.some((i) => i.alimento === 'usda-171287')).toBe(false);
  });
});

describe('modelo del navegador: solo redacta', () => {
  const r = generateAllRecipes({ profile: base, foods })[0];
  it('acepta otra redacción con las mismas cifras y número de pasos', () => {
    const ok = acceptPolishedRecipe(r, JSON.stringify({ nombre: 'Huevos rancheritos', pasos: r.pasos.map((p) => 'Con calma: ' + p) }));
    expect(ok?.nombre).toBe('Huevos rancheritos');
    expect(ok?.ingredientes).toEqual(r.ingredientes);
  });
  it('rechaza cambios de cifras, pasos o JSON inválido', () => {
    expect(acceptPolishedRecipe(r, JSON.stringify({ nombre: 'x', pasos: r.pasos.slice(1) }))).toBeNull();
    expect(acceptPolishedRecipe(r, JSON.stringify({ nombre: 'x', pasos: r.pasos.map((p) => p.replace(/\d+/, '50')) }))).toBeNull();
    expect(acceptPolishedRecipe(r, 'no json')).toBeNull();
  });
  it('el prompt ya no dice «Nunca inventes recetas» y prohíbe cambiar ingredientes', () => {
    expect(DEVICE_MODEL_SYSTEM_PROMPT).not.toMatch(/Nunca inventes recetas/);
    expect(DEVICE_MODEL_SYSTEM_PROMPT).toMatch(/nunca agregues, quites ni cambies ingredientes, cantidades/);
  });
});

import { askLocalAi } from './local-ai';
import { initialHabits, Perfil } from './domain';
import { textoEventoComunidad } from './app';
describe('IA local responde con recetas generadas por momento', () => {
  const profile: Perfil = {
    ...base,
    id: 'local',
    dormirMejor: false,
    consentimiento: true,
    consentimientoSalud: false,
    creado: '2026-11-13',
  };
  const recipes = [...selectRecipes(curated, foods, profile), ...generateAllRecipes({ profile, foods })];
  const ctx = { profile, foods, recipes, exercises: [], habits: initialHabits, records: [], today: '2026-11-13' };
  it('«¿Qué ceno?» sugiere una receta de cena y cuenta opciones por momento', () => {
    const a = askLocalAi('¿Qué ceno hoy?', ctx);
    expect(a.intent).toBe('receta');
    expect(a.reply).toMatch(/Para la cena/);
    expect(a.reply).toMatch(/de desayuno, \d+ de comida y \d+ de cena/);
    const id = a.action?.type === 'select-recipe' ? a.action.id : '';
    expect(recipes.find((r) => r.id === id)?.momentos).toContain('cena');
  });
});
describe('resumen de comunidad en Hoy', () => {
  it('describe eventos igual que Comunidad, sin datos de salud', () => {
    expect(textoEventoComunidad({ tipo: 'reto_completado', reto: 'Agua 7 días', valor: 7 })).toBe('completó el reto «Agua 7 días»');
    expect(textoEventoComunidad({ tipo: 'racha', reto: null, valor: 5 })).toBe('llegó a 5 días de racha');
  });
});
