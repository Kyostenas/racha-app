import { z } from 'zod';
import { FOOD_ALIASES } from './alimentos-alias';

/** v0.4.4: los IDs viejos crudo/cocido se migran al ingrediente único; sin duplicados ni pérdida. */
export function migrateFoodIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const next = FOOD_ALIASES[id] ?? id;
    if (!out.includes(next)) out.push(next);
  }
  return out;
}
const despensaSchema = z.preprocess(
  (v) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? migrateFoodIds(v) : v),
  z.array(z.string()).min(1).max(30),
);

export const profileSchema = z
  .object({
    id: z.literal('local'),
    intencion: z.enum(['bajar', 'mantener', 'subir']),
    dormirMejor: z.boolean(),
    edad: z.number().int().min(18).max(100),
    estatura: z.number().min(100).max(230),
    peso: z.number().min(30).max(300),
    coeficiente: z.enum(['mujer', 'hombre', 'no-calcular']),
    alergias: z.array(z.string().max(80)).max(20),
    padecimientos: z.string().max(300),
    medicamentos: z.string().max(300),
    consentimiento: z.literal(true),
    consentimientoSalud: z.boolean(),
    despensa: despensaSchema,
    creado: z.string(),
  })
  .refine((p) => p.consentimientoSalud || (!p.padecimientos && !p.medicamentos), {
    message: 'Se necesita consentimiento antes de guardar datos opcionales de salud.',
  });
export type Perfil = z.infer<typeof profileSchema>;
export const foodSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  kcal100g: z.number().nonnegative().nullable(),
  proteina100g: z.number().nonnegative().nullable(),
  carbohidratos100g: z.number().nonnegative().nullable(),
  grasa100g: z.number().nonnegative().nullable(),
  fibra100g: z.number().nonnegative().nullable().optional(),
  azucares100g: z.number().nonnegative().nullable().optional(),
  sodio_mg100g: z.number().nonnegative().nullable().optional(),
  source_ref: z.string().url(),
  alergenos: z.array(z.string()),
  grupo: z.string().optional(),
  usos: z.array(z.string()).optional(),
  nota: z.string().optional(),
});
export type Alimento = z.infer<typeof foodSchema>;
export const exerciseSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  instrucciones: z.array(z.string()),
  source_ref: z.string().url(),
});
export type Ejercicio = z.infer<typeof exerciseSchema>;
export const recipeSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  ingredientes: z.array(z.object({ alimento: z.string(), gramos: z.number().positive() })).min(1),
  pasos: z.array(z.string()).min(1),
  source_ref: z.array(z.string().url()).min(1),
  origen: z.enum(['curada', 'ia-local']).optional(),
  momentos: z.array(z.enum(['desayuno', 'comida', 'cena'])).optional(),
});
export type Receta = z.infer<typeof recipeSchema>;
export type Momento = 'desayuno' | 'comida' | 'cena';
export const customThemeSchema = z.object({
  fondo: z.string().regex(/^#[0-9a-f]{6}$/i),
  primario: z.string().regex(/^#[0-9a-f]{6}$/i),
  acento: z.string().regex(/^#[0-9a-f]{6}$/i),
  urgente: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export const settingsSchema = z.object({
  id: z.literal('local'),
  tema: z.string(),
  oled: z.boolean(),
  personalizado: customThemeSchema.nullable(),
  ia: z.enum(['apagada', 'local', 'propia']).default('local'),
  base_url: z.string(),
  modelo: z.string(),
  clave: z.string(),
  consentimientoIA: z.boolean(),
  fuenteLectura: z.enum(['inter', 'sistema', 'atkinson']).default('inter'),
  vistaSencilla: z.boolean().default(false),
});

export const customThemeRecordSchema = z.object({
  id: z.string(),
  nombre: z.string().min(1).max(40),
  version: z.literal(1),
  colores: customThemeSchema,
  creado: z.string(),
  actualizado: z.string(),
});
export type TemaPersonalizado = z.infer<typeof customThemeRecordSchema>;
export const customThemesSchema = z.array(customThemeRecordSchema);

export type Ajustes = z.infer<typeof settingsSchema>;
export const defaultSettings: Ajustes = {
  id: 'local',
  tema: 'racha',
  oled: false,
  personalizado: null,
  ia: 'local',
  base_url: 'https://api.openai.com/v1',
  modelo: '',
  clave: '',
  consentimientoIA: false,
  fuenteLectura: 'inter',
  vistaSencilla: false,
};
export const habitSchema = z.object({ id: z.string(), nombre: z.string(), icono: z.string() });
export const habitsSchema = z.array(habitSchema);
export type Habito = z.infer<typeof habitSchema>;
export const initialHabits: Habito[] = [
  { id: 'agua', nombre: 'Elegir agua en una comida', icono: 'water_drop' },
  { id: 'mover', nombre: 'Moverme a mi ritmo', icono: 'directions_walk' },
  { id: 'descanso', nombre: 'Preparar mi hora de dormir', icono: 'bedtime' },
];
export const recordSchema = z.object({
  id: z.string(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  habito: z.string(),
  hecho: z.boolean(),
});
export type Registro = z.infer<typeof recordSchema>;
export const recordsSchema = z.array(recordSchema);
export const streakSchema = z.object({
  id: z.literal('local'),
  dias: z.number().int().nonnegative(),
  actualizado: z.string(),
});
