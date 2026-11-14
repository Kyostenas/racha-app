import { formatNutrient, shortFoodName } from './presentation';
import { Component, OnInit, HostListener, computed, inject, signal, ElementRef, viewChild } from '@angular/core';
import { LiveAnnouncer, CdkTrapFocus } from '@angular/cdk/a11y';
import { FormsModule } from '@angular/forms';
import { z } from 'zod';
import {
  Ajustes,
  Alimento,
  Ejercicio,
  Perfil,
  Receta,
  Registro,
  Habito,
  defaultSettings,
  profileSchema,
  foodSchema,
  exerciseSchema,
  recipeSchema,
  settingsSchema,
  habitsSchema,
  recordsSchema,
  initialHabits,
  customThemeSchema,
  customThemesSchema,
  TemaPersonalizado,
  Momento,
} from './domain';
import { LocalStore, cambiosLocales } from './storage';
import { RespaldoService } from './cuenta/respaldo';
import { fechaRespaldo } from './cuenta/respaldo-programa';
import { Comunidad } from './comunidad/comunidad';
import { ComunidadApi, Evento, Reto } from './comunidad/api';
import { Cuenta } from './cuenta/cuenta';
import { CuentaApi } from './cuenta/api';
import { Sesion } from './cuenta/sesion';
import { SyncService } from './cuenta/sync';
import { comunidadSchema } from './comunidad/dominio';
import { Tokens, Palette, applyTheme, contrast, evaluateCustomContrast, tokensSchema } from './themes';
import { buildThemeExport, parseThemeImport, MAX_THEME_IMPORT_BYTES } from './theme-io';
import {
  MIFFLIN_SOURCE,
  localDate,
  dayBefore,
  mifflin,
  nutrition,
  selectRecipes,
  streak,
  validateAiSuggestion,
} from './engine';
import {
  analyzeHabits,
  analyzePantry,
  askLocalAi,
  BrowserBuiltInAiStatus,
  buildDailyBrief,
  computeRecipeMacros,
  detectBrowserBuiltInAi,
  enhanceWithDeviceModel,
  LocalAiAnswer,
  LocalAiContext,
  suggestLocalExercise,
  suggestLocalRecipe,
  polishRecipeWithDeviceModel,
} from './local-ai';
import {
  GENERATED_LABEL,
  MOMENTO_ICONO,
  MOMENTO_LABEL,
  MOMENTOS,
  buildDayPlan,
  generateAllRecipes,
} from './recipe-generator';
import { HEALTH_SOURCES, healthLimits, healthSafety } from './health-rules';

export interface ComunidadHoy {
  activa: boolean;
  retos: Reto[];
  eventos: Evento[];
  error: string;
}
export function textoEventoComunidad(ev: Pick<Evento, 'tipo' | 'reto' | 'valor'>): string {
  return ev.tipo === 'reto_completado' ? `completó el reto «${ev.reto ?? ''}»` : `llegó a ${ev.valor} días de racha`;
}

type Page = 'cuenta' | 'inicio' | 'primer-dia' | 'hoy' | 'plan' | 'progreso' | 'logro' | 'comunidad' | 'ajustes';
@Component({
  selector: 'app-root',
  imports: [FormsModule, CdkTrapFocus, Comunidad, Cuenta],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private db = inject(LocalStore);
  private comunidadApi = inject(ComunidadApi);
  private cuentaApi = inject(CuentaApi);
  private sesion = inject(Sesion);
  private sync = inject(SyncService);
  readonly respaldo = inject(RespaldoService);
  readonly fechaRespaldo = fechaRespaldo;
  readonly sesionActual = computed(() => this.sesion.actual());
  readonly restaurarConfirm = signal(false);
  respaldoContrasena = '';
  readonly explicacionRespaldo = computed(
    () =>
      'Al ser app web, se respalda al abrir Progressium (o mientras está abierta) si ya pasó la hora y hoy no se ha hecho' +
      (this.respaldo.segundoPlano() === 'activo'
        ? '; además, este navegador lo intenta en segundo plano.'
        : '; en Chrome con la app instalada también puede hacerse en segundo plano.'),
  );
  respaldoForm = { activo: false, hora: '21:00' };
  private live = inject(LiveAnnouncer);
  readonly servidor = signal(false);
  private lastFocus: HTMLElement | null = null;
  readonly createThemeBtn = viewChild<ElementRef<HTMLButtonElement>>('createThemeBtn');
  readonly deleteConfirm = signal<{ id: string; nombre: string } | null>(null);

  readonly page = signal<Page>('inicio');
  readonly step = signal(1);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly busy = signal(false);
  readonly profile = signal<Perfil | null>(null);
  readonly settings = signal<Ajustes>({ ...defaultSettings });
  readonly foods = signal<Alimento[]>([]);
  readonly recipes = signal<Receta[]>([]);
  readonly exercises = signal<Ejercicio[]>([]);
  readonly habits = signal<Habito[]>(initialHabits);
  readonly records = signal<Registro[]>([]);
  readonly selectedRecipe = signal('');
  /** Momento desde el que se abrió la receta (Hoy o Plan), para el ícono y la etiqueta del arte. */
  readonly selectedMomento = signal<Momento | null>(null);
  readonly resetConfirm = signal(false);
  readonly advanced = signal(false);
  readonly themeEditor = signal(false);
  customThemes = signal<TemaPersonalizado[]>([]);
  customName = '';
  editingThemeId: string | null = null;
  readonly palette = signal<Palette | null>(null);
  tokens: Tokens | null = null;
  readonly mifflinSource = MIFFLIN_SOURCE;
  today = localDate();
  readonly customFields = [
    'fondo',
    'primario',
    'acento',
    'urgente',
  ] satisfies (keyof typeof this.custom)[];
  selectedExercise = signal('Arm_Circles');
  readonly exercise = computed(
    () =>
      this.exercises().find((e) => e.id === this.selectedExercise()) ?? this.exercises()[0] ?? null,
  );
  readonly goals = [
    { id: 'bajar', nombre: 'Bajar de peso' },
    { id: 'mantener', nombre: 'Mantener mi peso' },
    { id: 'subir', nombre: 'Subir de peso' },
  ];
  readonly colorLabels = {
    fondo: 'Fondo',
    primario: 'Primario',
    acento: 'Acento',
    urgente: 'Urgente',
  };
  readonly inspectedFoodId = signal('');
  readonly inspectedFood = computed(
    () => this.foods().find((f) => f.id === this.inspectedFoodId()) ?? null,
  );
  readonly shortFoodName = shortFoodName;
  readonly themeNames = [
    { id: 'racha', nombre: 'Progressium' },
    { id: 'menta', nombre: 'Menta' },
    { id: 'electrico', nombre: 'Eléctrico' },
    { id: 'talavera', nombre: 'Talavera' },
    { id: 'aguacate', nombre: 'Aguacate' },
    { id: 'cempasuchil', nombre: 'Cempasúchil' },
    { id: 'jamaica', nombre: 'Jamaica' },
    { id: 'anil', nombre: 'Añil' },
    { id: 'copal', nombre: 'Copal' },
    { id: 'cacao', nombre: 'Cacao' },
    { id: 'altoContraste', nombre: 'Alto contraste' },
  ];
  form = {
    intencion: 'mantener',
    dormirMejor: true,
    edad: 21,
    estatura: 165,
    peso: 65,
    coeficiente: 'no-calcular',
    consentimiento: false,
    consentimientoSalud: false,
    alergias: '',
    padecimientos: '',
    medicamentos: '',
  };
  pantry: string[] = [];
  pantrySearch = '';
  custom = { fondo: '#FFF8EC', primario: '#FF5A1F', acento: '#FFD23F', urgente: '#FF4D4D' };
  aiForm = {
    base_url: 'https://api.openai.com/v1',
    modelo: '',
    clave: '',
    consentimientoIA: false,
  };
  readonly days = Array.from({ length: 42 }, (_, i) => {
    let d = localDate();
    for (let n = 0; n < 41 - i; n++) d = dayBefore(d);
    return d;
  });
  readonly streak = computed(() => streak(this.records(), this.today));
  readonly total = computed(() => this.records().filter((r) => r.hecho).length);
  readonly completed = computed(
    () => this.records().filter((r) => r.fecha === this.today && r.hecho).length,
  );
  /** Recetas nuevas armadas en el dispositivo con la despensa (desayuno, comida y cena). */
  readonly generated = computed(() => {
    const p = this.profile();
    return p && this.foods().length ? generateAllRecipes({ profile: p, foods: this.foods() }) : [];
  });
  /** Curadas que pasan alergias y reglas de salud. */
  readonly curatedSafe = computed(() => {
    const p = this.profile();
    if (!p) return [];
    const limits = healthLimits(p);
    return selectRecipes(this.recipes(), this.foods(), {
      alergias: [...p.alergias, ...limits.alergiasExtra],
      despensa: p.despensa,
    }).filter((r) => healthSafety(r, this.foods(), p, limits).segura);
  });
  readonly allRecipes = computed(() => [...this.recipes(), ...this.generated()]);
  readonly suggestions = computed(() => [...this.curatedSafe(), ...this.generated()]);
  readonly healthNotes = computed(() => {
    const p = this.profile();
    return p ? healthLimits(p) : null;
  });
  readonly healthSources = HEALTH_SOURCES;
  readonly generatedLabel = GENERATED_LABEL;
  readonly momentoLabel = MOMENTO_LABEL;
  readonly momentos = MOMENTOS;
  readonly momentoIcono = MOMENTO_ICONO;
  readonly planDayOffset = signal(0);
  readonly planChoices = signal<Record<string, number>>({});
  readonly planDate = computed(() => {
    const d = new Date(this.today + 'T12:00:00');
    d.setDate(d.getDate() + this.planDayOffset());
    return localDate(d);
  });
  readonly dayPlan = computed(() => {
    const p = this.profile();
    if (!p) return null;
    const date = this.planDate();
    const choices = this.planChoices();
    return buildDayPlan(
      { profile: p, foods: this.foods(), curated: this.curatedSafe() },
      date,
      this.generated(),
      {
        desayuno: choices[date + ':desayuno'] ?? 0,
        comida: choices[date + ':comida'] ?? 0,
        cena: choices[date + ':cena'] ?? 0,
      },
    );
  });
  readonly todayPlan = computed(() => {
    const p = this.profile();
    if (!p) return null;
    const choices = this.planChoices();
    return buildDayPlan({ profile: p, foods: this.foods(), curated: this.curatedSafe() }, this.today, this.generated(), {
      desayuno: choices[this.today + ':desayuno'] ?? 0,
      comida: choices[this.today + ':comida'] ?? 0,
      cena: choices[this.today + ':cena'] ?? 0,
    });
  });
  readonly comunidadHoy = signal<ComunidadHoy | null>(null);
  readonly textoEvento = textoEventoComunidad;
  readonly polished = signal<Record<string, Receta>>({});
  readonly recipe = computed(() => {
    const r =
      this.suggestions().find((x) => x.id === this.selectedRecipe()) ?? this.suggestions()[0] ?? null;
    return r ? (this.polished()[r.id] ?? r) : null;
  });
  readonly basal = computed(() => {
    const p = this.profile();
    return p && !p.padecimientos && !p.medicamentos ? mifflin(p) : null;
  });
  readonly browserAiStatus = signal<BrowserBuiltInAiStatus>('no-disponible');
  localAiQuestion = '';
  readonly localAiBusy = signal(false);
  readonly localAiAnswer = signal<LocalAiAnswer | null>(null);
  readonly localAiPromptChips = [
    '¿Qué cocino hoy?',
    '¿Qué me falta en la despensa?',
    '¿Qué ejercicio me conviene?',
    '¿Cómo va mi racha?',
  ];
  readonly habitInsights = computed(() =>
    analyzeHabits(this.habits(), this.records(), this.today, this.profile()),
  );
  readonly pantryInsights = computed(() => analyzePantry(this.localAiContext()));
  readonly localBrief = computed(() =>
    buildDailyBrief(this.localAiContext(), this.browserAiStatus()),
  );
  readonly selectedRecipeMacros = computed(() => {
    const r = this.recipe();
    return r ? computeRecipeMacros(r, this.foods()) : null;
  });
  async ngOnInit() {
    try {
      const fetchJson = async (path: string): Promise<unknown> => {
        const r = await fetch(new URL(path, document.baseURI));
        if (!r.ok)
          throw new Error('No se pudo cargar el catálogo. Conéctate una vez e intenta de nuevo.');
        return r.json();
      };
      const [tokens, foods, recipes, exercises, p, s, h, r] = await Promise.all([
        fetchJson('data/tokens.json'),
        fetchJson('data/alimentos.json'),
        fetchJson('data/recetas.json'),
        fetchJson('data/ejercicios.json'),
        this.db.get('perfil', 'local', profileSchema),
        this.db.get('ajustes', 'local', settingsSchema),
        this.db.all('hábitos', habitsSchema),
        this.db.all('registros', recordsSchema),
      ]);
      this.tokens = tokensSchema.parse(tokens);
      this.foods.set(z.array(foodSchema).parse(foods));
      this.recipes.set(z.array(recipeSchema).parse(recipes));
      this.exercises.set(z.array(exerciseSchema).parse(exercises));
      this.profile.set(p);
      this.settings.set(s ?? { ...defaultSettings });
      this.records.set(r);
      this.habits.set(h.length ? h : initialHabits);
      this.updateTheme();
      if (p) {
        this.pantry = [...p.despensa];
        await this.persistMigratedPantry(p);
        this.page.set('hoy');
        void this.cargarComunidadHoy();
      }
      if (s) {
        this.aiForm = {
          base_url: s.base_url,
          modelo: s.modelo,
          clave: s.clave,
          consentimientoIA: s.consentimientoIA,
        };
        if (s.personalizado) this.custom = { ...s.personalizado };
      }
      await this.loadCustomThemes();
      await this.prepararCuenta();
      void detectBrowserBuiltInAi().then((status) => this.browserAiStatus.set(status));
      this.ready.set(true);
    } catch (e) {
      this.announceError(e instanceof Error ? e.message : 'No pudimos abrir Progressium.');
    }
  }
  /** Si la despensa guardada tenía IDs crudo/cocido de v0.4.3, se guarda ya migrada (sin perder nada). */
  private async persistMigratedPantry(p: Perfil) {
    try {
      const raw = await this.db.get('perfil', 'local', z.object({ despensa: z.array(z.string()) }).passthrough());
      if (raw && JSON.stringify(raw.despensa) !== JSON.stringify(p.despensa)) await this.db.put('perfil', p);
    } catch {
      // Sin cambios: el perfil migrado sigue en memoria y se guardará con el siguiente cambio.
    }
  }
  async cargarComunidadHoy() {
    const vacio: ComunidadHoy = { activa: false, retos: [], eventos: [], error: '' };
    try {
      const local = await this.db.get('comunidad', 'local', comunidadSchema).catch(() => null);
      if (!local && !this.comunidadApi.conectado()) {
        this.comunidadHoy.set(vacio);
        return;
      }
      if (local) await this.comunidadApi.entrar(local.usuario, local.clave);
      const [r, f] = await Promise.all([this.comunidadApi.retos(), this.comunidadApi.feed()]);
      this.comunidadHoy.set({ activa: true, retos: r.retos, eventos: f.eventos.slice(0, 4), error: '' });
    } catch {
      const local = await this.db.get('comunidad', 'local', comunidadSchema).catch(() => null);
      this.comunidadHoy.set(
        local
          ? { ...vacio, activa: true, error: 'La comunidad no está disponible ahora. Tu app sigue funcionando.' }
          : vacio,
      );
    }
  }
  retosEnCurso() {
    return (this.comunidadHoy()?.retos ?? []).filter((r) => r.unido && !r.completado);
  }
  retosDisponibles() {
    return (this.comunidadHoy()?.retos ?? []).filter((r) => !r.unido);
  }
  verComida(momento: Momento, fromToday = false) {
    const plan = fromToday ? this.todayPlan() : this.dayPlan();
    const meal = plan?.comidas.find((c) => c.momento === momento);
    if (!meal?.receta) return;
    if (fromToday) this.planDayOffset.set(0);
    this.selectedRecipe.set(meal.receta.id);
    this.selectedMomento.set(momento);
    if (this.page() !== 'plan') this.navigate('plan');
    setTimeout(() => document.getElementById('receta-seleccionada')?.scrollIntoView({ block: 'start' }), 0);
  }
  otraOpcion(momento: Momento) {
    const key = this.planDate() + ':' + momento;
    this.planChoices.update((c) => ({ ...c, [key]: (c[key] ?? 0) + 1 }));
  }
  cambiarDia(delta: number) {
    this.planDayOffset.update((d) => Math.min(6, Math.max(0, d + delta)));
  }
  planDayLabel() {
    const o = this.planDayOffset();
    if (o === 0) return 'Hoy';
    if (o === 1) return 'Mañana';
    return new Date(this.planDate() + 'T12:00:00').toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }
  isGenerated(r: Receta | null | undefined) {
    return r?.origen === 'ia-local';
  }
  /**
   * Momento que ilustra el arte de la receta: el de la comida desde la que se abrió si la receta
   * le corresponde; si no, su momento principal (las curadas sin momento cuentan como comida y cena).
   */
  momentoDe(r: Receta): Momento {
    const momentos = r.momentos ?? ['comida', 'cena'];
    const elegido = this.selectedMomento();
    return elegido && momentos.includes(elegido) ? elegido : momentos[0];
  }
  recipesFor(momento: Momento) {
    return this.generated().filter((r) => r.momentos[0] === momento);
  }
  async redactarConModelo() {
    const r = this.recipe();
    if (!r || !this.isGenerated(r)) return;
    const done = await polishRecipeWithDeviceModel(r);
    if (done) {
      this.polished.update((x) => ({ ...x, [r.id]: done }));
      this.announceStatus('Redacción del modelo del navegador aplicada; ingredientes y cantidades sin cambios.');
    } else this.announceStatus('El modelo del navegador no está disponible o su redacción no pasó la validación.');
  }
  navigate(page: Page) {
    if (page === 'hoy' && this.profile()) void this.cargarComunidadHoy();
    this.page.set(page);
    this.error.set('');
    this.message.set('');
    window.scrollTo(0, 0);
  }
  healthConsentChanged(value: boolean) {
    this.form.consentimientoSalud = value;
    if (!value) {
      this.form.padecimientos = '';
      this.form.medicamentos = '';
    }
  }
  chooseIngredient(id: string) {
    this.inspectedFoodId.set(id);
    this.pantry = this.pantry.includes(id)
      ? this.pantry.filter((i) => i !== id)
      : [...this.pantry, id];
  }
  pantryChoices() {
    const plain = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const query = plain(this.pantrySearch.trim());
    return this.foods()
      .filter((f) => !query || plain(f.nombre).includes(query))
      .slice(0, 36);
  }
  ingredientName(id: string) {
    return this.foods().find((f) => f.id === id)?.nombre ?? id;
  }
  async next() {
    this.error.set('');
    if (this.step() === 1) {
      if (!this.form.consentimiento) {
        this.announceError('Acepta el uso local de tus datos para continuar.');
        return;
      }
      this.step.set(2);
      return;
    }
    if (this.step() === 2) {
      if (
        ![this.form.edad, this.form.estatura, this.form.peso].every(Number.isFinite) ||
        this.form.edad < 18 ||
        this.form.edad > 100 ||
        this.form.estatura < 100 ||
        this.form.estatura > 230 ||
        this.form.peso < 30 ||
        this.form.peso > 300
      ) {
        this.announceError(
          'Este prototipo es para adultos. Revisa edad (18–100), estatura (100–230 cm) y peso (30–300 kg).',
        );
        return;
      }
      this.step.set(3);
      return;
    }
    if (this.pantry.length < 3) {
      this.announceError('Elige al menos 3 ingredientes y revisa el consentimiento de salud.');
      return;
    }
    const result = profileSchema.safeParse({
      ...this.form,
      id: 'local',
      despensa: this.pantry,
      alergias: this.form.alergias
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      creado: new Date().toISOString(),
    });
    if (!result.success) {
      this.announceError('Elige al menos 3 ingredientes y revisa el consentimiento de salud.');
      return;
    }
    try {
      await this.db.put('perfil', result.data);
      for (const h of initialHabits) await this.db.put('hábitos', h);
      await this.db.put('ajustes', this.settings());
      this.profile.set(result.data);
      this.navigate('primer-dia');
    } catch {
      this.announceError('No pudimos guardar tus datos. No se completó el inicio.');
    }
  }
  done(id: string, date = this.today) {
    return this.records().some((r) => r.habito === id && r.fecha === date && r.hecho);
  }
  async toggleHabit(id: string) {
    this.today = localDate();
    const r: Registro = {
      id: this.today + ':' + id,
      fecha: this.today,
      habito: id,
      hecho: !this.done(id),
    };
    try {
      await this.db.put('registros', r);
      const records = [...this.records().filter((x) => x.id !== r.id), r];
      this.records.set(records);
      await this.db.put('rachas', {
        id: 'local',
        dias: streak(records, this.today),
        actualizado: this.today,
      });
      this.announceStatus(r.hecho ? 'Hábito marcado.' : 'Hábito desmarcado.');
    } catch {
      this.announceError('No pudimos guardar el hábito. Intenta otra vez.');
    }
  }
  countDay(date: string) {
    return this.records().filter((r) => r.fecha === date && r.hecho).length;
  }
  readonly formatNutrient = formatNutrient;
  energy(recipe: Receta) {
    return nutrition(recipe, this.foods());
  }
  updateTheme() {
    if (this.tokens) this.palette.set(applyTheme(this.tokens, this.settings()));
    const fuente = this.settings().fuenteLectura ?? 'inter';
    document.documentElement.dataset['fuente'] = fuente;
    if (this.settings().vistaSencilla) document.documentElement.setAttribute('data-vista-sencilla', '');
    else document.documentElement.removeAttribute('data-vista-sencilla');
  }
  async setVistaSencilla(on: boolean) {
    if (on) this.advanced.set(false);
    await this.saveSettings({ ...this.settings(), vistaSencilla: on });
    this.announceStatus(on ? 'Vista sencilla activada.' : 'Vista sencilla desactivada.');
  }
  async setFuenteLectura(fuente: 'inter' | 'sistema' | 'atkinson') {
    await this.saveSettings({ ...this.settings(), fuenteLectura: fuente });
    this.announceStatus('Fuente de lectura actualizada.');
  }
  async saveSettings(settings: Ajustes) {
    try {
      await this.db.put('ajustes', settings);
      this.settings.set(settings);
      this.updateTheme();
      return true;
    } catch {
      this.announceError('No pudimos guardar los ajustes.');
      this.updateTheme();
      return false;
    }
  }

  /** Atajo T: recorre predeterminados (11) y luego temas propios. */
  @HostListener('window:keydown', ['$event'])
  cycleThemeHotkey(event: KeyboardEvent) {
    if (event.key !== 't' && event.key !== 'T') return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable))
      return;
    event.preventDefault();
    const presetIds = this.themeNames.map((t) => t.id);
    const customIds = this.customThemes().map((t) => t.id);
    const order = [...presetIds, ...customIds];
    if (!order.length) return;
    const current = this.settings().tema;
    const idx = order.indexOf(current);
    const next = order[(idx + 1) % order.length] ?? order[0]!;
    if (customIds.includes(next)) void this.chooseCustomTheme(next);
    else this.chooseTheme(next);
  }

  chooseTheme(tema: string) {
    void this.saveSettings({ ...this.settings(), tema });
  }
  toggleOled() {
    void this.saveSettings({ ...this.settings(), oled: !this.settings().oled });
  }
  previewCustom() {
    const parsed = customThemeSchema.safeParse(this.custom);
    if (parsed.success && this.tokens)
      this.palette.set(
        applyTheme(this.tokens, {
          ...this.settings(),
          tema: 'personalizado',
          personalizado: parsed.data,
        }),
      );
  }

  async loadCustomThemes() {
    try {
      const list = await this.db.all('temasPersonalizados', customThemesSchema);
      const sorted = [...list].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id),
      );
      this.customThemes.set(sorted);
      await this.migrateLegacyCustomTheme();
    } catch {
      /* store nuevo o vacío */
      this.customThemes.set([]);
      await this.migrateLegacyCustomTheme();
    }
  }
  async migrateLegacyCustomTheme() {
    const s = this.settings();
    if (!s.personalizado) return;
    const existing = this.customThemes();
    if (existing.some((t) => t.id === 'custom:migrated-legacy')) return;
    if (existing.length > 0 && s.tema !== 'personalizado') return;
    const now = new Date().toISOString();
    const record: TemaPersonalizado = {
      id: 'custom:migrated-legacy',
      nombre: 'Mi tema',
      version: 1,
      colores: s.personalizado,
      creado: now,
      actualizado: now,
    };
    await this.db.put('temasPersonalizados', record);
    const next = [...existing.filter((t) => t.id !== record.id), record].sort(
      (a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id),
    );
    this.customThemes.set(next);
    if (s.tema === 'personalizado') {
      await this.saveSettings({ ...s, tema: record.id });
    }
  }
  async chooseCustomTheme(id: string) {
    const rec = this.customThemes().find((t) => t.id === id);
    if (!rec) return;
    await this.saveSettings({
      ...this.settings(),
      tema: id,
      personalizado: rec.colores,
    });
    this.announceStatus('Tema activado.');
  }
  async renameCustomTheme(id: string) {
    const name = this.customName.trim().slice(0, 40);
    if (!name) {
      this.announceError('Nombre del tema: 1 a 40 caracteres.');
      return;
    }
    const rec = this.customThemes().find((t) => t.id === id);
    if (!rec) return;
    const next = { ...rec, nombre: name, actualizado: new Date().toISOString() };
    await this.db.put('temasPersonalizados', next);
    this.customThemes.set(
      this.customThemes()
        .map((t) => (t.id === id ? next : t))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id)),
    );
    this.customName = '';
    this.announceStatus('Tema renombrado.');
  }
  async duplicateCustomTheme(id: string) {
    const rec = this.customThemes().find((t) => t.id === id);
    if (!rec) return;
    const now = new Date().toISOString();
    const copy: TemaPersonalizado = {
      id: 'custom:' + crypto.randomUUID(),
      nombre: ('Copia de ' + rec.nombre).slice(0, 40),
      version: 1,
      colores: { ...rec.colores },
      creado: now,
      actualizado: now,
    };
    await this.db.put('temasPersonalizados', copy);
    this.customThemes.set(
      [...this.customThemes(), copy].sort(
        (a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id),
      ),
    );
    this.announceStatus('Tema duplicado.');
  }
  askDeleteCustomTheme(id: string) {
    const rec = this.customThemes().find((t) => t.id === id);
    if (!rec) return;
    this.rememberFocus();
    this.deleteConfirm.set({ id: rec.id, nombre: rec.nombre });
  }
  cancelDeleteCustomTheme() {
    this.deleteConfirm.set(null);
    this.restoreFocus();
  }
  async confirmDeleteCustomTheme() {
    const pending = this.deleteConfirm();
    if (!pending) return;
    await this.db.delete('temasPersonalizados', pending.id);
    const rest = this.customThemes().filter((t) => t.id !== pending.id);
    this.customThemes.set(rest);
    if (this.settings().tema === pending.id) {
      await this.saveSettings({ ...this.settings(), tema: 'racha' });
    }
    this.deleteConfirm.set(null);
    this.announceStatus('Tema eliminado.');
    this.restoreFocus(this.createThemeBtn()?.nativeElement ?? null);
  }



  exportCustomThemes() {
    const payload = buildThemeExport(this.customThemes());
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = 'progressium-temas.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.announceStatus('Temas exportados en JSON local.');
  }
  async importCustomThemes(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    if (file.size > MAX_THEME_IMPORT_BYTES) {
      this.announceError('El archivo supera 256 KiB.');
      return;
    }
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      const result = parseThemeImport(raw, this.settings().oled);
      if (result.accepted.length === 0) {
        this.announceError(result.rejected[0] ?? 'Ningún tema válido para importar.');
        return;
      }
      const now = new Date().toISOString();
      const created = result.accepted.map((item) => ({
        id: 'custom:' + crypto.randomUUID(),
        nombre: item.nombre.slice(0, 40),
        version: 1 as const,
        colores: item.colores,
        creado: now,
        actualizado: now,
      }));
      for (const rec of created) await this.db.put('temasPersonalizados', rec);
      this.customThemes.set(
        [...this.customThemes(), ...created].sort(
          (a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id),
        ),
      );
      const warn = result.warnings.length
        ? ` (${result.warnings.length} con advertencia de contraste bajo).`
        : '';
      const extra = result.rejected.length
        ? ` Se descartaron ${result.rejected.length}.`
        : '';
      this.announceStatus(`Importados ${created.length} temas.${warn}${extra}`);
    } catch {
      this.announceError('No se pudo leer el JSON de temas.');
    }
  }

  private announceStatus(text: string) {
    this.message.set(text);
    void this.live.announce(text, 'polite');
  }
  private announceError(text: string) {
    this.error.set(text);
    void this.live.announce(text, 'assertive');
  }
  private rememberFocus() {
    const el = document.activeElement;
    this.lastFocus = el instanceof HTMLElement ? el : null;
  }
  private restoreFocus(fallback?: HTMLElement | null) {
    queueMicrotask(() => {
      const target = fallback ?? this.lastFocus ?? this.createThemeBtn()?.nativeElement ?? null;
      target?.focus();
      this.lastFocus = null;
    });
  }

  customContrast() {
    return this.contrastReport().minRatio;
  }
  contrastReport() {
    return evaluateCustomContrast(this.custom, this.settings().oled);
  }
  async saveCustom() {
    const result = customThemeSchema.safeParse(this.custom);
    if (!result.success) {
      this.announceError('Usa cuatro colores hexadecimales de seis cifras.');
      return;
    }
    const report = evaluateCustomContrast(result.data, this.settings().oled);
    const name = (this.customName.trim() || 'Mi tema').slice(0, 40);
    const now = new Date().toISOString();
    const id = this.editingThemeId ?? 'custom:' + crypto.randomUUID();
    const prev = this.customThemes().find((x) => x.id === id);
    const record: TemaPersonalizado = {
      id,
      nombre: name,
      version: 1,
      colores: result.data,
      creado: prev?.creado ?? now,
      actualizado: now,
    };
    await this.db.put('temasPersonalizados', record);
    this.customThemes.set(
      [...this.customThemes().filter((x) => x.id !== id), record].sort(
        (a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id),
      ),
    );
    if (
      !(await this.saveSettings({
        ...this.settings(),
        tema: id,
        personalizado: result.data,
      }))
    )
      return;
    this.themeEditor.set(false);
    this.editingThemeId = null;
    this.customName = '';
    this.announceStatus(
      report.ok ? 'Tema guardado.' : 'Tema guardado con advertencia de contraste bajo.',
    );
  }
  openThemeEditor(id: string | null = null, nombre = '', colores?: typeof this.custom) {
    this.rememberFocus();
    this.editingThemeId = id;
    this.customName = nombre;
    if (colores) this.custom = { ...colores };
    this.themeEditor.set(true);
    if (!colores) this.previewCustom();
    else this.previewCustom();
  }
  cancelCustom() {
    this.themeEditor.set(false);
    this.editingThemeId = null;
    this.customName = '';
    this.updateTheme();
    this.restoreFocus(this.createThemeBtn()?.nativeElement ?? null);
  }
  async savePantry() {
    const p = this.profile();
    if (!p) return;
    if (this.pantry.length < 3) {
      this.announceError('Conserva al menos 3 ingredientes.');
      return;
    }
    try {
      const next = { ...p, despensa: [...this.pantry] };
      await this.db.put('perfil', next);
      this.profile.set(next);
      this.announceStatus('Despensa actualizada.');
    } catch {
      this.announceError('No pudimos guardar la despensa.');
    }
  }
  private localAiContext(): LocalAiContext {
    return {
      profile: this.profile(),
      foods: this.foods(),
      recipes: this.suggestions(),
      exercises: this.exercises(),
      habits: this.habits(),
      records: this.records(),
      today: this.today,
      currentRecipeId: this.recipe()?.id,
      currentExerciseId: this.exercise()?.id,
    };
  }
  async askLocalAssistant(preset?: string) {
    const query = (preset ?? this.localAiQuestion).trim() || '¿Qué me sugieres hoy?';
    this.localAiQuestion = query;
    this.localAiBusy.set(true);
    try {
      const base = askLocalAi(query, this.localAiContext());
      if (this.browserAiStatus() === 'disponible') {
        const enhanced = await enhanceWithDeviceModel(query, base.reply);
        this.localAiAnswer.set({
          ...base,
          reply: enhanced.text,
          browserAiUsed: enhanced.usedModel,
        });
      } else {
        this.localAiAnswer.set(base);
      }
      this.announceStatus('Respuesta local lista.');
    } finally {
      this.localAiBusy.set(false);
    }
  }
  applyLocalAction(action: NonNullable<LocalAiAnswer['action']>) {
    if (action.type === 'select-recipe') {
      this.selectedRecipe.set(action.id);
      this.navigate('plan');
      this.announceStatus('Receta aplicada en tu plan.');
      return;
    }
    if (action.type === 'select-exercise') {
      this.selectedExercise.set(action.id);
      this.navigate('plan');
      this.announceStatus('Ejercicio seleccionado en tu plan.');
      return;
    }
    this.navigate(action.page);
  }
  suggestAnotherLocalRecipe() {
    const suggestion = suggestLocalRecipe(this.localAiContext(), true);
    if (!suggestion) return;
    this.selectedRecipe.set(suggestion.recipe.id);
    this.announceStatus(`Sugerencia local: ${suggestion.recipe.nombre}.`);
  }
  suggestLocalExerciseNow() {
    const suggestion = suggestLocalExercise(this.localAiContext(), true);
    if (!suggestion) return;
    this.selectedExercise.set(suggestion.exercise.id);
    this.announceStatus(`Ejercicio local: ${suggestion.exercise.nombre}.`);
  }
  async setAi(mode: 'apagada' | 'local' | 'propia') {
    if (mode === 'apagada' || mode === 'local') {
      if (
        !(await this.saveSettings({
          ...this.settings(),
          ia: mode,
          clave: '',
          consentimientoIA: false,
        }))
      )
        return;
      this.aiForm.clave = '';
      this.aiForm.consentimientoIA = false;
      this.announceStatus(
        mode === 'local'
          ? 'IA local activada en tu dispositivo.'
          : 'IA apagada. Clave eliminada del dispositivo.',
      );
      return;
    }
    try {
      const url = new URL(this.aiForm.base_url);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
        throw new Error();
      if (!this.aiForm.modelo.trim() || !this.aiForm.clave.trim() || !this.aiForm.consentimientoIA)
        throw new Error();
      if (
        !(await this.saveSettings({
          ...this.settings(),
          ...this.aiForm,
          base_url: url.href.replace(/\/$/, ''),
          ia: 'propia',
        }))
      )
        return;
      this.announceStatus('Configuración guardada solo en este dispositivo.');
    } catch {
      this.announceError(
        'Revisa la dirección del servicio, el modelo, la clave y el permiso para continuar.',
      );
    }
  }
  async suggestAi() {
    const s = this.settings(),
      p = this.profile();
    if (s.ia !== 'propia' || !s.consentimientoIA || !p || !this.suggestions().length) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const response = await fetch(s.base_url.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.clave },
        body: JSON.stringify({
          model: s.modelo,
          messages: [
            {
              role: 'system',
              content:
                'Devuelve solo JSON {"receta_id":"id"}. Elige un id de la lista permitida; no añadas ingredientes ni texto.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                recetas_permitidas: this.suggestions().map((r) => ({ id: r.id, nombre: r.nombre })),
              }),
            },
          ],
          temperature: 0,
        }),
        signal: AbortSignal.timeout(20000),
        credentials: 'omit',
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Proveedor no disponible');
      const raw: unknown = await response.json();
      const recipe = validateAiSuggestion(raw, this.allRecipes(), this.foods(), p);
      this.selectedRecipe.set(recipe.id);
      this.announceStatus('Sugerencia validada otra vez: solo una receta permitida de tu despensa.');
    } catch {
      this.announceError(
        'No se pudo validar la respuesta. Tu plan sin IA sigue disponible. Revisa tu servicio en Detalles.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  async shareAchievement() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error();
      await document.fonts.ready;
      ctx.fillStyle = this.palette()?.primario ?? '#FF5A1F';
      ctx.fillRect(0, 0, 1080, 1080);
      ctx.fillStyle = this.palette()?.sobrePrimario ?? '#000000';
      ctx.font = '700 64px "Space Grotesk"';
      ctx.fillText('PROGRESSIUM', 64, 120);
      ctx.font = '700 420px "Space Grotesk"';
      ctx.fillText(String(this.streak()), 54, 620);
      ctx.font = '700 64px "Space Grotesk"';
      ctx.fillText('DÍAS DE RACHA', 64, 750);
      ctx.font = '400 36px Inter';
      // lema eliminado por accesibilidad/copy
      ctx.lineWidth = 12;
      ctx.strokeStyle = this.palette()?.sobrePrimario ?? '#000000';
      ctx.strokeRect(30, 30, 1020, 1020);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error())), 'image/png'),
      );
      const file = new File([blob], 'progressium-logro.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Mi logro Progressium' });
      } else {
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = 'progressium-logro.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.announceStatus('Tarjeta descargada.');
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        this.announceError('No pudimos crear la tarjeta. Inténtalo otra vez.');
    }
  }
  async reset() {
    try {
      // «Borrar todo» borra la cuenta (respaldo cifrado y comunidad) en el servidor, si hay sesión.
      try {
        if (this.sesion.token()) await this.cuentaApi.borrarCuenta();
        else {
          const comunidad = await this.db.get('comunidad', 'local', comunidadSchema).catch(() => null);
          if (comunidad) {
            await this.comunidadApi.entrar(comunidad.usuario, comunidad.clave);
            await this.comunidadApi.borrarCuenta();
          }
        }
      } catch {
        // Sin conexión: la cuenta se borra sola tras 180 días sin uso.
      }
      this.comunidadApi.salir();
      this.sync.olvidarLlave();
      await this.sesion.borrar();
      await this.db.clear();
      this.restaurarConfirm.set(false);
      await this.cargarRespaldo();
      if (!this.ready()) {
        window.location.reload();
        return;
      }
      this.profile.set(null);
      this.records.set([]);
      this.settings.set({ ...defaultSettings });
      this.aiForm = {
        base_url: defaultSettings.base_url,
        modelo: '',
        clave: '',
        consentimientoIA: false,
      };
      this.pantry = [];
      this.pantrySearch = '';
      this.inspectedFoodId.set('');
      this.advanced.set(false);
      this.themeEditor.set(false);
      this.localAiAnswer.set(null);
      this.localAiQuestion = '';
      this.form = {
        intencion: 'mantener',
        dormirMejor: true,
        edad: 21,
        estatura: 165,
        peso: 65,
        coeficiente: 'no-calcular',
        consentimiento: false,
        consentimientoSalud: false,
        alergias: '',
        padecimientos: '',
        medicamentos: '',
      };
      this.step.set(1);
      this.resetConfirm.set(false);
      this.updateTheme();
      await this.probarServidor();
      this.navigate(this.servidor() ? 'cuenta' : 'inicio');
      this.announceStatus('Datos y clave eliminados de este dispositivo.');
    } catch {
      this.announceError('No pudimos borrar los datos. Intenta otra vez.');
    }
  }
  private async probarServidor(): Promise<boolean> {
    try {
      await this.cuentaApi.estado();
      this.servidor.set(true);
      return true;
    } catch {
      this.servidor.set(false);
      return false;
    }
  }
  private async prepararCuenta() {
    const c = await this.sesion.cargar();
    if (c?.token) this.comunidadApi.usarToken(c.token);
    if (c) await this.sync.cargarLlave();
    await this.cargarRespaldo();
    await this.probarServidor();
    cambiosLocales.addEventListener('cambio', () => { void this.sync.marcarSucio(); });
    window.addEventListener('online', () => { void this.alVolverEnLinea(); });
    if (this.servidor() && !c) {
      this.page.set('cuenta');
      return;
    }
    if (c && this.servidor()) await this.intentarSync();
    if (c) void this.respaldo.iniciar();
  }
  private async cargarRespaldo() {
    const cfg = await this.respaldo.cargar();
    this.respaldoForm = { activo: cfg.activo, hora: cfg.hora };
  }
  irACuenta() {
    this.navigate('cuenta');
  }
  async respaldarAhora() {
    if (await this.respaldo.respaldarAhora('manual')) this.announceStatus('Respaldo cifrado guardado en el servidor.');
    else this.announceError(this.respaldo.estado().mensaje || 'No pudimos respaldar.');
  }
  async guardarProgramaRespaldo() {
    try {
      await this.respaldo.programar(this.respaldoForm.activo, this.respaldoForm.hora);
      this.announceStatus(
        this.respaldoForm.activo
          ? `Respaldo diario programado a las ${this.respaldoForm.hora}.`
          : 'Respaldo diario apagado.',
      );
      await this.respaldo.revisarPendiente();
    } catch {
      this.announceError('Elige una hora válida (HH:MM).');
    }
  }
  async desbloquearRespaldo() {
    try {
      await this.respaldo.desbloquear(this.respaldoContrasena);
      this.respaldoContrasena = '';
      this.announceStatus('Respaldo activado en este dispositivo.');
      void this.respaldo.iniciar();
    } catch (e) {
      this.announceError(e instanceof Error ? e.message : 'No pudimos activar el respaldo.');
    }
  }
  async restaurarRespaldo() {
    this.restaurarConfirm.set(false);
    try {
      const fecha = await this.respaldo.restaurar();
      await this.alIniciarSesion();
      this.navigate('ajustes');
      this.announceStatus(`Datos restaurados del respaldo del ${fechaRespaldo(fecha.replace(' ', 'T'))}.`);
    } catch (e) {
      this.announceError(e instanceof Error ? e.message : 'No pudimos restaurar el respaldo.');
    }
  }
  private async alVolverEnLinea() {
    await this.probarServidor();
    void this.intentarSync();
  }
  async alIniciarSesion() {
    await this.cargarRespaldo();
    void this.respaldo.iniciar();
    const [p, s, h, r] = await Promise.all([
      this.db.get('perfil', 'local', profileSchema),
      this.db.get('ajustes', 'local', settingsSchema),
      this.db.all('hábitos', habitsSchema),
      this.db.all('registros', recordsSchema),
    ]);
    this.profile.set(p);
    this.settings.set(s ?? { ...defaultSettings });
    this.habits.set(h.length ? h : initialHabits);
    this.records.set(r);
    if (p) {
      this.pantry = [...p.despensa];
      await this.persistMigratedPantry(p);
    }
    this.updateTheme();
    this.navigate(p ? 'hoy' : 'inicio');
  }
  private async intentarSync() {
    try {
      const r = await this.sync.sincronizar();
      if (r === 'bajado') await this.alIniciarSesion();
    } catch {
      // Sin llave en memoria (recarga) o red: se sincroniza al volver a iniciar sesión.
    }
  }
}
