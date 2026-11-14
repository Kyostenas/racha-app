// Lee las ligaduras (nombres de ícono) de una fuente WOFF2 sin dependencias: descomprime el bloque
// Brotli, ubica cmap y GSUB (nunca vienen transformadas) y recorre las sustituciones de ligadura.
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

const TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

export function ligaduras(ruta) {
  const b = readFileSync(ruta);
  if (b.toString('latin1', 0, 4) !== 'wOF2') throw new Error(`${ruta} no es WOFF2`);
  const numTables = b.readUInt16BE(12);
  let p = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const x = b[p++];
      v = v * 128 + (x & 0x7f);
      if (!(x & 0x80)) return v;
    }
    throw new Error('UIntBase128 inválido');
  };
  const tablas = {};
  let off = 0;
  for (let i = 0; i < numTables; i++) {
    const flags = b[p++];
    const tag = (flags & 0x3f) === 63 ? b.toString('latin1', p, (p += 4)) : TAGS[flags & 0x3f];
    const version = (flags >> 6) & 3;
    const orig = base128();
    const transformada = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    const largo = transformada ? base128() : orig;
    tablas[tag] = { off, largo };
    off += largo;
  }
  const datos = brotliDecompressSync(b.subarray(p, p + b.readUInt32BE(20)));
  const t = (tag) => datos.subarray(tablas[tag].off, tablas[tag].off + tablas[tag].largo);

  // cmap: glifo → carácter (formatos 4 y 12).
  const cmap = t('cmap');
  const aChar = new Map();
  for (let i = 0, n = cmap.readUInt16BE(2); i < n; i++) {
    const so = cmap.readUInt32BE(4 + i * 8 + 4);
    const fmt = cmap.readUInt16BE(so);
    if (fmt === 4) {
      const seg = cmap.readUInt16BE(so + 6) / 2;
      const ends = so + 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ranges = deltas + seg * 2;
      for (let s = 0; s < seg; s++) {
        const fin = cmap.readUInt16BE(ends + s * 2), ini = cmap.readUInt16BE(starts + s * 2);
        const delta = cmap.readInt16BE(deltas + s * 2), ro = cmap.readUInt16BE(ranges + s * 2);
        for (let c = ini; c <= fin && c !== 0xffff; c++) {
          let g;
          if (ro === 0) g = (c + delta) & 0xffff;
          else {
            g = cmap.readUInt16BE(ranges + s * 2 + ro + (c - ini) * 2);
            if (g) g = (g + delta) & 0xffff;
          }
          if (g && !aChar.has(g)) aChar.set(g, String.fromCodePoint(c));
        }
      }
    } else if (fmt === 12) {
      for (let k = 0, n2 = cmap.readUInt32BE(so + 12); k < n2; k++) {
        const r = so + 16 + k * 12;
        const ini = cmap.readUInt32BE(r), fin = cmap.readUInt32BE(r + 4), g0 = cmap.readUInt32BE(r + 8);
        for (let c = ini; c <= fin; c++) if (!aChar.has(g0 + c - ini)) aChar.set(g0 + c - ini, String.fromCodePoint(c));
      }
    }
  }

  // GSUB: sustituciones de ligadura (tipo 4, también dentro de extensiones tipo 7).
  const g = t('GSUB');
  const u16 = (o) => g.readUInt16BE(o);
  const cobertura = (o) => {
    const out = [];
    if (u16(o) === 1) for (let i = 0; i < u16(o + 2); i++) out.push(u16(o + 4 + i * 2));
    else
      for (let i = 0; i < u16(o + 2); i++) {
        const r = o + 4 + i * 6;
        for (let x = u16(r); x <= u16(r + 2); x++) out.push(x);
      }
    return out;
  };
  const nombres = new Set();
  const ll = u16(8);
  for (let i = 0; i < u16(ll); i++) {
    const lk = ll + u16(ll + 2 + i * 2);
    let tipo = u16(lk);
    for (let s = 0; s < u16(lk + 4); s++) {
      let st = lk + u16(lk + 6 + s * 2);
      if (tipo === 7) {
        if (u16(st + 2) !== 4) continue;
        st += g.readUInt32BE(st + 4);
      } else if (tipo !== 4) continue;
      const primeros = cobertura(st + u16(st + 2));
      for (let k = 0; k < u16(st + 4); k++) {
        const ls = st + u16(st + 6 + k * 2);
        for (let j = 0; j < u16(ls); j++) {
          const lig = ls + u16(ls + 2 + j * 2);
          const comps = [primeros[k]];
          for (let c = 1; c < u16(lig + 2); c++) comps.push(u16(lig + 4 + (c - 1) * 2));
          // Mayúsculas y minúsculas comparten glifo: la ligadura acepta ambas; se reporta en minúsculas.
          nombres.add(comps.map((x) => aChar.get(x) ?? '\uFFFD').join('').toLowerCase());
        }
      }
    }
  }
  return nombres;
}
