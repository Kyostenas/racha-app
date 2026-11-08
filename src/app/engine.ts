import { Alimento, Perfil, Receta, Registro } from './domain';
import { z } from 'zod';

export const MIFFLIN_SOURCE = 'https://doi.org/10.1093/ajcn/51.2.241';
export function mifflin(
  p: Pick<Perfil, 'edad' | 'estatura' | 'peso' | 'coeficiente'>,
): number | null {
  if (
    p.edad < 18 ||
    p.edad > 100 ||
    p.peso < 30 ||
    p.peso > 300 ||
    p.estatura < 100 ||
    p.estatura > 230 ||
    ![p.edad, p.peso, p.estatura].every(Number.isFinite)
  )
    return null;
  if (p.coeficiente === 'no-calcular') return null;
  return Math.round(
    10 * p.peso + 6.25 * p.estatura - 5 * p.edad + (p.coeficiente === 'hombre' ? 5 : -161),
  );
}
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
const allergyAliases: Record<string, string> = {
  huevos: 'huevo',
  lacteos: 'leche',
  lactosa: 'leche',
  gluten: 'trigo',
  soja: 'soya',
  mani: 'cacahuate',
  cacahuetes: 'cacahuate',
  nueces: 'frutos secos',
  almendra: 'frutos secos',
  almendras: 'frutos secos',
  camaron: 'mariscos',
  camarones: 'mariscos',
  pescado: 'pescado',
  huevo: 'huevo',
  leche: 'leche',
  trigo: 'trigo',
  soya: 'soya',
  cacahuate: 'cacahuate',
  'frutos secos': 'frutos secos',
  mariscos: 'mariscos',
  sesamo: 'sesamo',
  ajonjoli: 'sesamo',
};
const catalogAllergies = new Set(Object.values(allergyAliases));
export function recipeSafety(
  recipe: Receta,
  foods: Alimento[],
  allergies: string[],
): { segura: boolean; motivo: string } {
  const declared = allergies.map(normalize).filter(Boolean);
  const groups = declared.map((a) => allergyAliases[a] ?? a);
  for (const id of recipe.ingredientes.map((i) => i.alimento)) {
    const f = foods.find((x) => x.id === id);
    if (!f) return { segura: false, motivo: 'Falta información del ingrediente.' };
    for (const [i, a] of groups.entries()) {
      if (!catalogAllergies.has(a) && !foods.some((x) => normalize(x.nombre) === a))
        return {
          segura: false,
          motivo: `No podemos validar la alergia «${declared[i]}». Consulta a un profesional.`,
        };
      if (f.alergenos.map(normalize).includes(a) || normalize(f.nombre).includes(a))
        return { segura: false, motivo: 'Excluida por una alergia declarada.' };
    }
  }
  return {
    segura: true,
    motivo:
      'Ingredientes revisados contra tus alergias declaradas. Revisa etiquetas y contaminación cruzada.',
  };
}
export function selectRecipes(
  recipes: Receta[],
  foods: Alimento[],
  profile: Pick<Perfil, 'alergias' | 'despensa'>,
): Receta[] {
  return recipes.filter(
    (r) =>
      r.ingredientes.every((i) => profile.despensa.includes(i.alimento)) &&
      recipeSafety(r, foods, profile.alergias).segura,
  );
}
export function nutrition(recipe: Receta, foods: Alimento[]): number | null {
  let total = 0;
  for (const i of recipe.ingredientes) {
    const f = foods.find((f) => f.id === i.alimento);
    if (!f || f.kcal100g === null) return null;
    total += (f.kcal100g * i.gramos) / 100;
  }
  return Math.round(total);
}
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayBefore(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return localDate(d);
}
export function streak(records: Registro[], today = localDate()): number {
  const days = new Set(records.filter((r) => r.hecho && r.fecha <= today).map((r) => r.fecha));
  let cursor = days.has(today) ? today : dayBefore(today),
    n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = dayBefore(cursor);
  }
  return n;
}
const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});
const suggestionSchema = z.object({ receta_id: z.string() });
export function validateAiSuggestion(
  raw: unknown,
  allowed: Receta[],
  foods: Alimento[],
  profile: Pick<Perfil, 'alergias' | 'despensa'>,
): Receta {
  const response = responseSchema.parse(raw);
  const first = response.choices[0];
  if (!first) throw new Error('Respuesta vacía.');
  const suggestion = suggestionSchema.parse(JSON.parse(first.message.content));
  const recipe = selectRecipes(allowed, foods, profile).find((r) => r.id === suggestion.receta_id);
  if (!recipe) throw new Error('La propuesta no pasó las reglas. Conservamos el plan seguro.');
  return recipe;
}
