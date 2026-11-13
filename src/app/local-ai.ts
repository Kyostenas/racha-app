import { Alimento, Ejercicio, Habito, Perfil, Receta, Registro } from './domain';
import { mifflin, recipeSafety, selectRecipes } from './engine';

export interface LocalAiContext {
  profile: Perfil | null;
  foods: Alimento[];
  recipes: Receta[];
  exercises: Ejercicio[];
  habits: Habito[];
  records: Registro[];
  today: string;
  currentRecipeId?: string;
  currentExerciseId?: string;
}

export interface RecipeMacroSummary {
  kcal: number;
  proteina: number;
  carbohidratos: number;
  grasa: number;
  fibra: number;
  azucares: number;
}

export interface LocalRecipeSuggestion {
  recipe: Receta;
  reason: string;
  macros: RecipeMacroSummary;
}

export interface PantryUnlockItem {
  recipe: Receta;
  missingFoods: Alimento[];
}

export interface PantryAnalysis {
  pantryFoods: Alimento[];
  safeRecipesCount: number;
  unlockable: PantryUnlockItem[];
  highProteinCount: number;
  highFiberCount: number;
}

export interface HabitInsights {
  streakDays: number;
  completedToday: number;
  totalHabits: number;
  rate7d: number;
  activeDays42d: number;
  bestStreak42d: number;
  strongestHabit: Habito | null;
  weakestHabit: Habito | null;
  nextRecommendedHabit: Habito | null;
  summary: string;
}

export interface LocalExerciseSuggestion {
  exercise: Ejercicio;
  reason: string;
}

export interface LocalDailyBrief {
  habitSummary: string;
  nextHabit: Habito | null;
  recipeSuggestion: LocalRecipeSuggestion | null;
  pantryTip: string;
  exerciseSuggestion: LocalExerciseSuggestion | null;
  restingEnergyKcal: number | null;
  browserAiStatus: BrowserBuiltInAiStatus;
}

export type LocalAiAction =
  | { type: 'select-recipe'; id: string; label: string }
  | { type: 'select-exercise'; id: string; label: string }
  | { type: 'navigate'; page: 'hoy' | 'plan' | 'progreso' | 'ajustes'; label: string };

export interface LocalAiAnswer {
  intent:
    | 'receta'
    | 'alimento'
    | 'despensa'
    | 'ejercicio'
    | 'habitos'
    | 'energia'
    | 'privacidad'
    | 'general';
  reply: string;
  action?: LocalAiAction;
  browserAiUsed?: boolean;
}

export type BrowserBuiltInAiStatus = 'disponible' | 'descargable' | 'no-disponible';

interface BrowserLanguageModelApi {
  availability?: () => Promise<string>;
  create?: (options?: { initialPrompts?: { role: string; content: string }[] }) => Promise<{
    prompt: (text: string) => Promise<string>;
    destroy?: () => void;
  }>;
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  const norm = normalizeText(value);
  if (!norm) return [];
  const stop = new Set([
    'de',
    'del',
    'la',
    'las',
    'el',
    'los',
    'un',
    'una',
    'unos',
    'unas',
    'en',
    'con',
    'sin',
    'para',
    'por',
    'que',
    'como',
    'cual',
    'cuales',
    'cuan',
    'cuanto',
    'cuantos',
    'cuanta',
    'cuantas',
    'tiene',
    'tienen',
    'hay',
    'hoy',
    'mi',
    'mis',
    'me',
    'tu',
    'y',
    'o',
    'a',
    'es',
    'son',
    'sobre',
    'quiero',
    'puedo',
    'dime',
    'recomienda',
    'recomiendame',
  ]);
  return norm.split(' ').filter((w) => w.length >= 2 && !stop.has(w));
}

export function computeRecipeMacros(recipe: Receta, foods: Alimento[]): RecipeMacroSummary {
  const byId = new Map(foods.map((f) => [f.id, f]));
  let kcal = 0;
  let proteina = 0;
  let carbohidratos = 0;
  let grasa = 0;
  let fibra = 0;
  let azucares = 0;
  for (const ing of recipe.ingredientes) {
    const f = byId.get(ing.alimento);
    if (!f) continue;
    const factor = ing.gramos / 100;
    kcal += (f.kcal100g ?? 0) * factor;
    proteina += (f.proteina100g ?? 0) * factor;
    carbohidratos += (f.carbohidratos100g ?? 0) * factor;
    grasa += (f.grasa100g ?? 0) * factor;
    fibra += (f.fibra100g ?? 0) * factor;
    azucares += (f.azucares100g ?? 0) * factor;
  }
  return {
    kcal: Math.round(kcal),
    proteina: Math.round(proteina * 10) / 10,
    carbohidratos: Math.round(carbohidratos * 10) / 10,
    grasa: Math.round(grasa * 10) / 10,
    fibra: Math.round(fibra * 10) / 10,
    azucares: Math.round(azucares * 10) / 10,
  };
}

function scoreRecipeForGoal(macros: RecipeMacroSummary, intencion: Perfil['intencion']): number {
  const safeKcal = Math.max(macros.kcal, 1);
  if (intencion === 'bajar') {
    const proteinDensity = (macros.proteina * 100) / safeKcal;
    return proteinDensity * 4 + macros.fibra * 2.5 - macros.azucares * 0.6;
  }
  if (intencion === 'subir') {
    return macros.kcal * 0.08 + macros.proteina * 2.2 + macros.carbohidratos * 0.4;
  }
  return macros.proteina * 1.8 + macros.fibra * 2 + Math.min(macros.kcal, 600) * 0.03;
}

function formatGoalLabel(intencion: Perfil['intencion']): string {
  if (intencion === 'bajar') return 'bajar de peso';
  if (intencion === 'subir') return 'subir masa o peso';
  return 'mantener tu ritmo';
}

export function suggestLocalRecipe(
  ctx: LocalAiContext,
  excludeCurrent = false,
): LocalRecipeSuggestion | null {
  if (!ctx.profile) return null;
  const profile = ctx.profile;
  const safe = selectRecipes(ctx.recipes, ctx.foods, profile)
    .map((recipe) => {
      const macros = computeRecipeMacros(recipe, ctx.foods);
      return { recipe, macros, score: scoreRecipeForGoal(macros, profile.intencion) };
    })
    .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id));

  if (!safe.length) return null;
  let picked = safe[0];
  if (excludeCurrent && ctx.currentRecipeId && safe.length > 1) {
    const alt = safe.find((item) => item.recipe.id !== ctx.currentRecipeId);
    if (alt) picked = alt;
  }

  const goalText = formatGoalLabel(profile.intencion);
  const reason = `Apta para tus alergias y despensa, pensada para ${goalText}: aporta aprox. ${picked.macros.kcal} kcal, ${picked.macros.proteina} g de proteína y ${picked.macros.fibra} g de fibra.`;
  return { recipe: picked.recipe, macros: picked.macros, reason };
}

function foodConflictsWithAllergies(food: Alimento, allergies: string[]): boolean {
  const normAllergies = allergies.map((a) => normalizeText(a)).filter(Boolean);
  if (!normAllergies.length) return false;
  if (food.alergenos.length === 0) return false;
  return food.alergenos.some((a) => {
    const na = normalizeText(a);
    return normAllergies.some((ua) => na.includes(ua) || ua.includes(na));
  });
}

export function analyzePantry(ctx: LocalAiContext): PantryAnalysis {
  const profile = ctx.profile;
  const byId = new Map(ctx.foods.map((f) => [f.id, f]));
  const pantryIds = new Set(profile?.despensa ?? []);
  const pantryFoods = (profile?.despensa ?? [])
    .map((id) => byId.get(id))
    .filter((f): f is Alimento => Boolean(f));

  const safeIds = new Set(profile ? selectRecipes(ctx.recipes, ctx.foods, profile).map((r) => r.id) : []);
  const safeRecipesCount = safeIds.size;

  const unlockable: PantryUnlockItem[] = [];
  if (profile) {
    for (const recipe of ctx.recipes) {
      if (safeIds.has(recipe.id)) continue;
      if (!recipeSafety(recipe, ctx.foods, profile.alergias).segura) continue;
      const ingredients = recipe.ingredientes
        .map((i) => byId.get(i.alimento))
        .filter((f): f is Alimento => Boolean(f));
      if (ingredients.length !== recipe.ingredientes.length) continue;

      const hasAllergyRisk = ingredients.some(
        (f) => profile.alergias.length > 0 && (f.alergenos.length === 0 || foodConflictsWithAllergies(f, profile.alergias)),
      );
      if (hasAllergyRisk) continue;

      const missingFoods = ingredients.filter((f) => !pantryIds.has(f.id));
      if (missingFoods.length > 0 && missingFoods.length <= 2) {
        unlockable.push({ recipe, missingFoods });
      }
    }
    unlockable.sort((a, b) => a.missingFoods.length - b.missingFoods.length);
  }

  return {
    pantryFoods,
    safeRecipesCount,
    unlockable,
    highProteinCount: pantryFoods.filter((f) => (f.proteina100g ?? 0) >= 12).length,
    highFiberCount: pantryFoods.filter((f) => (f.fibra100g ?? 0) >= 4).length,
  };
}

function isoDateDaysAgo(today: string, daysAgo: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - daysAgo));
  return dt.toISOString().slice(0, 10);
}

export function analyzeHabits(
  habits: Habito[],
  records: Registro[],
  today: string,
  profile: Perfil | null,
): HabitInsights {
  const doneByDay = new Map<string, Set<string>>();
  for (const r of records) {
    if (!r.hecho) continue;
    const set = doneByDay.get(r.fecha) ?? new Set<string>();
    set.add(r.habito);
    doneByDay.set(r.fecha, set);
  }

  const totalHabits = habits.length;
  const completedTodaySet = doneByDay.get(today) ?? new Set<string>();
  const completedToday = habits.filter((h) => completedTodaySet.has(h.id)).length;

  let streakDays = 0;
  for (let i = 0; i < 365; i++) {
    const day = isoDateDaysAgo(today, i);
    const set = doneByDay.get(day);
    if (set && set.size > 0) streakDays++;
    else break;
  }

  let done7d = 0;
  const possible7d = Math.max(totalHabits * 7, 1);
  for (let i = 0; i < 7; i++) {
    const day = isoDateDaysAgo(today, i);
    const set = doneByDay.get(day);
    if (!set) continue;
    done7d += habits.filter((h) => set.has(h.id)).length;
  }
  const rate7d = totalHabits > 0 ? Math.round((done7d / possible7d) * 100) : 0;

  let activeDays42d = 0;
  let bestStreak42d = 0;
  let running = 0;
  for (let i = 41; i >= 0; i--) {
    const day = isoDateDaysAgo(today, i);
    const set = doneByDay.get(day);
    if (set && set.size > 0) {
      activeDays42d++;
      running++;
      if (running > bestStreak42d) bestStreak42d = running;
    } else {
      running = 0;
    }
  }

  const counts14d = new Map<string, number>();
  for (const h of habits) counts14d.set(h.id, 0);
  for (let i = 0; i < 14; i++) {
    const day = isoDateDaysAgo(today, i);
    const set = doneByDay.get(day);
    if (!set) continue;
    for (const h of habits) {
      if (set.has(h.id)) counts14d.set(h.id, (counts14d.get(h.id) ?? 0) + 1);
    }
  }

  const byCountDesc = [...habits].sort(
    (a, b) => (counts14d.get(b.id) ?? 0) - (counts14d.get(a.id) ?? 0),
  );
  const byCountAsc = [...habits].sort(
    (a, b) => (counts14d.get(a.id) ?? 0) - (counts14d.get(b.id) ?? 0),
  );
  const strongestHabit = byCountDesc[0] ?? null;
  const weakestHabit = byCountAsc[0] ?? null;

  const pendingToday = habits.filter((h) => !completedTodaySet.has(h.id));
  let nextRecommendedHabit: Habito | null = null;
  if (pendingToday.length) {
    if (profile?.dormirMejor) {
      const sleepHabit = pendingToday.find((h) => h.id === 'descanso' || normalizeText(h.nombre).includes('dormir'));
      if (sleepHabit) nextRecommendedHabit = sleepHabit;
    }
    if (!nextRecommendedHabit) {
      nextRecommendedHabit =
        [...pendingToday].sort(
          (a, b) => (counts14d.get(a.id) ?? 0) - (counts14d.get(b.id) ?? 0),
        )[0] ?? pendingToday[0];
    }
  }

  let summary = '';
  if (totalHabits === 0) {
    summary = 'Agrega al menos un hábito en Hoy para construir tu racha diaria.';
  } else if (completedToday === totalHabits) {
    summary = `Ya completaste los ${totalHabits} hábitos de hoy. Llevas ${streakDays} día${streakDays === 1 ? '' : 's'} de racha y ${rate7d}% de cumplimiento semanal.`;
  } else if (nextRecommendedHabit) {
    summary = `Llevas ${completedToday} de ${totalHabits} hoy (${rate7d}% en los últimos 7 días). Siguiente paso sugerido: «${nextRecommendedHabit.nombre}».`;
  }

  return {
    streakDays,
    completedToday,
    totalHabits,
    rate7d,
    activeDays42d,
    bestStreak42d,
    strongestHabit,
    weakestHabit,
    nextRecommendedHabit,
    summary,
  };
}

export function suggestLocalExercise(
  ctx: LocalAiContext,
  excludeCurrent = false,
): LocalExerciseSuggestion | null {
  if (!ctx.exercises.length) return null;
  const intencion = ctx.profile?.intencion ?? 'mantener';
  const dormirMejor = ctx.profile?.dormirMejor ?? false;

  const scored = ctx.exercises.map((ex, idx) => {
    const text = normalizeText(`${ex.nombre} ${ex.instrucciones.join(' ')}`);
    let score = 0;
    if (intencion === 'bajar') {
      if (/caminar|correr|salto|burpee|bicicleta|paso|escalador|cardio|ritmo|tijera|rodilla/.test(text)) score += 6;
      if (/sentadilla|plancha|puente|zancada/.test(text)) score += 3;
    } else if (intencion === 'subir') {
      if (/flexion|lagartija|dominada|fondo|sentadilla|zancada|plancha|puente|elevacion/.test(text)) score += 6;
    } else {
      if (/estiramiento|circulo|puente|caminar|plancha|movilidad|respiracion|hombro|cadera/.test(text)) score += 5;
    }
    if (dormirMejor && /estiramiento|movilidad|circulo|suave|cuello|espalda/.test(text)) {
      score += 3;
    }
    if (ex.instrucciones.length >= 2) score += 1;
    return { ex, score, idx };
  });

  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  let chosen = scored[0].ex;
  if (excludeCurrent && ctx.currentExerciseId && scored.length > 1) {
    const alt = scored.find((item) => item.ex.id !== ctx.currentExerciseId);
    if (alt) chosen = alt.ex;
  }

  const goalLabel = ctx.profile ? formatGoalLabel(ctx.profile.intencion) : 'mantenerte activo';
  const reason = `Seleccionado del catálogo local para ${goalLabel}. Solo si te resulta cómodo; detente si hay dolor.`;
  return { exercise: chosen, reason };
}

export function searchFoods(
  query: string,
  foods: Alimento[],
  profile: Perfil | null,
  limit = 4,
): { food: Alimento; inPantry: boolean; allergyConflict: boolean }[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const pantrySet = new Set(profile?.despensa ?? []);
  const allergies = profile?.alergias ?? [];

  const scored = foods
    .map((food) => {
      const name = normalizeText(food.nombre);
      let score = 0;
      for (const tok of tokens) {
        if (name === tok) score += 10;
        else if (name.includes(tok)) score += 4;
      }
      if (pantrySet.has(food.id) && score > 0) score += 1;
      return { food, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.food.nombre.localeCompare(b.food.nombre));

  return scored.slice(0, limit).map((item) => ({
    food: item.food,
    inPantry: pantrySet.has(item.food.id),
    allergyConflict: foodConflictsWithAllergies(item.food, allergies),
  }));
}

export function searchExercises(query: string, exercises: Ejercicio[], limit = 3): Ejercicio[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  return exercises
    .map((ex) => {
      const hay = normalizeText(`${ex.nombre} ${ex.instrucciones.join(' ')}`);
      let score = 0;
      for (const tok of tokens) {
        if (normalizeText(ex.nombre).includes(tok)) score += 6;
        else if (hay.includes(tok)) score += 2;
      }
      return { ex, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.ex);
}

export function computeSafeRestingEnergy(profile: Perfil | null): number | null {
  if (!profile) return null;
  if (profile.padecimientos.trim() || profile.medicamentos.trim()) return null;
  return mifflin(profile);
}

export async function detectBrowserBuiltInAi(): Promise<BrowserBuiltInAiStatus> {
  const g = globalThis as unknown as {
    LanguageModel?: BrowserLanguageModelApi;
    ai?: { languageModel?: BrowserLanguageModelApi };
  };
  const api = g.LanguageModel ?? g.ai?.languageModel;
  if (!api || typeof api.availability !== 'function') return 'no-disponible';
  try {
    const state = await api.availability();
    if (state === 'available' || state === 'readily') return 'disponible';
    if (state === 'downloadable' || state === 'downloading' || state === 'after-download') {
      return 'descargable';
    }
    return 'no-disponible';
  } catch {
    return 'no-disponible';
  }
}

export async function enhanceWithDeviceModel(
  question: string,
  groundedReply: string,
): Promise<{ text: string; usedModel: boolean }> {
  const g = globalThis as unknown as {
    LanguageModel?: BrowserLanguageModelApi;
    ai?: { languageModel?: BrowserLanguageModelApi };
  };
  const api = g.LanguageModel ?? g.ai?.languageModel;
  if (!api || typeof api.availability !== 'function' || typeof api.create !== 'function') {
    return { text: groundedReply, usedModel: false };
  }
  try {
    const state = await api.availability();
    if (state !== 'available' && state !== 'readily') {
      return { text: groundedReply, usedModel: false };
    }
    const session = await api.create({
      initialPrompts: [
        {
          role: 'system',
          content:
            'Eres el asistente local de Progressium en español. Responde en máximo 3 frases claras usando SOLO los datos verificados que te doy. Nunca inventes recetas, ingredientes, alergias ni diagnósticos médicos.',
        },
      ],
    });
    try {
      const prompt = `Pregunta del usuario: ${question}\nDatos verificados de la app:\n${groundedReply}`;
      const result = await Promise.race([
        session.prompt(prompt),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
      ]);
      const clean = result.trim();
      if (clean.length >= 12) return { text: clean, usedModel: true };
      return { text: groundedReply, usedModel: false };
    } finally {
      session.destroy?.();
    }
  } catch {
    return { text: groundedReply, usedModel: false };
  }
}

export function buildDailyBrief(
  ctx: LocalAiContext,
  browserAiStatus: BrowserBuiltInAiStatus = 'no-disponible',
): LocalDailyBrief {
  const habits = analyzeHabits(ctx.habits, ctx.records, ctx.today, ctx.profile);
  const recipeSuggestion = suggestLocalRecipe(ctx);
  const pantry = analyzePantry(ctx);
  const exerciseSuggestion = suggestLocalExercise(ctx);
  const restingEnergyKcal = computeSafeRestingEnergy(ctx.profile);

  let pantryTip = '';
  if (pantry.safeRecipesCount > 0) {
    pantryTip = `Tienes ${pantry.safeRecipesCount} receta${pantry.safeRecipesCount === 1 ? '' : 's'} disponible${pantry.safeRecipesCount === 1 ? '' : 's'} con tu despensa actual (${pantry.pantryFoods.length} alimentos).`;
  } else if (pantry.unlockable.length > 0) {
    const first = pantry.unlockable[0];
    const missingNames = first.missingFoods.map((f) => f.nombre).join(' y ');
    pantryTip = `Con ${missingNames} desbloqueas «${first.recipe.nombre}».`;
  } else {
    pantryTip = `Tu despensa tiene ${pantry.pantryFoods.length} alimento${pantry.pantryFoods.length === 1 ? '' : 's'} guardado${pantry.pantryFoods.length === 1 ? '' : 's'}.`;
  }

  return {
    habitSummary: habits.summary,
    nextHabit: habits.nextRecommendedHabit,
    recipeSuggestion,
    pantryTip,
    exerciseSuggestion,
    restingEnergyKcal,
    browserAiStatus,
  };
}

export function askLocalAi(question: string, ctx: LocalAiContext): LocalAiAnswer {
  const q = normalizeText(question);
  const profile = ctx.profile;

  if (/privac|internet|offline|conexion|nube|servidor|como funciona|local/.test(q)) {
    return {
      intent: 'privacidad',
      reply:
        'La IA local funciona 100% en tu dispositivo, incluso sin internet: analiza tu despensa, tus alergias, los 300 alimentos USDA, 80 ejercicios y tu historial de hábitos sin enviar datos a ningún servidor externo.',
    };
  }

  if (/despensa|falta|ingredientes|comprar|desbloquear/.test(q)) {
    const pantry = analyzePantry(ctx);
    if (pantry.unlockable.length > 0) {
      const top = pantry.unlockable.slice(0, 2).map((item) => {
        const missing = item.missingFoods.map((f) => f.nombre).join(' y ');
        return `«${item.recipe.nombre}» (te falta: ${missing})`;
      });
      return {
        intent: 'despensa',
        reply: `Ahora tienes ${pantry.safeRecipesCount} receta${pantry.safeRecipesCount === 1 ? '' : 's'} lista${pantry.safeRecipesCount === 1 ? '' : 's'} con ${pantry.pantryFoods.length} alimentos en tu despensa. Para abrir más opciones puedes sumar: ${top.join('; ')}.`,
        action: { type: 'navigate', page: 'plan', label: 'Ir al plan' },
      };
    }
    return {
      intent: 'despensa',
      reply: `Tu despensa tiene ${pantry.pantryFoods.length} alimentos (${pantry.highProteinCount} ricos en proteína y ${pantry.highFiberCount} ricos en fibra) y cubre ${pantry.safeRecipesCount} receta${pantry.safeRecipesCount === 1 ? '' : 's'} segura${pantry.safeRecipesCount === 1 ? '' : 's'} para tus alergias.`,
      action: { type: 'navigate', page: 'plan', label: 'Ir al plan' },
    };
  }

  if (/receta|cocin|comer|comida|desayun|cenar|cena|almuerzo|menu|sugerencia/.test(q)) {
    const suggestion = suggestLocalRecipe(ctx);
    if (suggestion) {
      return {
        intent: 'receta',
        reply: `Te sugiero «${suggestion.recipe.nombre}»: ${suggestion.reason}`,
        action: { type: 'select-recipe', id: suggestion.recipe.id, label: 'Abrir receta en Plan' },
      };
    }
    const pantry = analyzePantry(ctx);
    if (pantry.unlockable.length > 0) {
      const next = pantry.unlockable[0];
      const missing = next.missingFoods.map((f) => f.nombre).join(' y ');
      return {
        intent: 'receta',
        reply: `Con tu despensa y alergias actuales no hay una receta completa aún. Si agregas ${missing}, podrás preparar «${next.recipe.nombre}».`,
        action: { type: 'navigate', page: 'ajustes', label: 'Editar despensa' },
      };
    }
    return {
      intent: 'receta',
      reply: 'No encontré una receta segura para tus alergias y despensa actuales. Revisa tus ingredientes en Ajustes › Perfil.',
    };
  }

  if (/ejercic|entren|rutina|cardio|fuerza|estir|abdom|piern|braz|espald|glute|sentadill|plancha/.test(q)) {
    const matched = searchExercises(question, ctx.exercises, 1)[0];
    if (matched) {
      return {
        intent: 'ejercicio',
        reply: `Ejercicio del catálogo local: «${matched.nombre}». Pasos: ${matched.instrucciones.slice(0, 2).join(' ')} Solo si te resulta cómodo; detente si hay dolor.`,
        action: { type: 'select-exercise', id: matched.id, label: 'Ver ejercicio en Plan' },
      };
    }
    const suggested = suggestLocalExercise(ctx);
    if (suggested) {
      return {
        intent: 'ejercicio',
        reply: `Te recomiendo «${suggested.exercise.nombre}». ${suggested.reason}`,
        action: { type: 'select-exercise', id: suggested.exercise.id, label: 'Ver ejercicio en Plan' },
      };
    }
  }

  if (/habit|racha|progres|dormir|sueno|agua|constanc|semana|hoy/.test(q)) {
    const h = analyzeHabits(ctx.habits, ctx.records, ctx.today, profile);
    const extra = h.strongestHabit
      ? ` Tu hábito más constante en 14 días es «${h.strongestHabit.nombre}» y tu mejor racha en 42 días es de ${h.bestStreak42d} días.`
      : '';
    return {
      intent: 'habitos',
      reply: `${h.summary}${extra}`,
      action: { type: 'navigate', page: 'progreso', label: 'Ver Progreso' },
    };
  }

  if (/mifflin|reposo|basal|calorias diarias|gasto|imc|peso|objetivo/.test(q)) {
    if (profile && (profile.padecimientos.trim() || profile.medicamentos.trim())) {
      return {
        intent: 'energia',
        reply:
          'Como indicaste padecimientos o medicamentos, Progressium omite el cálculo de energía en reposo por seguridad y te recomienda revisar tus metas con un profesional de salud.',
      };
    }
    const resting = computeSafeRestingEnergy(profile);
    if (resting !== null && profile) {
      return {
        intent: 'energia',
        reply: `Tu energía estimada en reposo (Mifflin) es ${resting} kcal/día para el objetivo de ${formatGoalLabel(profile.intencion)}. Es solo una referencia en reposo, NO gasto total ni prescripción.`,
      };
    }
    return {
      intent: 'energia',
      reply: 'El cálculo de energía en reposo está desactivado en tu perfil o falta completar tus datos.',
    };
  }

  const matchedFoods = searchFoods(question, ctx.foods, profile, 3);
  if (matchedFoods.length > 0 || /calor|kcal|protein|fibr|azucar|gras|carbohidr|alerg/.test(q)) {
    if (matchedFoods.length > 0) {
      const lines = matchedFoods.map(({ food, inPantry, allergyConflict }) => {
        const flags = [
          inPantry ? 'en tu despensa' : null,
          allergyConflict ? 'alerta de alergia' : null,
        ]
          .filter(Boolean)
          .join(' · ');
        const suffix = flags ? ` (${flags})` : '';
        return `${food.nombre}${suffix}: ${food.kcal100g ?? 0} kcal, ${food.proteina100g ?? 0} g prot, ${food.carbohidratos100g ?? 0} g carb, ${food.grasa100g ?? 0} g grasa, ${food.fibra100g ?? 0} g fibra por 100 g`;
      });
      return {
        intent: 'alimento',
        reply: `Datos USDA por 100 g: ${lines.join(' | ')}.`,
      };
    }
    return {
      intent: 'alimento',
      reply: 'No encontré ese alimento exacto en el catálogo local de 300 alimentos USDA. Prueba con el nombre simple, por ejemplo «avena», «huevo», «pollo» o «frijol».',
    };
  }

  const matchedExercises = searchExercises(question, ctx.exercises, 1);
  if (matchedExercises.length > 0) {
    const ex = matchedExercises[0];
    return {
      intent: 'ejercicio',
      reply: `Encontré el ejercicio «${ex.nombre}»: ${ex.instrucciones.slice(0, 2).join(' ')} Solo si te resulta cómodo; detente si hay dolor.`,
      action: { type: 'select-exercise', id: ex.id, label: 'Ver ejercicio en Plan' },
    };
  }

  const brief = buildDailyBrief(ctx);
  const parts = [brief.habitSummary];
  if (brief.recipeSuggestion) {
    parts.push(`Receta sugerida: «${brief.recipeSuggestion.recipe.nombre}» (~${brief.recipeSuggestion.macros.kcal} kcal).`);
  }
  parts.push('Puedes preguntarme por recetas, qué falta en tu despensa, calorías o proteína de un alimento, ejercicios o tu racha.');
  return {
    intent: 'general',
    reply: parts.join(' '),
  };
}
