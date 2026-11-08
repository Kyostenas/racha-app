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
