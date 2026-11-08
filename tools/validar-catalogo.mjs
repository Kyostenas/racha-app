import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { shortFoodName } from '../src/app/presentation.ts';
const foods = JSON.parse(readFileSync('public/data/alimentos.json', 'utf8'));
const exercises = JSON.parse(readFileSync('public/data/ejercicios.json', 'utf8'));
assert.equal(foods.length, 300);
assert.equal(exercises.length, 80);
assert.equal(new Set(foods.map((f) => f.id)).size, 300);
assert.equal(new Set(foods.map((f) => f.nombre)).size, 300);
const labels = new Map();
for (const food of foods) {
  assert.equal(typeof food.nombre, 'string');
  assert.ok(food.nombre.length > 0);
  for (const forbidden of ['nombreOriginal', 'nombreCompleto', 'nombre_en'])
    assert.equal(forbidden in food, false, food.id);
  assert.equal(
    food.source_ref,
    `https://fdc.nal.usda.gov/food-details/${food.id.replace('usda-', '')}/nutrients`,
  );
  const label = shortFoodName(food.nombre);
  assert.ok(label.length <= 44);
  assert.equal(label.split(' ')[0], food.nombre.split(' ')[0], food.id);
  labels.set(label, [...(labels.get(label) ?? []), food.id]);
  for (const key of [
    'kcal100g',
    'proteina100g',
    'carbohidratos100g',
    'grasa100g',
    'fibra100g',
    'azucares100g',
  ])
    assert.ok(
      food[key] === null ||
        (typeof food[key] === 'number' && Number.isFinite(food[key]) && food[key] >= 0),
    );
}
const duplicates = [...labels].filter(([, ids]) => ids.length > 1);
assert.deepEqual(duplicates, [], 'Chips ambiguos: revisar nombres abreviados');
assert.equal(existsSync('public/catalogo'), false);
assert.equal(existsSync('dist/racha-app/browser/catalogo'), false);
const manifest = JSON.parse(readFileSync('dist/racha-app/browser/ngsw.json', 'utf8'));
const urls = manifest.assetGroups.flatMap((group) => group.urls ?? []);
assert.equal(urls.filter((url) => url.endsWith('/data/alimentos.json')).length, 1);
assert.equal(urls.filter((url) => url.endsWith('/data/ejercicios.json')).length, 1);
assert.equal(
  urls.some((url) => url.includes('/catalogo/')),
  false,
);
console.log(
  'PASS: 300 nombres españoles coherentes y chips únicos; nutrientes válidos; 80 ejercicios; un solo catálogo publicado y precargado.',
);
