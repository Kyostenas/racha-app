import { z } from 'zod';
import { Ajustes, customThemeSchema } from './domain';
const paletteSchema = z.object({
  fondo: z.string(),
  superficie: z.string(),
  primario: z.string(),
  sobrePrimario: z.string(),
  acento: z.string(),
  tinta: z.string(),
  texto: z.string(),
  textoSuave: z.string(),
  exito: z.string(),
});
export type Palette = z.infer<typeof paletteSchema> & {
  urgente: string;
  sobreAcento: string;
  superficieAlta: string;
};
export const tokensSchema = z.object({
  temas: z.record(z.string(), paletteSchema),
  oled: z.object({
    fondo: z.string(),
    superficie: z.string(),
    superficieAlta: z.string(),
    texto: z.string(),
    textoSuave: z.string(),
    exito: z.string(),
    urgente: z.string(),
  }),
});
export type Tokens = z.infer<typeof tokensSchema>;
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return (rgb[0] ?? 0) * 0.2126 + (rgb[1] ?? 0) * 0.7152 + (rgb[2] ?? 0) * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function onColor(c: string): string {
  return contrast(c, '#000000') >= contrast(c, '#FFFFFF') ? '#000000' : '#FFFFFF';
}
export function themePalette(tokens: Tokens, s: Ajustes): Palette {
  const base = tokens.temas[s.tema] ?? tokens.temas['racha'];
  if (!base) throw new Error('Faltan tokens Racha.');
  let p: Palette = {
    ...base,
    urgente: '#FF4D4D',
    sobreAcento: onColor(base.acento),
    superficieAlta: base.superficie,
  };
  if (s.tema === 'personalizado' && s.personalizado) {
    const custom = customThemeSchema.parse(s.personalizado);
    const text = onColor(custom.fondo);
    p = {
      ...p,
      ...custom,
      superficie: custom.fondo,
      superficieAlta: custom.fondo,
      texto: text,
      textoSuave: text,
      tinta: text,
      sobrePrimario: onColor(custom.primario),
    };
  }
  if (s.oled && s.tema !== 'altoContraste') p = { ...p, ...tokens.oled, tinta: p.primario };
  return { ...p, sobreAcento: onColor(p.acento) };
}
export function applyTheme(
  tokens: Tokens,
  s: Ajustes,
  root: HTMLElement = document.documentElement,
): Palette {
  const p = themePalette(tokens, s);
  root.dataset['tema'] = s.tema;
  if (s.oled && s.tema !== 'altoContraste') root.setAttribute('data-oled', '');
  else root.removeAttribute('data-oled');
  for (const [key, value] of Object.entries(p)) root.style.setProperty('--' + key, value);
  root.style.colorScheme = p.fondo === '#000000' ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.fondo);
  return { ...p, sobreAcento: onColor(p.acento) };
}
