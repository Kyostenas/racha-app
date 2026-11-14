import { describe, it, expect } from 'vitest';
import { App } from './app';
import { TestBed } from '@angular/core/testing';
describe('presentación de datos ausentes', () => {
  it('null/undefined no se convierten en cero', () => {
    const app = TestBed.runInInjectionContext(() => new App());
    expect(app.formatNutrient(null)).toBe('sin dato');
    expect(app.formatNutrient(undefined)).toBe('sin dato');
    expect(app.formatNutrient(0)).toBe('0 g');
  });
});

import { formatNutrient, shortFoodName } from './presentation';
describe('presentación compacta, sin cambiar datos', () => {
  it('redondea a una cifra decimal', () => expect(formatNutrient(12.56)).toBe('12.6 g'));
  it('conserva enteros y sin dato', () => {
    expect(formatNutrient(3)).toBe('3 g');
    expect(formatNutrient(null)).toBe('sin dato');
  });
  it('mantiene nombres cortos', () =>
    expect(shortFoodName('Huevo entero')).toBe('Huevo entero'));
  it('retira paréntesis en el chip, sin alterar el nombre fuente', () =>
    expect(shortFoodName('Tomate verde (tomatillo)')).toBe('Tomate verde'));
  it('abrevia nombres largos conservando su final', () => {
    const full = 'Tortilla de harina de trigo refrigerada lista para calentar';
    const short = shortFoodName(full);
    expect(short.length).toBeLessThanOrEqual(44);
    expect(short).toContain('…');
    expect(short).toContain('calentar');
    expect(full).not.toContain('…');
  });
});
