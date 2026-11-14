import { Injectable, inject, signal } from '@angular/core';
import { LocalStore } from '../storage';
import { ComunidadApi } from '../comunidad/api';
import { CuentaApi, CuentaError } from './api';
import { Sesion } from './sesion';
import { SyncService } from './sync';
import { derivarContrasenaCuenta, saltDeHex } from './crypto';
import {
  OrigenRespaldo,
  PERIODIC_SYNC_TAG,
  RESPALDO_INICIAL,
  RespaldoConfig,
  anotarResultado,
  respaldoConfigSchema,
  respaldoPendiente,
} from './respaldo-programa';

type SegundoPlano = 'no-disponible' | 'sin-permiso' | 'activo' | 'apagado';
interface PeriodicSyncManager {
  register(tag: string, opts: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
}

/**
 * Respaldo cifrado de los datos locales en el servidor: manual, programado a una hora y
 * restauración. Construye sobre SyncService (AES-GCM en el dispositivo; el servidor solo guarda
 * texto cifrado). Como es PWA, el programado corre al abrir la app o mientras está abierta; si el
 * navegador ofrece Periodic Background Sync, public/sw-respaldo.js lo intenta también en segundo plano.
 */
@Injectable({ providedIn: 'root' })
export class RespaldoService {
  private db = inject(LocalStore);
  private sync = inject(SyncService);
  private sesion = inject(Sesion);
  private api = inject(CuentaApi);
  private comunidad = inject(ComunidadApi);

  readonly estado = signal<RespaldoConfig>({ ...RESPALDO_INICIAL });
  readonly ocupado = signal(false);
  readonly necesitaContrasena = signal(false);
  readonly segundoPlano = signal<SegundoPlano>('no-disponible');
  private reloj: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.sync.alSubir = (origen) => void this.anotar(true, origen);
  }

  async cargar(): Promise<RespaldoConfig> {
    const cfg = await this.db.get('cuenta', 'respaldo', respaldoConfigSchema).catch(() => null);
    this.estado.set(cfg ?? { ...RESPALDO_INICIAL });
    this.necesitaContrasena.set(!!this.sesion.actual() && !this.sync.tieneLlave());
    return this.estado();
  }

  /** Al abrir la app: carga el estado, revisa si hay un respaldo pendiente y vigila cada minuto. */
  async iniciar(): Promise<void> {
    await this.cargar();
    void this.revisarSegundoPlano();
    if (!this.reloj) {
      this.reloj = setInterval(() => void this.revisarPendiente(), 60_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.cargar().then(() => this.revisarPendiente());
      });
    }
    await this.revisarPendiente();
  }

  async revisarPendiente(ahora = new Date()): Promise<boolean> {
    if (this.ocupado() || !this.sesion.actual() || !this.sync.tieneLlave()) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    if (!respaldoPendiente(this.estado(), ahora)) return false;
    return this.respaldarAhora('programado');
  }

  async respaldarAhora(origen: 'manual' | 'programado' = 'manual'): Promise<boolean> {
    this.ocupado.set(true);
    try {
      await this.sync.subirAhora(origen);
      return true;
    } catch (e) {
      await this.anotar(false, origen, this.mensaje(e));
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Devuelve la fecha del respaldo restaurado, o lanza un error con mensaje para mostrar. */
  async restaurar(): Promise<string> {
    this.ocupado.set(true);
    try {
      const fecha = await this.sync.restaurarUltimo();
      await this.cargar();
      await this.anotar(true, 'restaurado');
      return fecha;
    } catch (e) {
      throw new Error(this.mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Verifica la contraseña con el servidor, renueva la sesión y guarda la llave en este dispositivo. */
  async desbloquear(contrasena: string): Promise<void> {
    const c = this.sesion.actual();
    if (!c) throw new Error('Crea una cuenta o inicia sesión.');
    this.ocupado.set(true);
    try {
      const sales = await this.api.sales(c.usuario);
      const cc = await derivarContrasenaCuenta(contrasena, saltDeHex(sales.salt_cuenta));
      const auth = await this.api.entrar(c.usuario, cc);
      this.comunidad.usarToken(auth.token);
      await this.sesion.guardar({ ...(this.sesion.actual() ?? c), token: auth.token, salt: sales.salt_cifrado });
      await this.sync.prepararLlave(contrasena, sales.salt_cifrado);
      this.necesitaContrasena.set(false);
    } catch (e) {
      if (e instanceof CuentaError && e.status === 400) throw new Error('La contraseña no coincide.');
      throw new Error(this.mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  async programar(activo: boolean, hora: string): Promise<void> {
    const cfg = respaldoConfigSchema.parse({ ...this.estado(), activo, hora });
    await this.db.put('cuenta', cfg);
    this.estado.set(cfg);
    await this.revisarSegundoPlano(true);
  }

  private async anotar(ok: boolean, origen: OrigenRespaldo, mensaje = ''): Promise<void> {
    const cfg = anotarResultado(this.estado(), ok, new Date(), origen, mensaje);
    this.estado.set(cfg);
    await this.db.put('cuenta', cfg).catch(() => undefined);
  }

  private mensaje(e: unknown): string {
    if (e instanceof CuentaError && e.status === 401) {
      this.necesitaContrasena.set(true);
      return 'Tu sesión venció. Escribe tu contraseña para renovarla.';
    }
    return e instanceof Error ? e.message : 'No pudimos completar el respaldo.';
  }

  /** Periodic Background Sync (solo algunos navegadores, p. ej. Chrome con la app instalada). */
  private async revisarSegundoPlano(pedir = false): Promise<void> {
    try {
      if (!('serviceWorker' in navigator)) return this.segundoPlano.set('no-disponible');
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((r) => setTimeout(() => r(null), 3000)),
      ]);
      const ps = (reg as (ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }) | null)?.periodicSync;
      if (!ps) return this.segundoPlano.set('no-disponible');
      if (!this.estado().activo) {
        if (pedir) await ps.unregister(PERIODIC_SYNC_TAG).catch(() => undefined);
        return this.segundoPlano.set('apagado');
      }
      const permiso = await navigator.permissions
        .query({ name: 'periodic-background-sync' as PermissionName })
        .catch(() => null);
      if (permiso?.state !== 'granted') return this.segundoPlano.set('sin-permiso');
      await ps.register(PERIODIC_SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
      this.segundoPlano.set('activo');
    } catch {
      this.segundoPlano.set('no-disponible');
    }
  }
}
