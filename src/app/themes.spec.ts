import { describe, it, expect } from 'vitest';
import {
  contrast,
  onColor,
  themePalette,
  applyTheme,
  evaluateCustomContrast,
  contrastReportForPalette,
  Tokens,
} from './themes';
import { defaultSettings } from './domain';

const p = {
  fondo: '#FFF8EC',
  superficie: '#FFFFFF',
  primario: '#FF5A1F',
  sobrePrimario: '#121212',
  acento: '#FFD23F',
  tinta: '#121212',
  texto: '#121212',
  textoSuave: '#4A4A4A',
  exito: '#1E9E5A',
};
const tokens: Tokens = {
  temas: {
    racha: p,
    altoContraste: {
      ...p,
      fondo: '#000000',
      superficie: '#000000',
      primario: '#FFFF00',
      acento: '#FFFFFF',
      texto: '#FFFFFF',
      tinta: '#FFFFFF',
      exito: '#FFFF00',
      urgente: '#FFFF00',
    },
  },
  oled: {
    fondo: '#000000',
    superficie: '#0A0A0A',
    superficieAlta: '#141414',
    texto: '#F2F2F2',
    textoSuave: '#A3A3A3',
    exito: '#3DDC97',
    urgente: '#FF4D4D',
  },
};

const realTokens = {"temas": {"racha": {"fondo": "#FFF8EC", "superficie": "#FFFFFF", "primario": "#FF5A1F", "sobrePrimario": "#121212", "acento": "#FFD23F", "tinta": "#121212", "texto": "#121212", "textoSuave": "#4A4A4A", "exito": "#1E9E5A", "urgente": "#FF4D4D"}, "menta": {"fondo": "#EEFFF7", "superficie": "#FFFFFF", "primario": "#00E5A0", "sobrePrimario": "#000000", "acento": "#FFD23F", "tinta": "#111111", "texto": "#111111", "textoSuave": "#4A4A4A", "exito": "#1E9E5A", "urgente": "#FF4D4D"}, "electrico": {"fondo": "#F1F5FF", "superficie": "#FFFFFF", "primario": "#2C68FA", "sobrePrimario": "#FFFFFF", "acento": "#FFD23F", "tinta": "#111111", "texto": "#111111", "textoSuave": "#4A4A4A", "exito": "#1E9E5A", "urgente": "#FF4D4D"}, "talavera": {"fondo": "#F5F1E6", "superficie": "#FFFFFF", "primario": "#1F3FA8", "sobrePrimario": "#FFFFFF", "acento": "#F2B705", "tinta": "#0E1A40", "texto": "#0E1A40", "textoSuave": "#3B4670", "exito": "#1E9E5A", "urgente": "#FF4D4D"}, "aguacate": {"fondo": "#F1F7E8", "superficie": "#FFFFFF", "primario": "#2E7D32", "sobrePrimario": "#FFFFFF", "acento": "#C6E35A", "tinta": "#102A12", "texto": "#102A12", "textoSuave": "#3D5A40", "exito": "#1E9E5A", "urgente": "#FF4D4D"}, "altoContraste": {"fondo": "#000000", "superficie": "#000000", "primario": "#FFFF00", "sobrePrimario": "#000000", "acento": "#FFFFFF", "tinta": "#FFFFFF", "texto": "#FFFFFF", "textoSuave": "#FFFFFF", "exito": "#FFFF00", "nota": "tema aparte; el interruptor OLED no aplica", "urgente": "#FFFF00"}, "cempasuchil": {"fondo": "#FFF7E8", "superficie": "#FFFFFF", "primario": "#A34B00", "sobrePrimario": "#FFFFFF", "acento": "#FFD36A", "tinta": "#231A10", "texto": "#231A10", "textoSuave": "#594631", "exito": "#22785E", "urgente": "#B83A42", "superficieAlta": "#FFFFFF", "sobreAcento": "#000000"}, "jamaica": {"fondo": "#FFF4F7", "superficie": "#FFFFFF", "primario": "#AA3D68", "sobrePrimario": "#FFFFFF", "acento": "#F1C2D3", "tinta": "#2C1722", "texto": "#2C1722", "textoSuave": "#62404F", "exito": "#22785E", "urgente": "#B83A42", "superficieAlta": "#FFFFFF", "sobreAcento": "#000000"}, "anil": {"fondo": "#F2F7FC", "superficie": "#FFFFFF", "primario": "#3366A1", "sobrePrimario": "#FFFFFF", "acento": "#E8BA70", "tinta": "#17283A", "texto": "#17283A", "textoSuave": "#43576B", "exito": "#3366A1", "urgente": "#A34B00", "superficieAlta": "#FFFFFF", "sobreAcento": "#000000"}, "copal": {"fondo": "#F4F4EE", "superficie": "#FFFFFF", "primario": "#626B5A", "sobrePrimario": "#FFFFFF", "acento": "#D9D8BC", "tinta": "#252A22", "texto": "#252A22", "textoSuave": "#51584B", "exito": "#22785E", "urgente": "#B83A42", "superficieAlta": "#FFFFFF", "sobreAcento": "#000000"}, "cacao": {"fondo": "#FAF4EE", "superficie": "#FFFFFF", "primario": "#80604A", "sobrePrimario": "#FFFFFF", "acento": "#E0C3A3", "tinta": "#2C211B", "texto": "#2C211B", "textoSuave": "#635146", "exito": "#22785E", "urgente": "#B83A42", "superficieAlta": "#FFFFFF", "sobreAcento": "#000000"}}, "oled": {"fondo": "#000000", "superficie": "#0A0A0A", "superficieAlta": "#141414", "texto": "#F2F2F2", "textoSuave": "#A3A3A3", "exito": "#3DDC97", "urgente": "#FF4D4D", "tinta": "= primario"}} as Tokens;

describe('temas y OLED son dimensiones independientes', () => {
  it('contraste WCAG blanco/negro =21', () => expect(contrast('#000000', '#FFFFFF')).toBe(21));
  it('mismo color=1', () => expect(contrast('#FF5A1F', '#FF5A1F')).toBe(1));
  it('tema predeterminado claro', () =>
    expect(themePalette(tokens, defaultSettings).fondo).toBe('#FFF8EC'));
  it('OLED preserva primario, acento, exito y urgente; tinta usa texto claro', () => {
    const v = themePalette(tokens, { ...defaultSettings, oled: true });
    expect(v.fondo).toBe('#000000');
    expect(v.primario).toBe(p.primario);
    expect(v.acento).toBe(p.acento);
    expect(v.exito).toBe(p.exito);
    expect(v.urgente).toBe('#FF4D4D');
    expect(v.tinta).toBe('#F2F2F2');
    expect(v.texto).toBe('#F2F2F2');
  });
  it('alto contraste ignora OLED', () =>
    expect(themePalette(tokens, { ...defaultSettings, tema: 'altoContraste', oled: true })).toEqual(
      themePalette(tokens, { ...defaultSettings, tema: 'altoContraste', oled: false }),
    ));
  it('color desconocido vuelve al predeterminado', () =>
    expect(themePalette(tokens, { ...defaultSettings, tema: 'desconocido' }).primario).toBe(
      p.primario,
    ));
  it('deriva texto legible de cuatro colores', () => {
    const result = themePalette(tokens, {
      ...defaultSettings,
      tema: 'personalizado',
      personalizado: {
        fondo: '#FFFFFF',
        primario: '#FFFFFF',
        acento: '#333333',
        urgente: '#FF0000',
      },
    });
    expect(contrast(result.texto, result.fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(result.sobrePrimario, result.primario)).toBeGreaterThanOrEqual(4.5);
  });
  it('color sobre botón siempre el de mayor contraste', () =>
    expect(onColor('#000000')).toBe('#FFFFFF'));
  it('dos atributos separados y negro puro', () => {
    const root = document.createElement('html');
    applyTheme(tokens, { ...defaultSettings, oled: true }, root);
    expect(root.dataset['tema']).toBe('racha');
    expect(root.hasAttribute('data-oled')).toBe(true);
    expect(root.style.getPropertyValue('--fondo')).toBe('#000000');
    applyTheme(tokens, defaultSettings, root);
    expect(root.hasAttribute('data-oled')).toBe(false);
  });
});

describe('contraste AA en temas predeterminados y propuestos', () => {
  const ids = Object.keys(realTokens.temas);
  it('incluye los once temas', () => {
    expect(ids).toEqual(
      expect.arrayContaining([
        'racha',
        'menta',
        'electrico',
        'talavera',
        'aguacate',
        'cempasuchil',
        'jamaica',
        'anil',
        'copal',
        'cacao',
        'altoContraste',
      ]),
    );
    expect(ids.length).toBe(11);
  });

  for (const id of ['cempasuchil', 'jamaica', 'anil', 'copal', 'cacao', 'altoContraste']) {
    it(`${id} pasa pares textuales AA sin OLED`, () => {
      const palette = themePalette(realTokens, { ...defaultSettings, tema: id, oled: false });
      const report = contrastReportForPalette(palette);
      const textFails = report.pairs.filter((x) => x.min === 4.5 && !x.ok);
      expect(textFails).toEqual([]);
    });
  }

  it('bloquea personalizado con contraste insuficiente', () => {
    const report = evaluateCustomContrast(
      { fondo: '#FFFFFF', primario: '#EEEEEE', acento: '#DDDDDD', urgente: '#CCCCCC' },
      false,
    );
    expect(report.ok).toBe(false);
    expect(report.failures[0]).toMatch(/Se necesita/);
  });

  it('acepta personalizado con contraste suficiente', () => {
    const report = evaluateCustomContrast(
      { fondo: '#FFF8EC', primario: '#FF5A1F', acento: '#FFD23F', urgente: '#B83A42' },
      false,
    );
    expect(report.ok).toBe(true);
  });
});


describe('OLED contraste bordes y texto', () => {
  const ids = Object.keys(realTokens.temas).filter((id) => id !== 'altoContraste');

  for (const id of ids) {
    it(`${id} OLED: bordes ≥3:1 y texto ≥4.5:1; primario no es texto sobre negro`, () => {
      const palette = themePalette(realTokens, { ...defaultSettings, tema: id, oled: true });
      expect(palette.tinta).toBe('#F2F2F2');
      expect(contrast(palette.tinta, palette.fondo)).toBeGreaterThanOrEqual(3);
      expect(contrast(palette.tinta, palette.superficie)).toBeGreaterThanOrEqual(3);
      expect(contrast(palette.texto, palette.fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.texto, palette.superficie)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.textoSuave, palette.fondo)).toBeGreaterThanOrEqual(4.5);
      // El primario no se usa como color de texto sobre negro en OLED.
      expect(palette.texto).not.toBe(palette.primario);
      expect(palette.textoSuave).not.toBe(palette.primario);
      if (contrast(palette.primario, '#000000') < 4.5) {
        expect(palette.texto).not.toBe(palette.primario);
      }
    });
  }
});
