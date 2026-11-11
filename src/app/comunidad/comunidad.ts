import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import type { Ejercicio, Perfil, Registro } from '../domain';
import { LocalStore } from '../storage';
import { ApiError, Comparacion, ComunidadApi, Conexion, Evento, Match, Progreso, Reto } from './api';
import {
  ComunidadLocal,
  DIETAS,
  INTERRUPTORES,
  Visibles,
  VERSION_AVISO,
  cambioPesoPct,
  claveAleatoria,
  comunidadSchema,
  edadRango,
  estaturaRango,
  imcCategoria,
  pctHabitosSemana,
  perfilPublico,
  semanaISO,
  todoApagado,
} from './dominio';

const MOTIVOS = [
  { id: 'alias_ofensivo', nombre: 'Alias ofensivo' },
  { id: 'spam', nombre: 'Spam' },
  { id: 'acoso', nombre: 'Acoso' },
  { id: 'suplantacion', nombre: 'Suplantación' },
  { id: 'otro', nombre: 'Otro' },
];
const REACCIONES = [
  { id: 'aplauso', icono: '👏', nombre: 'Aplauso' },
  { id: 'fuerza', icono: '💪', nombre: 'Fuerza' },
  { id: 'fuego', icono: '🔥', nombre: 'Fuego' },
];

@Component({
  selector: 'app-comunidad',
  imports: [FormsModule],
  templateUrl: './comunidad.html',
})
export class Comunidad implements OnInit {
  private db = inject(LocalStore);
  private api = inject(ComunidadApi);
  private live = inject(LiveAnnouncer);

  readonly perfil = input.required<Perfil>();
  readonly registros = input.required<Registro[]>();
  readonly racha = input.required<number>();
  readonly habitos = input.required<number>();
  readonly ejercicios = input.required<Ejercicio[]>();
  readonly hoy = input.required<string>();

  readonly interruptores = INTERRUPTORES;
  readonly dietas = DIETAS;
  readonly motivos = MOTIVOS;
  readonly reacciones = REACCIONES;
  readonly versionAviso = VERSION_AVISO;

  readonly cargando = signal(true);
  readonly ocupado = signal(false);
  readonly error = signal('');
  readonly aviso = signal('');
  readonly local = signal<ComunidadLocal | null>(null);
  readonly oculto = signal(false);
  readonly visibles = signal<Visibles>(todoApagado());
  readonly match = signal<Match | null>(null);
  readonly comparacion = signal<Comparacion | null>(null);
  readonly conexiones = signal<Conexion[]>([]);
  readonly retos = signal<Reto[]>([]);
  readonly feed = signal<Evento[]>([]);
  readonly progreso = signal<Progreso | null>(null);
  readonly reportando = signal<string | null>(null);
  readonly confirmarBorrado = signal(false);
  acepto = false;
  mayorDeEdad = false;
  dieta = '';
  ejerciciosElegidos: string[] = [];
  buscarEjercicio = '';
  pesoSemana: number | null = null;
  motivo = 'spam';

  readonly vista = computed(() => {
    const p = this.perfil();
    const v = this.visibles();
    return perfilPublico(p, { dieta: this.dieta, ejercicios: this.ejerciciosElegidos }, v);
  });
  readonly resumen = computed(() => {
    const p = this.perfil();
    return {
      edad: edadRango(p.edad),
      estatura: estaturaRango(p.estatura),
      imc: imcCategoria(p.peso, p.estatura),
    };
  });
  readonly pendientes = computed(() => this.conexiones().filter((c) => c.estado === 'solicitada' && !c.enviada_por_mi));

  async ngOnInit() {
    try {
      const guardado = await this.db.get('comunidad', 'local', comunidadSchema);
      if (guardado) {
        this.local.set(guardado);
        this.dieta = guardado.dieta;
        this.ejerciciosElegidos = [...guardado.ejercicios];
        this.visibles.set({ ...todoApagado(), ...guardado.visibles });
        this.pesoSemana = guardado.pesos[semanaISO(new Date())] ?? null;
        await this.conectar();
      }
    } catch (e) {
      this.fallo(e);
    } finally {
      this.cargando.set(false);
    }
  }

  private fallo(e: unknown) {
    const msg = e instanceof Error ? e.message : 'Algo salió mal.';
    this.error.set(msg);
    this.live.announce(msg, 'assertive');
  }
  private ok(msg: string) {
    this.error.set('');
    this.aviso.set(msg);
    this.live.announce(msg, 'polite');
  }

  private async conectar() {
    const l = this.local();
    if (!l) return;
    await this.api.entrar(l.usuario, l.clave);
    const yo = await this.api.yo();
    this.oculto.set(yo.oculto);
    if (yo.perfil) this.visibles.set({ ...todoApagado(), ...(yo.perfil.visibles as Partial<Visibles>) });
    await this.subirSemana();
    await this.refrescar();
  }

  async refrescar() {
    const [m, c, cx, r, f] = await Promise.all([
      this.api.match(),
      this.api.comparar(),
      this.api.conexiones(),
      this.api.retos(),
      this.api.feed(),
    ]);
    this.match.set(m);
    this.comparacion.set(c);
    this.conexiones.set(cx.conexiones);
    this.retos.set(r.retos);
    this.feed.set(f.eventos);
  }

  private async guardarLocal(cambios: Partial<ComunidadLocal>) {
    const l = this.local();
    if (!l) return;
    const nuevo = comunidadSchema.parse({ ...l, ...cambios });
    await this.db.put('comunidad', nuevo);
    this.local.set(nuevo);
  }

  async activar() {
    if (!this.mayorDeEdad || !this.acepto) {
      this.fallo(new Error('Para activar la comunidad confirma que eres mayor de 18 años y acepta el aviso de privacidad.'));
      return;
    }
    if (this.perfil().edad < 18) {
      this.fallo(new Error('La comunidad es solo para mayores de 18 años.'));
      return;
    }
    this.ocupado.set(true);
    try {
      const clave = claveAleatoria();
      const r = await this.api.alta(clave, VERSION_AVISO);
      const l = comunidadSchema.parse({
        id: 'local',
        usuario: r.usuario,
        clave,
        alias: r.alias,
        dieta: '',
        ejercicios: [],
        visibles: todoApagado(),
        pesos: {},
        creado: new Date().toISOString(),
      });
      await this.db.put('comunidad', l);
      this.local.set(l);
      this.visibles.set(todoApagado());
      await this.conectar();
      this.ok(`Listo. Tu alias es ${r.alias}. Todo está apagado: tú eliges qué compartir.`);
    } catch (e) {
      this.fallo(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  cambiarInterruptor(id: keyof Visibles, valor: boolean) {
    this.visibles.update((v) => ({ ...v, [id]: valor }));
  }
  elegirEjercicio(id: string) {
    if (this.ejerciciosElegidos.includes(id)) this.ejerciciosElegidos = this.ejerciciosElegidos.filter((e) => e !== id);
    else if (this.ejerciciosElegidos.length < 5) this.ejerciciosElegidos = [...this.ejerciciosElegidos, id];
  }
  opcionesEjercicio() {
    const q = this.buscarEjercicio.trim().toLowerCase();
    return this.ejercicios()
      .filter((e) => this.ejerciciosElegidos.includes(e.id) || !q || e.nombre.toLowerCase().includes(q))
      .slice(0, 24);
  }
  nombreEjercicio(id: string) {
    return this.ejercicios().find((e) => e.id === id)?.nombre ?? id;
  }

  async guardarPerfil() {
    this.ocupado.set(true);
    try {
      await this.guardarLocal({ dieta: this.dieta, ejercicios: this.ejerciciosElegidos, visibles: this.visibles() });
      await this.api.perfil(this.vista());
      await this.subirSemana();
      await this.refrescar();
      const n = Object.values(this.visibles()).filter(Boolean).length;
      this.ok(n ? `Guardado. Compartes ${n} de ${INTERRUPTORES.length} datos.` : 'Guardado. No compartes nada.');
    } catch (e) {
      this.fallo(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  async guardarPeso() {
    if (this.pesoSemana === null || this.pesoSemana < 30 || this.pesoSemana > 300) {
      this.fallo(new Error('Escribe un peso entre 30 y 300 kg.'));
      return;
    }
    const l = this.local();
    if (!l) return;
    await this.guardarLocal({ pesos: { ...l.pesos, [semanaISO(new Date())]: this.pesoSemana } });
    try {
      await this.subirSemana();
      this.ok('Peso guardado solo en tu teléfono. Si compartes el cambio, se envía en % redondeado.');
    } catch (e) {
      this.fallo(e);
    }
  }

  private async subirSemana() {
    const v = this.visibles();
    const l = this.local();
    if (!l || !v.progreso) return;
    const cambio = v.cambio_peso ? cambioPesoPct(l.pesos) : null;
    await this.api.semana({
      semana: semanaISO(new Date()),
      pct_habitos: pctHabitosSemana(this.registros(), this.habitos(), this.hoy()),
      racha: this.racha(),
      ...(cambio !== null ? { cambio_peso_pct: cambio } : {}),
    });
  }

  private async accion(fn: () => Promise<unknown>, msg: string) {
    this.ocupado.set(true);
    try {
      await fn();
      await this.refrescar();
      this.ok(msg);
    } catch (e) {
      this.fallo(e);
    } finally {
      this.ocupado.set(false);
    }
  }
  conectarCon(usuario: string, alias: string) {
    return this.accion(() => this.api.solicitar(usuario), `Solicitud enviada a ${alias}.`);
  }
  responder(c: Conexion, estado: 'aceptada' | 'rechazada') {
    return this.accion(() => this.api.responder(c.id, estado), estado === 'aceptada' ? `Ahora conectas con ${c.alias}.` : 'Solicitud rechazada.');
  }
  quitar(c: Conexion) {
    return this.accion(() => this.api.quitar(c.id), `Quitaste la conexión con ${c.alias}.`);
  }
  bloquear(usuario: string, alias: string) {
    return this.accion(() => this.api.bloquear(usuario), `Bloqueaste a ${alias}. No volverán a verse.`);
  }
  reportar(usuario: string, alias: string) {
    const motivo = this.motivo;
    this.reportando.set(null);
    return this.accion(() => this.api.reportar(usuario, motivo), `Reporte enviado sobre ${alias}. Gracias.`);
  }
  async verProgreso(c: Conexion) {
    try {
      this.progreso.set(await this.api.progreso(c.id));
    } catch (e) {
      this.fallo(e);
    }
  }
  unirse(r: Reto) {
    return this.accion(() => this.api.unirse(r.clave), `Te uniste a «${r.titulo}».`);
  }
  avanzar(r: Reto, delta: number) {
    const valor = Math.max(0, Math.min(7, r.avance + delta));
    return this.accion(() => this.api.avance(r.clave, valor), valor >= r.meta ? `¡Completaste «${r.titulo}»!` : `Avance: ${valor} de ${r.meta}.`);
  }
  dejar(r: Reto) {
    return this.accion(() => this.api.dejarReto(r.clave), `Saliste de «${r.titulo}».`);
  }
  reaccionar(ev: Evento, tipo: string) {
    return this.accion(() => this.api.reaccionar(ev.id, tipo), 'Reacción enviada.');
  }
  textoEvento(ev: Evento) {
    return ev.tipo === 'reto_completado' ? `completó el reto «${ev.reto ?? ''}»` : `llegó a ${ev.valor} días de racha`;
  }
  nombreDieta(id: string | null) {
    return DIETAS.find((d) => d.id === id)?.nombre ?? '';
  }

  async exportar() {
    try {
      const datos = await this.api.exportar();
      const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `progressium-comunidad-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      this.ok('Descargaste todo lo que el servidor tiene de tu cuenta.');
    } catch (e) {
      this.fallo(e);
    }
  }

  async borrarCuenta() {
    this.ocupado.set(true);
    try {
      await this.api.borrarCuenta();
    } catch (e) {
      // Si la cuenta ya no existe en el servidor, igual se limpia lo local.
      if (!(e instanceof ApiError && (e.status === 401 || e.status === 404))) {
        this.fallo(e);
        this.ocupado.set(false);
        return;
      }
    }
    await this.db.delete('comunidad', 'local');
    this.api.salir();
    this.local.set(null);
    this.visibles.set(todoApagado());
    this.match.set(null);
    this.comparacion.set(null);
    this.conexiones.set([]);
    this.retos.set([]);
    this.feed.set([]);
    this.confirmarBorrado.set(false);
    this.acepto = false;
    this.mayorDeEdad = false;
    this.ocupado.set(false);
    this.ok('Tu cuenta de la comunidad y todos sus datos se borraron del servidor y de este teléfono.');
  }
}
