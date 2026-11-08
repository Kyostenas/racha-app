import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
} from './domain';
import { LocalStore } from './storage';
import { Tokens, Palette, applyTheme, contrast, tokensSchema } from './themes';
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
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private db = inject(LocalStore);
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
  readonly themeNames = [
    { id: 'racha', nombre: 'Racha' },
    { id: 'menta', nombre: 'Menta' },
    { id: 'electrico', nombre: 'Eléctrico' },
    { id: 'talavera', nombre: 'Talavera' },
    { id: 'aguacate', nombre: 'Aguacate' },
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
      this.ready.set(true);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos abrir Racha.');
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
    this.pantry = this.pantry.includes(id)
      ? this.pantry.filter((i) => i !== id)
      : [...this.pantry, id];
  }
  pantryChoices() {
    const q = this.pantrySearch
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return this.foods()
      .filter(
        (f) =>
          !q ||
          f.nombre
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .includes(q),
      )
      .slice(0, 36);
  }
  ingredientName(id: string) {
    return this.foods().find((f) => f.id === id)?.nombre ?? id;
  }
  async next() {
    this.error.set('');
    if (this.step() === 1) {
      if (!this.form.consentimiento) {
        this.error.set('Acepta el uso local de tus datos para continuar.');
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
        this.error.set(
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
      this.error.set('Elige al menos 3 ingredientes y revisa el consentimiento de salud.');
      return;
    }
    try {
      await this.db.put('perfil', result.data);
      for (const h of initialHabits) await this.db.put('hábitos', h);
      await this.db.put('ajustes', this.settings());
      this.profile.set(result.data);
      this.navigate('primer-dia');
    } catch {
      this.error.set('No pudimos guardar tus datos. No se completó el inicio.');
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
      this.message.set(
        r.hecho ? 'Un paso cuenta. Bien por ti.' : 'Registro actualizado. Sin regaños.',
      );
    } catch {
      this.error.set('No pudimos guardar el hábito. Intenta otra vez.');
    }
  }
  countDay(date: string) {
    return this.records().filter((r) => r.fecha === date && r.hecho).length;
  }
  formatNutrient(value: number | null | undefined) {
    return value === null || value === undefined ? 'sin dato' : value + ' g';
  }
  energy(recipe: Receta) {
    return nutrition(recipe, this.foods());
  }
  updateTheme() {
    if (this.tokens) this.palette.set(applyTheme(this.tokens, this.settings()));
  }
  async saveSettings(settings: Ajustes) {
    try {
      await this.db.put('ajustes', settings);
      this.settings.set(settings);
      this.updateTheme();
      return true;
    } catch {
      this.error.set('No pudimos guardar los ajustes.');
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
  customContrast() {
    const p = this.palette();
    return p ? Math.min(contrast(p.texto, p.fondo), contrast(p.sobrePrimario, p.primario)) : 0;
  }
  async saveCustom() {
    const result = customThemeSchema.safeParse(this.custom);
    if (!result.success) {
      this.error.set('Usa cuatro colores hexadecimales de seis cifras.');
      return;
    }
    if (
      !(await this.saveSettings({
        ...this.settings(),
        tema: 'personalizado',
        personalizado: result.data,
      }))
    )
      return;
    this.themeEditor.set(false);
    this.message.set('Tu tema está guardado.');
  }
  cancelCustom() {
    this.themeEditor.set(false);
    this.updateTheme();
  }
  async savePantry() {
    const p = this.profile();
    if (!p) return;
    if (this.pantry.length < 3) {
      this.error.set('Conserva al menos 3 ingredientes.');
      return;
    }
    try {
      const next = { ...p, despensa: [...this.pantry] };
      await this.db.put('perfil', next);
      this.profile.set(next);
      this.message.set('Despensa actualizada.');
    } catch {
      this.error.set('No pudimos guardar la despensa.');
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
      this.message.set('IA apagada. Clave eliminada del dispositivo.');
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
      this.message.set('Configuración guardada solo en este dispositivo.');
    } catch {
      this.error.set('Necesitas URL HTTPS sin credenciales, modelo, clave y consentimiento.');
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
      this.message.set('Sugerencia validada otra vez: solo una receta curada de tu despensa.');
    } catch {
      this.error.set(
        'No se pudo validar la respuesta o el proveedor bloqueó CORS. Tu plan sin IA sigue disponible.',
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
      ctx.fillText('RACHA / PASO A PASO', 64, 120);
      ctx.font = '700 420px "Space Grotesk"';
      ctx.fillText(String(this.streak()), 54, 620);
      ctx.font = '700 64px "Space Grotesk"';
      ctx.fillText('DÍAS DE CONSTANCIA', 64, 750);
      ctx.font = '400 36px Inter';
      ctx.fillText('Cada cuadrito cuenta. Hoy elegí cuidarme.', 64, 880);
      ctx.lineWidth = 12;
      ctx.strokeStyle = this.palette()?.sobrePrimario ?? '#000000';
      ctx.strokeRect(30, 30, 1020, 1020);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error())), 'image/png'),
      );
      const file = new File([blob], 'racha-logro.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Mi logro Racha' });
      } else {
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = 'racha-logro.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.message.set('Tarjeta descargada. Tú decides dónde compartirla.');
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        this.error.set('No pudimos crear la tarjeta. Inténtalo otra vez.');
    }
  }
  async reset() {
    try {
      await this.db.clear();
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
      this.message.set('Datos y clave eliminados de este dispositivo.');
    } catch {
      this.error.set('No pudimos borrar los datos. Intenta otra vez.');
    }
  }
}
