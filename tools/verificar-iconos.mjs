// Verifica que cada nombre de ícono usado en la app exista en la fuente Material Symbols empaquetada.
// Un nombre que no existe (o una regla CSS que le quite la fuente) se ve como texto recortado («sk»).
// Fuentes de nombres: plantillas (.html) con class="material-symbols-sharp", `icono: '…'` en .ts
// (hábitos) y los valores de MOMENTO_ICONO. e2e/iconos.spec.ts comprueba además el render real.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ligaduras } from './ligaduras-woff2.mjs';

// La misma fuente que importa src/styles.css (material-symbols/sharp.css).
const validos = ligaduras('node_modules/material-symbols/material-symbols-sharp.woff2');
if (validos.size < 1000 || !validos.has('home')) throw new Error(`Lectura de la fuente sospechosa (${validos.size})`);

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : [p];
  });
}
const usados = new Map();
const anotar = (nombre, donde) => usados.set(nombre, [...(usados.get(nombre) ?? []), donde]);
let dinamicos = 0;
for (const f of archivos('src')) {
  const txt = readFileSync(f, 'utf8');
  if (f.endsWith('.html')) {
    for (const m of txt.matchAll(/class="[^"]*\bmaterial-symbols-sharp\b[^"]*"[^>]*>([^<]*)</g)) {
      const v = m[1].trim();
      if (v.startsWith('{{')) dinamicos++;
      else anotar(v, f);
    }
  } else if (f.endsWith('.ts') && !f.endsWith('.spec.ts')) {
    for (const m of txt.matchAll(/\bicono:\s*'([^']+)'/g))
      if (/^[a-z0-9_]+$/.test(m[1])) anotar(m[1], f); // los emojis de reacciones no son ligaduras
    const bloque = txt.match(/MOMENTO_ICONO[^=]*=\s*\{([^}]*)\}/);
    if (bloque) for (const m of bloque[1].matchAll(/'([^']+)'/g)) anotar(m[1], f);
  }
}
const faltan = [...usados].filter(([n]) => !validos.has(n));
console.log(`Íconos usados: ${[...usados.keys()].sort().join(', ')} (${dinamicos} expresiones dinámicas)`);
if (faltan.length) {
  for (const [n, d] of faltan) console.error(`✗ «${n}» no existe en Material Symbols (${d.join(', ')})`);
  process.exit(1);
}
if (!usados.has('skillet') || !usados.has('egg_alt')) throw new Error('El escaneo no encontró íconos conocidos');
console.log(`✓ ${usados.size} íconos existen en la fuente`);
