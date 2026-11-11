import { z } from 'zod';
import type { Perfil, Registro } from '../domain';

// Debe coincidir con server/pb_hooks/lib/reglas.js
export const VERSION_AVISO = '2026-11-11';
export const EDADES = ['18-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60+'] as const;
export const ESTATURAS = ['<140', '140-149', '150-159', '160-169', '170-179', '180-189', '190-199', '200+'] as const;
export const IMC = ['bajo', 'normal', 'sobrepeso', 'obesidad'] as const;
export const DIETAS = [
  { id: 'omnivora', nombre: 'Como de todo' },
  { id: 'vegetariana', nombre: 'Vegetariana' },
  { id: 'vegana', nombre: 'Vegana' },
  { id: 'pescetariana', nombre: 'Pescetariana' },
  { id: 'sin_gluten', nombre: 'Sin gluten' },
  { id: 'otra', nombre: 'Otra' },
] as const;
export const INTERRUPTORES = [
  { id: 'intencion', nombre: 'Mi objetivo (bajar, mantener o subir)' },
  { id: 'edad_rango', nombre: 'Mi edad en rango de 5 años' },
  { id: 'estatura_rango', nombre: 'Mi estatura en rango de 10 cm' },
  { id: 'imc_cat', nombre: 'Mi categoría de IMC (no mi peso)' },
  { id: 'dieta', nombre: 'Mi tipo de alimentación' },
  { id: 'ejercicios', nombre: 'Los ejercicios que hago (hasta 5)' },
  { id: 'progreso', nombre: 'Mi progreso semanal (% de hábitos y racha)' },
  { id: 'cambio_peso', nombre: 'Mi cambio de peso en % (nunca en kg)' },
] as const;
export type Interruptor = (typeof INTERRUPTORES)[number]['id'];
export type Visibles = Record<Interruptor, boolean>;
export const todoApagado = (): Visibles =>
  Object.fromEntries(INTERRUPTORES.map((i) => [i.id, false])) as Visibles;

export const comunidadSchema = z.object({
  id: z.literal('local'),
  usuario: z.string().regex(/^[a-z0-9]{16,40}$/),
  clave: z.string().min(32).max(128),
  alias: z.string().max(60),
  dieta: z.string().max(16).default(''),
  ejercicios: z.array(z.string().max(60)).max(5).default([]),
  visibles: z.record(z.string(), z.boolean()).default({}),
  pesos: z.record(z.string(), z.number().min(30).max(300)).default({}),
  creado: z.string(),
});
export type ComunidadLocal = z.infer<typeof comunidadSchema>;

export function edadRango(edad: number): (typeof EDADES)[number] {
  if (edad >= 60) return '60+';
  if (edad < 25) return '18-24';
  const ini = Math.floor(edad / 5) * 5;
  return `${ini}-${ini + 4}` as (typeof EDADES)[number];
}
export function estaturaRango(cm: number): (typeof ESTATURAS)[number] {
  if (cm < 140) return '<140';
  if (cm >= 200) return '200+';
  const ini = Math.floor(cm / 10) * 10;
  return `${ini}-${ini + 9}` as (typeof ESTATURAS)[number];
}
// Categorías de IMC de la OMS.
export function imcCategoria(pesoKg: number, estaturaCm: number): (typeof IMC)[number] {
  const imc = pesoKg / (estaturaCm / 100) ** 2;
  if (imc < 18.5) return 'bajo';
  if (imc < 25) return 'normal';
  if (imc < 30) return 'sobrepeso';
  return 'obesidad';
}

export function semanaISO(fecha: Date): string {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const n = Math.ceil(((d.getTime() - inicio.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(n).padStart(2, '0')}`;
}

/** % de hábitos cumplidos de lunes a hoy (fechas locales AAAA-MM-DD). */
export function pctHabitosSemana(registros: Registro[], habitos: number, hoy: string): number {
  if (habitos <= 0) return 0;
  const [y, m, d] = hoy.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  const dias = fecha.getDay() || 7;
  const fechas: string[] = [];
  for (let i = 0; i < dias; i++) {
    const f = new Date(y, m - 1, d - i);
    fechas.push(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`);
  }
  const hechos = registros.filter((r) => r.hecho && fechas.includes(r.fecha)).length;
  return Math.min(100, Math.round((hechos / (habitos * dias)) * 100));
}

/** Cambio de peso en % desde el primer registro local, redondeado a 0.5. Nunca se envían kg. */
export function cambioPesoPct(pesos: Record<string, number>): number | null {
  const semanas = Object.keys(pesos).sort();
  if (semanas.length < 2) return null;
  const ini = pesos[semanas[0]];
  const fin = pesos[semanas[semanas.length - 1]];
  const pct = ((fin - ini) / ini) * 100;
  return Math.max(-30, Math.min(30, Math.round(pct * 2) / 2));
}

/** Construye el perfil público con SOLO rangos permitidos; lo apagado va vacío. */
export function perfilPublico(perfil: Perfil, local: Pick<ComunidadLocal, 'dieta' | 'ejercicios'>, visibles: Visibles) {
  return {
    visibles,
    intencion: visibles.intencion ? perfil.intencion : null,
    edad_rango: visibles.edad_rango ? edadRango(perfil.edad) : null,
    estatura_rango: visibles.estatura_rango ? estaturaRango(perfil.estatura) : null,
    imc_cat: visibles.imc_cat ? imcCategoria(perfil.peso, perfil.estatura) : null,
    dieta: visibles.dieta && local.dieta ? local.dieta : null,
    ejercicios: visibles.ejercicios ? local.ejercicios.slice(0, 5) : [],
  };
}

export function claveAleatoria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
