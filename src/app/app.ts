import { formatNutrient, shortFoodName } from './presentation';
import { Component, OnInit, computed, inject, signal, ElementRef, viewChild } from '@angular/core';
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
} from './domain';
import { LocalStore } from './storage';
import { Tokens, Palette, applyTheme, contrast, evaluateCustomContrast, tokensSchema } from './themes';
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

type Page = 'inicio' | 'primer-dia' | 'hoy' | 'plan' | 'progreso' | 'logro' | 'ajustes';
@Component({
  selector: 'app-root',
  imports: [FormsModule, CdkTrapFocus],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private db = inject(LocalStore);
  private live = inject(LiveAnnouncer);
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
    { id: 'racha', nombre: 'Progresium' },
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
  readonly suggestions = computed(() => {
    const p = this.profile();
    return p ? selectRecipes(this.recipes(), this.foods(), p) : [];
  });
  readonly recipe = computed(
    () =>
      this.suggestions().find((r) => r.id === this.selectedRecipe()) ??
      this.suggestions()[0] ??
      null,
  );
  readonly basal = computed(() => {
    const p = this.profile();
    return p && !p.padecimientos && !p.medicamentos ? mifflin(p) : null;
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
        this.page.set('hoy');
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
      this.ready.set(true);
    } catch (e) {
      this.announceError(e instanceof Error ? e.message : 'No pudimos abrir Progresium.');
    }
  }
  navigate(page: Page) {
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


  private announceStatus(text: string) {
    this.message.set(text);
    void this.live.announce(text, 'polite');
  }
  private announceError(text: string) {
    this.announceError(text);
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
    if (!report.ok) {
      this.announceError(report.failures[0] ?? 'Contraste insuficiente.');
      return;
    }
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
    this.announceStatus('Tema guardado.');
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
  async setAi(mode: 'apagada' | 'propia') {
    if (mode === 'apagada') {
      if (
        !(await this.saveSettings({
          ...this.settings(),
          ia: 'apagada',
          clave: '',
          consentimientoIA: false,
        }))
      )
        return;
      this.aiForm.clave = '';
      this.aiForm.consentimientoIA = false;
      this.announceStatus('IA apagada. Clave eliminada del dispositivo.');
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
      const recipe = validateAiSuggestion(raw, this.recipes(), this.foods(), p);
      this.selectedRecipe.set(recipe.id);
      this.announceStatus('Sugerencia validada otra vez: solo una receta curada de tu despensa.');
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
      ctx.fillText('PROGRESIUM', 64, 120);
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
      const file = new File([blob], 'progresium-logro.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Mi logro Progresium' });
      } else {
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = 'progresium-logro.png';
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
      await this.db.clear();
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
      this.navigate('inicio');
      this.announceStatus('Datos y clave eliminados de este dispositivo.');
    } catch {
      this.announceError('No pudimos borrar los datos. Intenta otra vez.');
    }
  }
}
