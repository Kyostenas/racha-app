import { describe, it, expect } from 'vitest';
import { contrast, onColor, themePalette, applyTheme, Tokens } from './themes';
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
describe('temas y OLED son dimensiones independientes', () => {
  it('contraste WCAG blanco/negro =21', () => expect(contrast('#000000', '#FFFFFF')).toBe(21));
  it('mismo color=1', () => expect(contrast('#FF5A1F', '#FF5A1F')).toBe(1));
  it('Racha predeterminado claro', () =>
    expect(themePalette(tokens, defaultSettings).fondo).toBe('#FFF8EC'));
  it('OLED preserva primario y acento', () => {
    const v = themePalette(tokens, { ...defaultSettings, oled: true });
    expect(v.fondo).toBe('#000000');
    expect(v.primario).toBe(p.primario);
    expect(v.acento).toBe(p.acento);
    expect(v.tinta).toBe(p.primario);
  });
  it('alto contraste ignora OLED', () =>
    expect(themePalette(tokens, { ...defaultSettings, tema: 'altoContraste', oled: true })).toEqual(
      themePalette(tokens, { ...defaultSettings, tema: 'altoContraste', oled: false }),
    ));
  it('color desconocido vuelve a Racha', () =>
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
