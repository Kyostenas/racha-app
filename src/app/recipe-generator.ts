import { Alimento, Momento, Perfil, Receta } from './domain';
import { mifflin, normalize, recipeSafety } from './engine';
import { healthLimits, healthSafety, HealthLimits } from './health-rules';
import { computeRecipeMacros, RecipeMacroSummary } from './local-ai';

/**
 * Generador local de recetas (v0.4.4). Arma platillos mexicanos con plantillas a partir de la
 * despensa. Ingredientes y cantidades salen de aquí y siempre pasan por recipeSafety (alergias) y
 * healthSafety (padecimientos y medicamentos). Un modelo del navegador, si existe, solo puede
 * redactar nombre y pasos: no cambia ingredientes ni cantidades.
 */
export const GENERATED_LABEL = 'Generada por IA local · revisa antes de cocinar';
export const MOMENTOS: Momento[] = ['desayuno', 'comida', 'cena'];
export const MOMENTO_LABEL: Record<Momento, string> = {
  desayuno: 'Mañana · Desayuno',
  comida: 'Tarde · Comida',
  cena: 'Noche · Cena',
};
/**
 * Ícono (ligadura de Material Symbols Sharp) para el arte de la receta según el momento del día.
 * tools/verificar-iconos.mjs comprueba que cada uno exista en la fuente empaquetada.
 */
export const MOMENTO_ICONO: Record<Momento, string> = {
  desayuno: 'egg_alt',
  comida: 'skillet',
  cena: 'dinner_dining',
};
/** Reparto del día: desayuno moderado, comida principal y cena ligera. */
export const MEAL_SHARE: Record<Momento, number> = { desayuno: 0.3, comida: 0.45, cena: 0.25 };
const FOODSAFETY_STEPS = 'https://www.foodsafety.gov/keep-food-safe/4-steps-to-food-safety';
const FOODSAFETY_TEMPS = 'https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures';

export type GenProfile = Pick<
  Perfil,
  'alergias' | 'despensa' | 'padecimientos' | 'medicamentos' | 'intencion' | 'edad' | 'estatura' | 'peso' | 'coeficiente'
>;

interface Slot {
  rol: string;
  usos: string[];
  gramos: number;
  opcional?: boolean;
  escala?: boolean;
  nombre?: RegExp;
  excluir?: RegExp;
}
type Picked = Record<string, Alimento | undefined>;
interface Plantilla {
  id: string;
  momentos: Momento[];
  slots: Slot[];
  nombre: (p: Picked) => string;
  pasos: (p: Picked) => string[];
}

export function displayName(f: Alimento | undefined): string {
  if (!f) return '';
  const n = f.nombre.replace(/\s*\([^)]*\)/g, '').trim();
  return n.length > 1 && n[1] === n[1].toLowerCase() ? n[0].toLowerCase() + n.slice(1) : n;
}
const nm = (f?: Alimento) => (f ? normalize(f.nombre) : '');

/** Paso de cocción con la temperatura interna segura (foodsafety.gov) según el tipo de proteína. */
export function cookStep(f: Alimento | undefined): string {
  if (!f) return '';
  const n = nm(f);
  const d = displayName(f);
  if ((f.usos ?? []).includes('huevo')) return `Cocina ${d} hasta que clara y yema estén firmes (71 °C).`;
  if ((f.usos ?? []).includes('leguminosa'))
    return `Usa ${d} ya cocido; caliéntalo hasta que hierva. Si es sobra refrigerada, recalienta a 74 °C.`;
  if ((f.usos ?? []).includes('procesado')) return `Dora ${d} y caliéntalo por completo (74 °C).`;
  if (/pollo|pavo/.test(n)) return `Cocina ${d} hasta 74 °C en la parte más gruesa; si ya está cocido, recaliéntalo a 74 °C.`;
  if (/molida|hamburguesa|pastel de carne/.test(n)) return `Cocina ${d} hasta 71 °C, sin partes rosadas.`;
  if (/higado/.test(n)) return `Cocina ${d} hasta 71 °C en el centro.`;
  if (/camaron|jaiba|pulpo/.test(n)) return `Cocina ${d} hasta que la carne esté opaca y firme (63 °C).`;
  if ((f.usos ?? []).includes('pescado'))
    return /lata/.test(n) ? `Escurre ${d}.` : `Cocina ${d} hasta 63 °C, cuando se separe fácil con un tenedor.`;
  if ((f.usos ?? []).includes('carne')) return `Cocina ${d} hasta 63 °C y déjalo reposar 3 minutos; si ya está cocido, recalienta a 74 °C.`;
  return `Calienta ${d} por completo.`;
}
const wash = (...fs: (Alimento | undefined)[]) => {
  const names = fs.filter(Boolean).map(displayName);
  return names.length ? `Lávate las manos. Lava bajo el chorro de agua ${names.join(', ')} y córtalo en trozos.` : 'Lávate las manos antes de cocinar.';
};
const opt = (f: Alimento | undefined, text: string) => (f ? text : '');
const salsaColor = (f?: Alimento) => (/verde|tomatillo/.test(nm(f)) ? 'verde' : 'roja');
const conV = (f?: Alimento) => (f ? ` con ${displayName(f)}` : '');

const PROTEINA_GUISO = ['carne', 'pescado', 'leguminosa'];
export const PLANTILLAS: Plantilla[] = [
  {
    id: 'huevos-mexicana',
    momentos: ['desayuno', 'cena'],
    slots: [
      { rol: 'huevo', usos: ['huevo'], gramos: 100, escala: true },
      { rol: 'jitomate', usos: ['salsa_base'], nombre: /jitomate/, gramos: 80 },
      { rol: 'cebolla', usos: ['sazon'], nombre: /cebolla/, gramos: 20, opcional: true },
      { rol: 'chile', usos: ['sazon'], nombre: /chile|jalapeno|serrano/, excluir: /polvo|ancho|pasilla/, gramos: 10, opcional: true },
      { rol: 'tortilla', usos: ['tortilla'], gramos: 60, opcional: true, escala: true },
    ],
    nombre: (p) => `Huevos a la mexicana${p['tortilla'] ? ' con tortillas' : ''}`,
    pasos: (p) => [
      wash(p['jitomate'], p['cebolla'], p['chile']),
      `Sofríe ${[p['jitomate'], p['cebolla'], p['chile']].filter(Boolean).map(displayName).join(', ')} en un sartén antiadherente con una cucharada de agua, 3 minutos.`,
      `Agrega ${displayName(p['huevo'])} batido y mueve. ${cookStep(p['huevo'])}`,
      opt(p['tortilla'], `Calienta ${displayName(p['tortilla'])} en el comal y sirve enseguida.`) || 'Sirve enseguida.',
    ],
  },
  {
    id: 'huevos-verdura',
    momentos: ['desayuno', 'cena'],
    slots: [
      { rol: 'huevo', usos: ['huevo'], gramos: 100, escala: true },
      { rol: 'verdura', usos: ['verdura'], excluir: /^jitomate|pepino|jicama|lechuga/, gramos: 80 },
      { rol: 'tortilla', usos: ['tortilla'], gramos: 60, opcional: true, escala: true },
    ],
    nombre: (p) => `Huevos con ${displayName(p['verdura'])}`,
    pasos: (p) => [
      wash(p['verdura']),
      `Cocina ${displayName(p['verdura'])} en un sartén con un poco de agua hasta que esté suave.`,
      `Agrega ${displayName(p['huevo'])} batido. ${cookStep(p['huevo'])}`,
      opt(p['tortilla'], `Acompaña con ${displayName(p['tortilla'])} caliente.`) || 'Sirve caliente.',
    ],
  },
  {
    id: 'quesadillas',
    momentos: ['desayuno', 'cena'],
    slots: [
      { rol: 'tortilla', usos: ['tortilla'], gramos: 60, escala: true },
      { rol: 'queso', usos: ['queso_fresco'], gramos: 40, escala: true },
      { rol: 'verdura', usos: ['verdura'], nombre: /flor de calabaza|champi|hongo|seta|espinaca|nopal|calabacita|poblano|quelite|verdolaga|acelga/, gramos: 60, opcional: true },
      { rol: 'salsa', usos: ['salsa_base'], gramos: 30, opcional: true },
    ],
    nombre: (p) => `Quesadillas de ${displayName(p['queso'])}${conV(p['verdura'])}`,
    pasos: (p) => [
      wash(p['verdura'], p['salsa'] && !/lista/.test(nm(p['salsa'])) ? p['salsa'] : undefined),
      opt(p['verdura'], `Cocina ${displayName(p['verdura'])} en el comal o sartén hasta que esté suave.`),
      `Calienta ${displayName(p['tortilla'])}, rellena con ${displayName(p['queso'])}${p['verdura'] ? ' y la verdura' : ''} y dobla.`,
      `Deja en el comal hasta que el queso se derrita por completo.${p['salsa'] ? ` Sirve con ${displayName(p['salsa'])} picado o en salsa.` : ''}`,
    ].filter(Boolean),
  },
  {
    id: 'avena',
    momentos: ['desayuno'],
    slots: [
      { rol: 'cereal', usos: ['cereal'], gramos: 40, escala: true },
      { rol: 'fruta', usos: ['fruta'], excluir: /tamarindo/, gramos: 100 },
      { rol: 'lacteo', usos: ['lacteo'], excluir: /yogur|evaporada/, gramos: 200, opcional: true },
      { rol: 'semilla', usos: ['semilla'], gramos: 10, opcional: true },
      { rol: 'canela', usos: ['sazon'], nombre: /canela/, gramos: 2, opcional: true },
    ],
    nombre: (p) => `${displayName(p['cereal']).replace(/^./, (c) => c.toUpperCase())} con ${displayName(p['fruta'])}`,
    pasos: (p) => [
      wash(p['fruta']),
      `Cuece ${displayName(p['cereal'])} en ${p['lacteo'] ? displayName(p['lacteo']) : '200 ml de agua potable'} a fuego medio, moviendo, hasta que espese (5 a 8 minutos).`,
      `Sirve con ${displayName(p['fruta'])} en trozos${p['semilla'] ? ` y ${displayName(p['semilla'])}` : ''}${p['canela'] ? ', espolvorea canela' : ''}.`,
    ],
  },
  {
    id: 'licuado',
    momentos: ['desayuno'],
    slots: [
      { rol: 'lacteo', usos: ['lacteo'], excluir: /evaporada/, gramos: 250 },
      { rol: 'fruta', usos: ['fruta'], excluir: /tamarindo|pasas|datil/, gramos: 120 },
      { rol: 'cereal', usos: ['cereal'], nombre: /avena/, gramos: 30, opcional: true, escala: true },
      { rol: 'semilla', usos: ['semilla'], gramos: 10, opcional: true },
    ],
    nombre: (p) => `Licuado de ${displayName(p['fruta'])}${p['cereal'] ? ' con avena' : ''}`,
    pasos: (p) => [
      wash(p['fruta']),
      `Licúa ${displayName(p['lacteo'])} con ${displayName(p['fruta'])}${p['cereal'] ? ' y la avena' : ''}${p['semilla'] ? ` y ${displayName(p['semilla'])}` : ''} hasta que quede terso.`,
      'Sirve de inmediato; no lo dejes más de 2 horas fuera del refrigerador.',
    ],
  },
  {
    id: 'yogur-fruta',
    momentos: ['desayuno', 'cena'],
    slots: [
      { rol: 'yogur', usos: ['yogur'], gramos: 170 },
      { rol: 'fruta', usos: ['fruta'], excluir: /tamarindo/, gramos: 100 },
      { rol: 'semilla', usos: ['semilla'], gramos: 15, opcional: true },
      { rol: 'cereal', usos: ['cereal'], gramos: 15, opcional: true, escala: true },
    ],
    nombre: (p) => `Yogur con ${displayName(p['fruta'])}${p['semilla'] ? ` y ${displayName(p['semilla'])}` : ''}`,
    pasos: (p) => [
      wash(p['fruta']),
      `Sirve ${displayName(p['yogur'])} frío y agrega ${displayName(p['fruta'])} en trozos.`,
      [p['semilla'], p['cereal']].some(Boolean)
        ? `Termina con ${[p['semilla'], p['cereal']].filter(Boolean).map(displayName).join(' y ')}.`
        : 'Come enseguida.',
    ],
  },
  {
    id: 'molletes',
    momentos: ['desayuno', 'cena'],
    slots: [
      { rol: 'pan', usos: ['pan'], gramos: 70, escala: true },
      { rol: 'frijol', usos: ['leguminosa'], nombre: /frijol/, gramos: 80, escala: true },
      { rol: 'queso', usos: ['queso'], gramos: 30, opcional: true },
      { rol: 'pico', usos: ['salsa_base'], nombre: /jitomate|salsa/, gramos: 50, opcional: true },
    ],
    nombre: (p) => `Molletes de ${displayName(p['frijol'])}${p['queso'] ? ` con ${displayName(p['queso'])}` : ''}`,
    pasos: (p) => [
      wash(p['pico'] && !/lista/.test(nm(p['pico'])) ? p['pico'] : undefined),
      `Abre ${displayName(p['pan'])} a la mitad y úntale ${displayName(p['frijol'])} machacado. ${cookStep(p['frijol'])}`,
      `${p['queso'] ? `Cubre con ${displayName(p['queso'])} y ` : ''}hornea o calienta en comal tapado hasta que esté caliente por dentro.`,
      opt(p['pico'], `Sirve con ${displayName(p['pico'])} picado.`) || 'Sirve caliente.',
    ],
  },
  {
    id: 'chilaquiles',
    momentos: ['desayuno', 'comida'],
    slots: [
      { rol: 'base', usos: ['tortilla', 'tostada'], gramos: 60, escala: true },
      { rol: 'salsa', usos: ['salsa_base'], gramos: 120 },
      { rol: 'proteina', usos: ['huevo', 'carne'], nombre: /pollo|huevo|pavo/, excluir: /jamon|salchicha/, gramos: 80, opcional: true, escala: true },
      { rol: 'queso', usos: ['queso_fresco'], gramos: 25, opcional: true },
      { rol: 'cebolla', usos: ['sazon'], nombre: /cebolla/, gramos: 15, opcional: true },
    ],
    nombre: (p) => `Chilaquiles ${salsaColor(p['salsa']) === 'verde' ? 'verdes' : 'rojos'}${conV(p['proteina'])}`,
    pasos: (p) => [
      wash(/lista/.test(nm(p['salsa'])) ? undefined : p['salsa'], p['cebolla']),
      /lista/.test(nm(p['salsa']))
        ? `Calienta ${displayName(p['salsa'])} en una olla hasta que hierva.`
        : `Hierve ${displayName(p['salsa'])} 10 minutos y licúalo con un poco del agua para hacer la salsa.`,
      `Corta ${displayName(p['base'])} en triángulos y tuéstalos en comal o al horno, sin freír.`,
      `${p['proteina'] ? cookStep(p['proteina']) + ' ' : ''}Baña los totopos con la salsa caliente justo antes de servir.`,
      `Sirve${p['queso'] ? ` con ${displayName(p['queso'])}` : ''}${p['cebolla'] ? ' y cebolla picada' : ''}.`,
    ],
  },
  {
    id: 'tacos',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'tortilla', usos: ['tortilla'], gramos: 90, escala: true },
      { rol: 'proteina', usos: PROTEINA_GUISO, excluir: /refritos/, gramos: 100, escala: true },
      { rol: 'verdura', usos: ['verdura'], excluir: /jicama|pepino/, gramos: 60, opcional: true },
      { rol: 'cebolla', usos: ['sazon'], nombre: /cebolla|cilantro/, gramos: 15, opcional: true },
      { rol: 'aguacate', usos: ['aguacate'], gramos: 30, opcional: true },
    ],
    nombre: (p) => `Tacos de ${displayName(p['proteina'])}${conV(p['verdura'])}`,
    pasos: (p) => [
      wash(p['verdura'], p['cebolla'], p['aguacate']),
      `${cookStep(p['proteina'])} Desmenuza o pica en trozos pequeños.`,
      opt(p['verdura'], `Asa ${displayName(p['verdura'])} en el comal hasta que esté suave.`),
      `Calienta ${displayName(p['tortilla'])} y arma los tacos${p['cebolla'] ? ` con ${displayName(p['cebolla'])} picado` : ''}${p['aguacate'] ? ' y aguacate' : ''}.`,
    ].filter(Boolean),
  },
  {
    id: 'caldo',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'proteina', usos: PROTEINA_GUISO, excluir: /lata|refritos|procesado|hamburguesa|pastel/, gramos: 100, escala: true },
      { rol: 'verdura1', usos: ['verdura'], excluir: /lechuga|pepino|jicama/, gramos: 80 },
      { rol: 'verdura2', usos: ['verdura'], excluir: /lechuga|pepino|jicama/, gramos: 80, opcional: true },
      { rol: 'base', usos: ['tuberculo', 'grano'], excluir: /pasta|cuscus|bulgur/, gramos: 80, opcional: true, escala: true },
      { rol: 'sazon', usos: ['sazon'], nombre: /cebolla|ajo|cilantro|epazote/, gramos: 15, opcional: true },
    ],
    nombre: (p) =>
      `Caldo de ${displayName(p['proteina'])} con ${displayName(p['verdura1'])}${p['verdura2'] ? ` y ${displayName(p['verdura2'])}` : ''}`,
    pasos: (p) => [
      wash(p['verdura1'], p['verdura2'], p['sazon']),
      `Pon a hervir 500 ml de agua potable${p['sazon'] ? ` con ${displayName(p['sazon'])}` : ''}.`,
      `Agrega ${displayName(p['proteina'])}${p['base'] ? ` y ${displayName(p['base'])}` : ''} y cocina a fuego medio. ${cookStep(p['proteina'])}`,
      `Añade ${displayName(p['verdura1'])}${p['verdura2'] ? ` y ${displayName(p['verdura2'])}` : ''} y cuece 10 minutos más, hasta que estén suaves. Sirve caliente.`,
    ],
  },
  {
    id: 'guisado-salsa',
    momentos: ['comida'],
    slots: [
      { rol: 'proteina', usos: PROTEINA_GUISO, excluir: /lata|refritos/, gramos: 110, escala: true },
      { rol: 'salsa', usos: ['salsa_base'], gramos: 120 },
      { rol: 'verdura', usos: ['verdura'], excluir: /lechuga|pepino|jicama|^jitomate|tomate verde/, gramos: 80, opcional: true },
      { rol: 'base', usos: ['grano', 'tortilla'], excluir: /cuscus|bulgur/, gramos: 100, opcional: true, escala: true },
    ],
    nombre: (p) => `${displayName(p['proteina']).replace(/^./, (c) => c.toUpperCase())} en salsa ${salsaColor(p['salsa'])}${conV(p['verdura'])}`,
    pasos: (p) => [
      wash(/lista/.test(nm(p['salsa'])) ? undefined : p['salsa'], p['verdura']),
      /lista/.test(nm(p['salsa']))
        ? `Calienta ${displayName(p['salsa'])} en una cacerola.`
        : `Hierve ${displayName(p['salsa'])} 10 minutos y licúalo con un poco del agua para hacer la salsa.`,
      `${cookStep(p['proteina'])} Agrégalo a la salsa${p['verdura'] ? ` con ${displayName(p['verdura'])}` : ''} y cocina 10 minutos a fuego bajo.`,
      opt(p['base'], `Sirve con ${displayName(p['base'])} caliente.`) || 'Sirve caliente.',
    ],
  },
  {
    id: 'bowl',
    momentos: ['comida'],
    slots: [
      { rol: 'grano', usos: ['grano'], gramos: 140, escala: true },
      { rol: 'proteina', usos: ['carne', 'pescado', 'leguminosa', 'huevo'], excluir: /procesado/, gramos: 100, escala: true },
      { rol: 'verdura', usos: ['verdura'], gramos: 80 },
      { rol: 'aguacate', usos: ['aguacate'], gramos: 40, opcional: true },
      { rol: 'limon', usos: ['sazon'], nombre: /limon/, gramos: 10, opcional: true },
    ],
    nombre: (p) => `Bowl de ${displayName(p['grano'])} con ${displayName(p['proteina'])} y ${displayName(p['verdura'])}`,
    pasos: (p) => [
      wash(p['verdura'], p['aguacate'], p['limon']),
      `Calienta ${displayName(p['grano'])} ya cocido; si es sobra refrigerada, recalienta a 74 °C.`,
      cookStep(p['proteina']),
      `Sirve en un tazón con ${displayName(p['verdura'])}${p['aguacate'] ? ' y aguacate en cubos' : ''}${p['limon'] ? ' y unas gotas de limón' : ''}.`,
    ],
  },
  {
    id: 'ensalada',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'hoja', usos: ['hoja'], gramos: 80 },
      { rol: 'proteina', usos: ['carne', 'pescado', 'leguminosa', 'huevo', 'queso_fresco'], excluir: /procesado|molida|hamburguesa/, gramos: 90, escala: true },
      { rol: 'verdura', usos: ['verdura'], excluir: /^(papa|camote|elote)/, gramos: 80, opcional: true },
      { rol: 'grasa', usos: ['aguacate'], gramos: 40, opcional: true },
      { rol: 'limon', usos: ['sazon'], nombre: /limon/, gramos: 10, opcional: true },
    ],
    nombre: (p) => `Ensalada de ${displayName(p['hoja'])} con ${displayName(p['proteina'])}`,
    pasos: (p) => [
      wash(p['hoja'], p['verdura'], p['grasa'], p['limon']),
      (p['proteina']?.usos ?? []).includes('queso_fresco')
        ? `Corta ${displayName(p['proteina'])} en cubos.`
        : `${cookStep(p['proteina'])} Deja enfriar en el refrigerador antes de mezclar.`,
      `Mezcla ${displayName(p['hoja'])}${p['verdura'] ? ` con ${displayName(p['verdura'])}` : ''} y la proteína${p['grasa'] ? ', agrega aguacate' : ''}${p['limon'] ? ' y aliña con limón' : ''}.`,
    ],
  },
  {
    id: 'sopa-leguminosa',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'leguminosa', usos: ['leguminosa'], excluir: /tofu|soya|edamame|refritos/, gramos: 180, escala: true },
      { rol: 'jitomate', usos: ['salsa_base'], nombre: /jitomate/, gramos: 80, opcional: true },
      { rol: 'verdura', usos: ['verdura'], nombre: /zanahoria|calabacita|chayote|apio|espinaca|nopal|acelga|ejote/, gramos: 60, opcional: true },
      { rol: 'sazon', usos: ['sazon'], nombre: /cebolla|ajo|epazote|cilantro/, gramos: 15, opcional: true },
    ],
    nombre: (p) => `Sopa de ${displayName(p['leguminosa'])}${conV(p['verdura'])}`,
    pasos: (p) => [
      wash(p['jitomate'], p['verdura'], p['sazon']),
      `${p['jitomate'] ? `Licúa ${displayName(p['jitomate'])}${p['sazon'] ? ` con ${displayName(p['sazon'])}` : ''} y` : 'Pon en una olla'} 300 ml de agua potable.`,
      `Agrega ${displayName(p['leguminosa'])}${p['verdura'] ? ` y ${displayName(p['verdura'])}` : ''}. ${cookStep(p['leguminosa'])}`,
      'Cocina 10 minutos más y sirve caliente.',
    ],
  },
  {
    id: 'sopa-fideo-arroz',
    momentos: ['comida'],
    slots: [
      { rol: 'grano', usos: ['grano'], nombre: /fideo|arroz|pasta/, excluir: /fideos de arroz/, gramos: 120, escala: true },
      { rol: 'jitomate', usos: ['salsa_base'], nombre: /jitomate/, gramos: 100 },
      { rol: 'proteina', usos: ['carne', 'leguminosa', 'huevo', 'pescado'], excluir: /procesado|lata/, gramos: 80, opcional: true, escala: true },
      { rol: 'verdura', usos: ['verdura'], nombre: /zanahoria|chicharo|calabacita|elote|ejote/, gramos: 50, opcional: true },
      { rol: 'cebolla', usos: ['sazon'], nombre: /cebolla|ajo/, gramos: 15, opcional: true },
    ],
    nombre: (p) =>
      `${/arroz/.test(nm(p['grano'])) ? 'Arroz rojo' : 'Sopa de fideo'}${conV(p['proteina'])}${p['verdura'] ? ` y ${displayName(p['verdura'])}` : ''}`,
    pasos: (p) => [
      wash(p['jitomate'], p['cebolla'], p['verdura']),
      `Licúa ${displayName(p['jitomate'])}${p['cebolla'] ? ` con ${displayName(p['cebolla'])}` : ''} y 200 ml de agua potable; cuélalo a una olla y deja hervir 5 minutos.`,
      `Agrega ${displayName(p['grano'])} ya cocido${p['verdura'] ? ` y ${displayName(p['verdura'])}` : ''}; calienta hasta que hierva.`,
      opt(p['proteina'], cookStep(p['proteina']) + ' Sirve encima.') || 'Sirve caliente.',
    ],
  },
  {
    id: 'tinga',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'proteina', usos: ['carne'], nombre: /pollo|res|cerdo|pavo|maciza/, excluir: /molida|hamburguesa|pastel|procesado|higado|chorizo|jamon|salchicha|chicharr/, gramos: 100, escala: true },
      { rol: 'jitomate', usos: ['salsa_base'], nombre: /jitomate/, gramos: 120 },
      { rol: 'cebolla', usos: ['sazon'], nombre: /cebolla/, gramos: 40 },
      { rol: 'base', usos: ['tostada', 'tortilla'], gramos: 40, opcional: true, escala: true },
    ],
    nombre: (p) => `Tinga de ${displayName(p['proteina'])}${p['base'] ? (/tostada|totopo/.test(nm(p['base'])) ? ' en tostadas' : ' con tortillas') : ''}`,
    pasos: (p) => [
      wash(p['jitomate'], p['cebolla']),
      `${cookStep(p['proteina'])} Deshébralo.`,
      `Sofríe ${displayName(p['cebolla'])} en rodajas con una cucharada de agua; agrega ${displayName(p['jitomate'])} licuado y cocina 8 minutos.`,
      `Incorpora la carne y calienta todo hasta que hierva.${p['base'] ? ` Sirve sobre ${displayName(p['base'])}.` : ''}`,
    ],
  },
  {
    id: 'calabacitas',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'calabacita', usos: ['verdura'], nombre: /calabacita/, gramos: 150 },
      { rol: 'jitomate', usos: ['salsa_base'], nombre: /jitomate/, gramos: 80 },
      { rol: 'elote', usos: ['tuberculo'], nombre: /elote/, gramos: 60, opcional: true },
      { rol: 'queso', usos: ['queso_fresco'], gramos: 40, opcional: true, escala: true },
      { rol: 'tortilla', usos: ['tortilla'], gramos: 60, opcional: true, escala: true },
    ],
    nombre: (p) => `Calabacitas a la mexicana${p['queso'] ? ` con ${displayName(p['queso'])}` : ''}`,
    pasos: (p) => [
      wash(p['calabacita'], p['jitomate'], p['elote']),
      `Cocina ${displayName(p['jitomate'])} picado 3 minutos en un sartén con una cucharada de agua.`,
      `Agrega ${displayName(p['calabacita'])} en cubos${p['elote'] ? ` y ${displayName(p['elote'])} desgranado` : ''}; tapa y cocina 10 minutos.`,
      `${p['queso'] ? `Añade ${displayName(p['queso'])} en cubos al final. ` : ''}${p['tortilla'] ? `Sirve con ${displayName(p['tortilla'])}.` : 'Sirve caliente.'}`,
    ],
  },
  {
    id: 'tostadas',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'tostada', usos: ['tostada'], gramos: 30, escala: true },
      { rol: 'proteina', usos: ['carne', 'pescado', 'leguminosa'], excluir: /hamburguesa|pastel/, gramos: 90, escala: true },
      { rol: 'hoja', usos: ['hoja'], gramos: 30, opcional: true },
      { rol: 'queso', usos: ['queso'], gramos: 20, opcional: true },
      { rol: 'salsa', usos: ['salsa_base'], gramos: 40, opcional: true },
    ],
    nombre: (p) => `Tostadas de ${displayName(p['proteina'])}`,
    pasos: (p) => [
      wash(p['hoja'], p['salsa'] && !/lista/.test(nm(p['salsa'])) ? p['salsa'] : undefined),
      cookStep(p['proteina']),
      `Coloca la proteína sobre ${displayName(p['tostada'])}${p['hoja'] ? ` con ${displayName(p['hoja'])} picada` : ''}${p['queso'] ? ` y ${displayName(p['queso'])}` : ''}.`,
      opt(p['salsa'], `Agrega ${displayName(p['salsa'])} picado o en salsa y come enseguida.`) || 'Come enseguida.',
    ],
  },
  {
    id: 'nopales-queso',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'nopal', usos: ['verdura'], nombre: /nopal/, gramos: 150 },
      { rol: 'queso', usos: ['queso_fresco'], gramos: 60, escala: true },
      { rol: 'salsa', usos: ['salsa_base'], gramos: 40, opcional: true },
      { rol: 'tortilla', usos: ['tortilla'], gramos: 60, opcional: true, escala: true },
    ],
    nombre: (p) => `Nopales asados con ${displayName(p['queso'])}`,
    pasos: (p) => [
      wash(p['nopal'], p['salsa'] && !/lista/.test(nm(p['salsa'])) ? p['salsa'] : undefined),
      `Asa ${displayName(p['nopal'])} enteros en el comal, 4 minutos por lado, hasta que cambien a verde olivo.`,
      `Coloca ${displayName(p['queso'])} encima para que se suavice.`,
      `${p['salsa'] ? `Acompaña con ${displayName(p['salsa'])}. ` : ''}${p['tortilla'] ? `Sirve con ${displayName(p['tortilla'])}.` : 'Sirve caliente.'}`,
    ],
  },
  {
    id: 'pescado-empapelado',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'pescado', usos: ['pescado'], excluir: /lata|camaron|jaiba|pulpo/, gramos: 130, escala: true },
      { rol: 'verdura1', usos: ['verdura'], excluir: /lechuga|pepino|jicama/, gramos: 80 },
      { rol: 'verdura2', usos: ['verdura'], excluir: /lechuga|pepino|jicama/, gramos: 60, opcional: true },
      { rol: 'limon', usos: ['sazon'], nombre: /limon|cebolla|ajo|chile/, excluir: /polvo/, gramos: 10, opcional: true },
      { rol: 'base', usos: ['grano', 'tortilla'], gramos: 100, opcional: true, escala: true },
    ],
    nombre: (p) => `${displayName(p['pescado']).replace(/^./, (c) => c.toUpperCase())} empapelado con ${displayName(p['verdura1'])}`,
    pasos: (p) => [
      wash(p['verdura1'], p['verdura2'], p['limon']),
      `Coloca ${displayName(p['pescado'])} sobre papel aluminio con ${displayName(p['verdura1'])}${p['verdura2'] ? ` y ${displayName(p['verdura2'])}` : ''} en rodajas${p['limon'] ? ` y ${displayName(p['limon'])}` : ''}. Cierra el paquete.`,
      `Hornea o cocina en sartén tapado 15 a 20 minutos. ${cookStep(p['pescado'])}`,
      opt(p['base'], `Sirve con ${displayName(p['base'])}.`) || 'Sirve caliente.',
    ],
  },
  {
    id: 'huevos-salsa',
    momentos: ['desayuno', 'cena'],
    slots: [
      { rol: 'huevo', usos: ['huevo'], gramos: 100, escala: true },
      { rol: 'salsa', usos: ['salsa_base'], gramos: 100 },
      { rol: 'tortilla', usos: ['tortilla'], gramos: 60, opcional: true, escala: true },
      { rol: 'frijol', usos: ['leguminosa'], nombre: /frijol/, gramos: 60, opcional: true },
    ],
    nombre: (p) => `Huevos en salsa ${salsaColor(p['salsa'])}${p['frijol'] ? ` con ${displayName(p['frijol'])}` : ''}`,
    pasos: (p) => [
      wash(/lista/.test(nm(p['salsa'])) ? undefined : p['salsa']),
      /lista/.test(nm(p['salsa']))
        ? `Calienta ${displayName(p['salsa'])} en un sartén hasta que hierva.`
        : `Hierve ${displayName(p['salsa'])} 8 minutos y licúalo con un poco del agua.`,
      `Agrega ${displayName(p['huevo'])} a la salsa y tapa. ${cookStep(p['huevo'])}`,
      [p['frijol'] ? cookStep(p['frijol']) : '', p['tortilla'] ? `Sirve con ${displayName(p['tortilla'])} caliente.` : 'Sirve caliente.'].join(' ').trim(),
    ],
  },
  {
    id: 'sopa-tortilla',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'tortilla', usos: ['tortilla', 'tostada'], excluir: /harina|trigo/, gramos: 50, escala: true },
      { rol: 'jitomate', usos: ['salsa_base'], nombre: /jitomate/, gramos: 150 },
      { rol: 'cebolla', usos: ['sazon'], nombre: /cebolla|ajo|epazote|chile pasilla|chile ancho/, gramos: 20, opcional: true },
      { rol: 'queso', usos: ['queso_fresco'], gramos: 30, opcional: true, escala: true },
      { rol: 'aguacate', usos: ['aguacate'], gramos: 30, opcional: true },
    ],
    nombre: (p) => `Sopa de tortilla${p['queso'] ? ` con ${displayName(p['queso'])}` : ''}${p['aguacate'] ? ' y aguacate' : ''}`,
    pasos: (p) => [
      wash(p['jitomate'], p['cebolla'], p['aguacate']),
      `Corta ${displayName(p['tortilla'])} en tiras y tuéstalas en comal u horno, sin freír.`,
      `Licúa ${displayName(p['jitomate'])}${p['cebolla'] ? ` con ${displayName(p['cebolla'])}` : ''} y 400 ml de agua potable; hierve 10 minutos.`,
      `Sirve el caldo caliente sobre las tiras${p['queso'] ? `, con ${displayName(p['queso'])} en cubos` : ''}${p['aguacate'] ? ' y aguacate' : ''}.`,
    ],
  },
  {
    id: 'entomatadas',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'tortilla', usos: ['tortilla'], gramos: 90, escala: true },
      { rol: 'salsa', usos: ['salsa_base', 'leguminosa'], nombre: /jitomate|tomate verde|salsa|frijol/, excluir: /refritos/, gramos: 120 },
      { rol: 'proteina', usos: ['carne', 'huevo', 'queso_fresco'], nombre: /pollo|pavo|huevo|queso|res/, excluir: /molida|hamburguesa|pastel|procesado|higado/, gramos: 70, opcional: true, escala: true },
      { rol: 'cebolla', usos: ['sazon'], nombre: /cebolla/, gramos: 15, opcional: true },
    ],
    nombre: (p) => {
      const n = nm(p['salsa']);
      const tipo = /frijol/.test(n) ? 'Enfrijoladas' : /verde|tomatillo/.test(n) ? 'Enchiladas verdes' : 'Entomatadas';
      return `${tipo}${p['proteina'] ? ` de ${displayName(p['proteina'])}` : ''}`;
    },
    pasos: (p) => [
      wash(/lista|frijol/.test(nm(p['salsa'])) ? undefined : p['salsa'], p['cebolla']),
      /frijol/.test(nm(p['salsa']))
        ? `Licúa ${displayName(p['salsa'])} con un poco de agua y caliéntalo hasta que hierva.`
        : /lista/.test(nm(p['salsa']))
          ? `Calienta ${displayName(p['salsa'])} hasta que hierva.`
          : `Hierve ${displayName(p['salsa'])} 8 minutos, licúalo y deja hervir la salsa 5 minutos más.`,
      p['proteina'] ? cookStep(p['proteina']) : `Calienta ${displayName(p['tortilla'])} en el comal.`,
      `Pasa ${displayName(p['tortilla'])} por la salsa caliente, ${p['proteina'] ? 'rellena, ' : ''}dobla y sirve${p['cebolla'] ? ' con cebolla en rodajas' : ''}.`,
    ],
  },
  {
    id: 'carne-mexicana',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'proteina', usos: ['carne', 'pescado'], excluir: /procesado|lata|hamburguesa|pastel|higado/, gramos: 110, escala: true },
      { rol: 'jitomate', usos: ['salsa_base'], nombre: /jitomate/, gramos: 80 },
      { rol: 'cebolla', usos: ['sazon'], nombre: /cebolla/, gramos: 30 },
      { rol: 'chile', usos: ['sazon'], nombre: /chile|jalapeno|serrano/, excluir: /polvo|ancho|pasilla/, gramos: 10, opcional: true },
      { rol: 'base', usos: ['grano', 'tortilla', 'tuberculo'], gramos: 100, opcional: true, escala: true },
    ],
    nombre: (p) => `${displayName(p['proteina']).replace(/^./, (c) => c.toUpperCase())} a la mexicana`,
    pasos: (p) => [
      wash(p['jitomate'], p['cebolla'], p['chile']),
      `Corta ${displayName(p['proteina'])} en tiras. ${cookStep(p['proteina'])}`,
      `Agrega ${displayName(p['jitomate'])}, ${displayName(p['cebolla'])}${p['chile'] ? ` y ${displayName(p['chile'])}` : ''} picados y cocina 5 minutos.`,
      opt(p['base'], `Sirve con ${displayName(p['base'])}.`) || 'Sirve caliente.',
    ],
  },
  {
    id: 'torta',
    momentos: ['comida', 'cena'],
    slots: [
      { rol: 'pan', usos: ['pan'], gramos: 80, escala: true },
      { rol: 'proteina', usos: ['carne', 'pescado', 'huevo', 'leguminosa', 'queso_fresco'], excluir: /higado|hamburguesa|pastel/, gramos: 80, escala: true },
      { rol: 'verdura', usos: ['salsa_base', 'hoja', 'aguacate'], nombre: /jitomate|lechuga|aguacate|col/, gramos: 50, opcional: true },
      { rol: 'cebolla', usos: ['sazon'], nombre: /cebolla|chile|jalapeno/, excluir: /polvo|ancho|pasilla/, gramos: 10, opcional: true },
    ],
    nombre: (p) => `Torta de ${displayName(p['proteina'])}`,
    pasos: (p) => [
      wash(p['verdura'], p['cebolla']),
      (p['proteina']?.usos ?? []).includes('queso_fresco') ? `Rebana ${displayName(p['proteina'])}.` : cookStep(p['proteina']),
      `Abre ${displayName(p['pan'])}, caliéntalo en el comal y rellena con la proteína${p['verdura'] ? ` y ${displayName(p['verdura'])}` : ''}${p['cebolla'] ? ` y ${displayName(p['cebolla'])}` : ''}.`,
      'Come enseguida.',
    ],
  },
];

export interface GeneratorContext {
  profile: GenProfile;
  foods: Alimento[];
}

/** Referencia orientativa del día: Mifflin × 1.2 ajustada al objetivo; null si no se calcula. */
export function dailyReference(p: GenProfile): number | null {
  if ((p.padecimientos ?? '').trim() || (p.medicamentos ?? '').trim()) return null;
  const base = mifflin(p);
  if (base === null) return null;
  const factor = p.intencion === 'bajar' ? 0.85 : p.intencion === 'subir' ? 1.1 : 1;
  return Math.min(3500, Math.max(1200, Math.round(base * 1.2 * factor)));
}
export function mealTarget(p: GenProfile, momento: Momento): number | null {
  const ref = dailyReference(p);
  return ref === null ? null : Math.round(ref * MEAL_SHARE[momento]);
}

function candidates(slot: Slot, pantry: Alimento[]): Alimento[] {
  return pantry.filter((f) => {
    const u = f.usos ?? [];
    if (!slot.usos.some((x) => u.includes(x))) return false;
    const n = nm(f);
    if (slot.nombre && !slot.nombre.test(n)) return false;
    if (slot.excluir && (slot.excluir.test(n) || u.some((x) => slot.excluir!.test(x)))) return false;
    return true;
  });
}

function* product(lists: Alimento[][], i = 0, acc: Alimento[] = []): Generator<Alimento[]> {
  if (i === lists.length) {
    yield acc;
    return;
  }
  for (const x of lists[i]) {
    if (acc.includes(x)) continue;
    yield* product(lists, i + 1, [...acc, x]);
  }
}

const round5 = (g: number) => Math.max(5, Math.round(g / 5) * 5);

function scale(recipe: Receta, scalable: Set<string>, foods: Alimento[], target: number | null): Receta {
  if (target === null) return recipe;
  const macros = computeRecipeMacros(recipe, foods);
  const fixed = computeRecipeMacros(
    { ...recipe, ingredientes: recipe.ingredientes.filter((i) => !scalable.has(i.alimento)) },
    foods,
  ).kcal;
  const variable = macros.kcal - fixed;
  if (variable <= 0) return recipe;
  const f = Math.min(1.6, Math.max(0.6, (target - fixed) / variable));
  return {
    ...recipe,
    ingredientes: recipe.ingredientes.map((i) => (scalable.has(i.alimento) ? { ...i, gramos: round5(i.gramos * f) } : i)),
  };
}

export interface GeneratedRecipe extends Receta {
  origen: 'ia-local';
  momentos: [Momento];
  plantilla: string;
}

/** Recetas nuevas, seguras y sin duplicados para un momento del día. */
export function generateRecipes(
  ctx: GeneratorContext,
  momento: Momento,
  opts: { perTemplate?: number; limits?: HealthLimits } = {},
): GeneratedRecipe[] {
  const perTemplate = opts.perTemplate ?? 8;
  const { profile, foods } = ctx;
  const byId = new Map(foods.map((f) => [f.id, f]));
  const pantry = profile.despensa.map((id) => byId.get(id)).filter((f): f is Alimento => Boolean(f));
  const limits = opts.limits ?? healthLimits(profile);
  const allergies = [...profile.alergias, ...limits.alergiasExtra];
  const target = mealTarget(profile, momento);
  const out: GeneratedRecipe[] = [];
  const seenSets = new Set<string>();
  const seenNames = new Set<string>();
  for (const t of PLANTILLAS) {
    if (!t.momentos.includes(momento)) continue;
    const required = t.slots.filter((s) => !s.opcional);
    const lists = required.map((s) => candidates(s, pantry));
    if (lists.some((l) => !l.length)) continue;
    let made = 0;
    let comboIndex = 0;
    for (const combo of product(lists)) {
     comboIndex++;
     for (const conOpcionales of [true, false]) {
      if (made >= perTemplate) break;
      const picked: Picked = {};
      required.forEach((s, i) => (picked[s.rol] = combo[i]));
      const used = new Set(combo.map((f) => f.id));
      if (conOpcionales)
        for (const s of t.slots.filter((x) => x.opcional)) {
          const opts2 = candidates(s, pantry).filter((f) => !used.has(f.id));
          // Varía el opcional con la combinación para que las recetas no se repitan.
          const choice = opts2.length ? opts2[comboIndex % opts2.length] : undefined;
          if (choice) {
            picked[s.rol] = choice;
            used.add(choice.id);
          }
        }
      const ingredientes = t.slots
        .filter((s) => picked[s.rol])
        .map((s) => ({ alimento: picked[s.rol]!.id, gramos: s.gramos }));
      const key = t.id + ':' + ingredientes.map((i) => i.alimento).sort().join('+');
      if (seenSets.has(key)) continue;
      const scalable = new Set(t.slots.filter((s) => s.escala && picked[s.rol]).map((s) => picked[s.rol]!.id));
      const usesMeat = ingredientes.some((i) => /carne|pescado|huevo|leguminosa|procesado/.test((byId.get(i.alimento)?.usos ?? []).join(' ')));
      let recipe: Receta = {
        id: `ia-${momento}-${t.id}-${ingredientes.map((i) => i.alimento.replace('usda-', '')).join('-')}`,
        nombre: t.nombre(picked),
        ingredientes,
        pasos: t.pasos(picked).filter(Boolean),
        source_ref: usesMeat ? [FOODSAFETY_STEPS, FOODSAFETY_TEMPS] : [FOODSAFETY_STEPS],
        origen: 'ia-local',
        momentos: [momento],
      };
      recipe = scale(recipe, scalable, foods, target);
      if (!recipeSafety(recipe, foods, allergies).segura) continue;
      if (!healthSafety(recipe, foods, profile, limits).segura) continue;
      if (seenNames.has(recipe.nombre)) continue;
      seenSets.add(key);
      seenNames.add(recipe.nombre);
      out.push({ ...recipe, origen: 'ia-local', momentos: [momento], plantilla: t.id });
      made++;
     }
     if (made >= perTemplate) break;
    }
  }
  return out;
}

export function generateAllRecipes(ctx: GeneratorContext): GeneratedRecipe[] {
  return MOMENTOS.flatMap((m) => generateRecipes(ctx, m));
}

export interface DayMeal {
  momento: Momento;
  etiqueta: string;
  receta: Receta | null;
  opciones: Receta[];
  macros: RecipeMacroSummary | null;
  metaKcal: number | null;
}
export interface DayPlan {
  fecha: string;
  comidas: DayMeal[];
  referenciaKcal: number | null;
  totalKcal: number;
}

function seed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Plan de un día con desayuno, comida y cena; rota opciones según la fecha y evita repetir plantilla. */
export function buildDayPlan(
  ctx: GeneratorContext & { curated?: Receta[] },
  fecha: string,
  generated = generateAllRecipes(ctx),
  choice: Partial<Record<Momento, number>> = {},
): DayPlan {
  const usedTemplates = new Set<string>();
  const comidas: DayMeal[] = MOMENTOS.map((m) => {
    const curated = (ctx.curated ?? []).filter((r) => (r.momentos ?? ['comida', 'cena']).includes(m));
    const propias = generated.filter((r) => r.momentos[0] === m);
    const opciones: Receta[] = [...propias, ...curated];
    let receta: Receta | null = null;
    if (opciones.length) {
      // Las generadas ya vienen ajustadas a la meta del momento; las curadas quedan como respaldo.
      const pool = propias.length ? propias.length : opciones.length;
      const start = (seed(fecha + m) + (choice[m] ?? 0)) % pool;
      for (let k = 0; k < opciones.length; k++) {
        const r = opciones[(start + k) % opciones.length];
        const tpl = (r as Partial<GeneratedRecipe>).plantilla ?? r.id;
        if (!usedTemplates.has(tpl) || k === opciones.length - 1) {
          receta = r;
          usedTemplates.add(tpl);
          break;
        }
      }
    }
    return {
      momento: m,
      etiqueta: MOMENTO_LABEL[m],
      receta,
      opciones,
      macros: receta ? computeRecipeMacros(receta, ctx.foods) : null,
      metaKcal: mealTarget(ctx.profile, m),
    };
  });
  return {
    fecha,
    comidas,
    referenciaKcal: dailyReference(ctx.profile),
    totalKcal: comidas.reduce((s, c) => s + (c.macros?.kcal ?? 0), 0),
  };
}
