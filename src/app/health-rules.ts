import { Alimento, Perfil, Receta } from './domain';
import { normalize } from './engine';

/**
 * Reglas conservadoras para recetas generadas cuando el perfil declara padecimientos o medicamentos.
 * No son tratamiento ni dieta clínica: solo descartan combinaciones con riesgo conocido.
 */
export const HEALTH_SOURCES = [
  'https://www.who.int/news-room/fact-sheets/detail/salt-reduction',
  'https://www.fda.gov/consumers/consumer-updates/grapefruit-juice-and-some-drugs-dont-mix',
  'https://medlineplus.gov/ency/patientinstructions/000292.htm',
  'https://medlineplus.gov/druginfo/meds/a682085.html',
  'https://www.niddk.nih.gov/health-information/diabetes/overview/diet-eating-physical-activity',
] as const;

export interface HealthLimits {
  maxAzucares: number | null;
  maxSodio: number | null;
  maxGrasa: number | null;
  maxProteina: number | null;
  maxHojasGramos: number | null;
  maxSodioPorAlimento: number | null;
  excluirUsos: Set<string>;
  excluirNombres: RegExp[];
  alergiasExtra: string[];
  motivos: string[];
  sinReconocer: boolean;
}

const min = (a: number | null, b: number) => (a === null ? b : Math.min(a, b));

export function healthLimits(p: Pick<Perfil, 'padecimientos' | 'medicamentos'>): HealthLimits {
  const pad = normalize(p.padecimientos ?? '');
  const med = normalize(p.medicamentos ?? '');
  const l: HealthLimits = {
    maxAzucares: null,
    maxSodio: null,
    maxGrasa: null,
    maxProteina: null,
    maxHojasGramos: null,
    maxSodioPorAlimento: null,
    excluirUsos: new Set(),
    excluirNombres: [],
    alergiasExtra: [],
    motivos: [],
    sinReconocer: false,
  };
  let reconocido = false;
  const diabetes = () => {
    l.maxAzucares = min(l.maxAzucares, 15);
    l.excluirUsos.add('endulzante').add('fruta_seca');
    l.excluirNombres.push(/horchata|jugo/);
    l.motivos.push('diabetes: sin azúcares añadidos y máx. 15 g de azúcares por porción');
  };
  const presion = () => {
    l.maxSodio = min(l.maxSodio, 600);
    l.maxSodioPorAlimento = min(l.maxSodioPorAlimento, 800);
    l.excluirUsos.add('procesado');
    l.motivos.push('presión alta: máx. 600 mg de sodio por porción y sin embutidos');
  };
  if (/diabet|glucosa|insulin|prediabet/.test(pad)) {
    reconocido = true;
    diabetes();
  }
  if (/hipertens|presion alta|presion arterial/.test(pad)) {
    reconocido = true;
    presion();
  }
  if (/renal|rinon|nefro/.test(pad)) {
    reconocido = true;
    l.maxProteina = min(l.maxProteina, 20);
    l.maxSodio = min(l.maxSodio, 500);
    l.excluirUsos.add('procesado');
    l.motivos.push('enfermedad renal: máx. 20 g de proteína y 500 mg de sodio por porción');
  }
  if (/colesterol|triglicer|dislipid/.test(pad)) {
    reconocido = true;
    l.maxGrasa = min(l.maxGrasa, 20);
    l.excluirUsos.add('procesado');
    l.excluirNombres.push(/manteca|tocino|chicharr/);
    l.motivos.push('colesterol o triglicéridos: máx. 20 g de grasa y sin manteca ni embutidos');
  }
  if (/celiac|celiaqu|gluten/.test(pad)) {
    reconocido = true;
    l.alergiasExtra.push('trigo');
    l.motivos.push('celiaquía: sin trigo');
  }
  if (/lactosa/.test(pad)) {
    reconocido = true;
    l.alergiasExtra.push('leche');
    l.motivos.push('intolerancia a la lactosa: sin lácteos');
  }
  if (/gota|acido urico/.test(pad)) {
    reconocido = true;
    l.excluirNombres.push(/higado|sardina|camaron|jaiba|pulpo/);
    l.motivos.push('gota: sin vísceras, sardina ni mariscos');
  }
  if (/embaraz/.test(pad)) {
    reconocido = true;
    l.excluirNombres.push(/higado/);
    l.motivos.push('embarazo: sin hígado');
  }
  if (/metformina|insulina|glibenclamida|sitagliptina|dapagliflozina|empagliflozina|glimepirida/.test(med)) {
    reconocido = true;
    diabetes();
  }
  if (/losartan|enalapril|captopril|lisinopril|valsartan|telmisartan|hidroclorotiazida|clortalidona|amlodipino/.test(med)) {
    reconocido = true;
    presion();
  }
  if (/warfarina|acenocumarol|sintrom|coumadin/.test(med)) {
    reconocido = true;
    l.maxHojasGramos = 60;
    l.motivos.push('anticoagulante: verduras de hoja en cantidad moderada y constante (vitamina K)');
  }
  if (/fenelzina|tranilcipromina|isocarboxazida|selegilina|rasagilina|linezolid|imao/.test(med)) {
    reconocido = true;
    l.excluirUsos.add('queso_madurado').add('procesado');
    l.motivos.push('IMAO: sin quesos madurados ni embutidos (tiramina)');
  }
  if (/atorvastatina|simvastatina|lovastatina|estatina|felodipino|nifedipino|ciclosporina|tacrolimus|buspirona|amiodarona|fexofenadina/.test(med)) {
    reconocido = true;
    l.excluirNombres.push(/toronja/);
    l.motivos.push('medicamento que interactúa con la toronja: sin toronja');
  }
  if (/ciprofloxacino|levofloxacino|moxifloxacino|tetraciclina|doxiciclina/.test(med)) {
    reconocido = true;
    l.excluirUsos.add('lacteo').add('queso');
    l.motivos.push('antibiótico que se une al calcio: sin lácteos en la misma comida');
  }
  const declarado = Boolean(pad || med);
  if (declarado && !reconocido) {
    // No reconocemos el texto: aplicamos un filtro prudente en vez de ignorarlo.
    l.sinReconocer = true;
    l.maxSodio = min(l.maxSodio, 600);
    l.maxAzucares = min(l.maxAzucares, 15);
    l.maxGrasa = min(l.maxGrasa, 25);
    l.excluirUsos.add('procesado').add('endulzante');
    l.excluirNombres.push(/toronja/);
    l.motivos.push('padecimiento o medicamento no reconocido: filtro prudente de sodio, azúcar y grasa');
  }
  return l;
}

const HOJAS = /espinaca|acelga|col rizada|berza|berro|quelite|verdolaga|lechuga|col /;

export function healthSafety(
  recipe: Receta,
  foods: Alimento[],
  p: Pick<Perfil, 'padecimientos' | 'medicamentos'>,
  limits = healthLimits(p),
): { segura: boolean; motivo: string } {
  if (!limits.motivos.length) return { segura: true, motivo: 'Sin padecimientos ni medicamentos declarados.' };
  const byId = new Map(foods.map((f) => [f.id, f]));
  let azucares = 0,
    sodio = 0,
    grasa = 0,
    proteina = 0,
    hojas = 0;
  for (const i of recipe.ingredientes) {
    const f = byId.get(i.alimento);
    if (!f) return { segura: false, motivo: 'Falta información del ingrediente.' };
    const name = normalize(f.nombre);
    if ((f.usos ?? []).some((u) => limits.excluirUsos.has(u)) || limits.excluirNombres.some((r) => r.test(name)))
      return { segura: false, motivo: `Excluida por tu perfil de salud (${f.nombre}).` };
    if (limits.maxSodioPorAlimento !== null && (f.sodio_mg100g ?? 0) > limits.maxSodioPorAlimento)
      return { segura: false, motivo: `Excluida por sodio alto (${f.nombre}).` };
    const k = i.gramos / 100;
    if ((limits.maxAzucares !== null && f.azucares100g == null && (f.usos ?? []).includes('fruta')) ||
        (limits.maxSodio !== null && f.sodio_mg100g == null))
      return { segura: false, motivo: `Sin dato suficiente para validar ${f.nombre}.` };
    azucares += (f.azucares100g ?? 0) * k;
    sodio += (f.sodio_mg100g ?? 0) * k;
    grasa += (f.grasa100g ?? 0) * k;
    proteina += (f.proteina100g ?? 0) * k;
    if (HOJAS.test(name)) hojas += i.gramos;
  }
  if (limits.maxAzucares !== null && azucares > limits.maxAzucares) return { segura: false, motivo: 'Excede azúcares para tu perfil.' };
  if (limits.maxSodio !== null && sodio > limits.maxSodio) return { segura: false, motivo: 'Excede sodio para tu perfil.' };
  if (limits.maxGrasa !== null && grasa > limits.maxGrasa) return { segura: false, motivo: 'Excede grasa para tu perfil.' };
  if (limits.maxProteina !== null && proteina > limits.maxProteina) return { segura: false, motivo: 'Excede proteína para tu perfil.' };
  if (limits.maxHojasGramos !== null && hojas > limits.maxHojasGramos)
    return { segura: false, motivo: 'Demasiadas verduras de hoja para tu medicamento.' };
  return { segura: true, motivo: `Revisada contra: ${limits.motivos.join('; ')}.` };
}
