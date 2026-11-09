import { z } from 'zod';
import { customThemeSchema, TemaPersonalizado } from './domain';
import { evaluateCustomContrast } from './themes';

export const themeExportSchema = z.object({
  schemaVersion: z.literal(1),
  temas: z
    .array(
      z.object({
        nombre: z.string().min(1).max(40),
        colores: customThemeSchema,
      }),
    )
    .max(100),
});
export type ThemeExport = z.infer<typeof themeExportSchema>;

export const MAX_THEME_IMPORT_BYTES = 256 * 1024;

export function buildThemeExport(temas: TemaPersonalizado[]): ThemeExport {
  return {
    schemaVersion: 1,
    temas: temas.map((t) => ({ nombre: t.nombre, colores: { ...t.colores } })),
  };
}

export type ThemeImportResult = {
  ok: boolean;
  accepted: { nombre: string; colores: z.infer<typeof customThemeSchema> }[];
  rejected: string[];
};

export function parseThemeImport(raw: unknown, oled: boolean): ThemeImportResult {
  const rejected: string[] = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, accepted: [], rejected: ['El archivo no es un objeto JSON válido.'] };
  }
  const obj = raw as Record<string, unknown>;
  const allowed = new Set(['schemaVersion', 'temas']);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) rejected.push(`Clave no permitida: ${key}`);
  }
  if (obj['schemaVersion'] !== 1) {
    rejected.push('Versión de esquema desconocida o ausente.');
    return { ok: false, accepted: [], rejected };
  }
  const parsed = themeExportSchema.safeParse(obj);
  if (!parsed.success) {
    rejected.push('Estructura inválida o hex mal formado.');
    return { ok: false, accepted: [], rejected };
  }
  const accepted: ThemeImportResult['accepted'] = [];
  for (const item of parsed.data.temas) {
    const report = evaluateCustomContrast(item.colores, oled);
    if (!report.ok) {
      rejected.push(
        `«${item.nombre}»: contraste insuficiente (${report.failures[0] ?? 'AA'}).`,
      );
      continue;
    }
    accepted.push(item);
  }
  return { ok: accepted.length > 0 && rejected.length === 0, accepted, rejected };
}
