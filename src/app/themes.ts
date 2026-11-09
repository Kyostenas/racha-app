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
  urgente: z.string().optional(),
  superficieAlta: z.string().optional(),
  sobreAcento: z.string().optional(),
});
export type Palette = {
  fondo: string;
  superficie: string;
  superficieAlta: string;
  primario: string;
  sobrePrimario: string;
  acento: string;
  sobreAcento: string;
  tinta: string;
  texto: string;
  textoSuave: string;
  exito: string;
  urgente: string;
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
  const luminance = (h: string) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
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

export type ContrastPair = {
  name: string;
  fg: string;
  bg: string;
  ratio: number;
  min: number;
  ok: boolean;
  suggested?: string;
};
export type ContrastReport = {
  ok: boolean;
  minRatio: number;
  pairs: ContrastPair[];
  failures: string[];
  warnings: string[];
};

function pair(name: string, fg: string, bg: string, min: number): ContrastPair {
  const ratio = contrast(fg, bg);
  const suggested = ratio < min ? onColor(bg) : undefined;
  return { name, fg, bg, ratio, min, ok: ratio >= min, suggested };
}

/** Informe AA para paleta resuelta (texto 4.5, UI 3). */
export function contrastReportForPalette(p: Palette): ContrastReport {
  const pairs: ContrastPair[] = [
    pair('Texto / fondo', p.texto, p.fondo, 4.5),
    pair('Texto / superficie', p.texto, p.superficie, 4.5),
    pair('Texto / superficieAlta', p.texto, p.superficieAlta, 4.5),
    pair('Texto suave / fondo', p.textoSuave, p.fondo, 4.5),
    pair('Texto suave / superficie', p.textoSuave, p.superficie, 4.5),
    pair('Texto suave / superficieAlta', p.textoSuave, p.superficieAlta, 4.5),
    pair('Sobre primario / primario', p.sobrePrimario, p.primario, 4.5),
    pair('Sobre acento / acento', p.sobreAcento, p.acento, 4.5),
    pair('Éxito / superficie', p.exito, p.superficie, 3),
    pair('Urgente / superficie', p.urgente, p.superficie, 3),
    pair('Tinta / superficie', p.tinta, p.superficie, 3),
  ];
  const failures = pairs
    .filter((x) => !x.ok)
    .map(
      (x) =>
        `${x.name}: ${x.ratio.toFixed(1)}:1. Se necesita ${x.min}:1` +
        (x.suggested ? `. Prueba ${x.suggested}.` : ''),
    );
  const warnings = pairs
    .filter((x) => x.ok && x.min === 4.5 && x.ratio < 7)
    .map((x) => `${x.name}: ${x.ratio.toFixed(1)}:1 (bajo 7:1 AAA opcional).`);
  const minRatio = Math.min(...pairs.map((x) => x.ratio));
  return { ok: failures.length === 0, minRatio, pairs, failures, warnings };
}

export function resolveCustomPalette(
  custom: z.infer<typeof customThemeSchema>,
  oled: boolean,
): Palette {
  const text = onColor(custom.fondo);
  let p: Palette = {
    fondo: custom.fondo,
    superficie: custom.fondo,
    superficieAlta: custom.fondo,
    primario: custom.primario,
    sobrePrimario: onColor(custom.primario),
    acento: custom.acento,
    sobreAcento: onColor(custom.acento),
    tinta: text,
    texto: text,
    textoSuave: text,
    exito: '#22785E',
    urgente: custom.urgente,
  };
  if (oled) {
    p = {
      ...p,
      fondo: '#000000',
      superficie: '#0A0A0A',
      superficieAlta: '#141414',
      texto: '#F2F2F2',
      textoSuave: '#A3A3A3',
      tinta: p.primario,
      // conserva primario/acento/exito/urgente del tema
    };
  }
  return { ...p, sobreAcento: onColor(p.acento) };
}

export function evaluateCustomContrast(
  custom: z.infer<typeof customThemeSchema>,
  oled: boolean,
): ContrastReport {
  return contrastReportForPalette(resolveCustomPalette(custom, oled));
}

export function themePalette(tokens: Tokens, s: Ajustes): Palette {
  const base = tokens.temas[s.tema] ?? tokens.temas['racha'];
  if (!base) throw new Error('Faltan tokens de Progresium.');
  let p: Palette = {
    fondo: base.fondo,
    superficie: base.superficie,
    superficieAlta: base.superficieAlta ?? base.superficie,
    primario: base.primario,
    sobrePrimario: base.sobrePrimario,
    acento: base.acento,
    sobreAcento: base.sobreAcento ?? onColor(base.acento),
    tinta: base.tinta,
    texto: base.texto,
    textoSuave: base.textoSuave,
    exito: base.exito,
    urgente: base.urgente ?? '#FF4D4D',
  };
  if ((s.tema === 'personalizado' || s.tema.startsWith('custom:')) && s.personalizado) {
    const custom = customThemeSchema.parse(s.personalizado);
    p = resolveCustomPalette(custom, false);
  }
  if (s.oled && s.tema !== 'altoContraste') {
    // OLED: sustituye superficies/texto; conserva primario, acento, exito y urgente
    p = {
      ...p,
      fondo: tokens.oled.fondo,
      superficie: tokens.oled.superficie,
      superficieAlta: tokens.oled.superficieAlta,
      texto: tokens.oled.texto,
      textoSuave: tokens.oled.textoSuave,
      tinta: p.primario,
    };
  }
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
  return p;
}
