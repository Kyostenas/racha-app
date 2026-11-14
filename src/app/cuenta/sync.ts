import { Injectable, inject } from '@angular/core';
import { z } from 'zod';
import { LocalStore } from '../storage';
import { CuentaApi, CuentaError } from './api';
import { Sesion } from './sesion';
import { cifrar, descifrar, derivarLlave, saltDeHex } from './crypto';

function dispositivoId(): string {
  const k = 'progressium-dispositivo';
  let id = localStorage.getItem(k);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(k, id);
  }
  return id;
}

/**
 * La llave AES-GCM se guarda en IndexedDB como CryptoKey NO extraíble: el código no puede leer sus
 * bytes, solo usarla para cifrar/descifrar en este dispositivo. Así el respaldo programado funciona
 * tras recargar sin volver a pedir la contraseña. Los datos que protege ya están en claro en el
 * mismo IndexedDB, así que no expone nada nuevo; «Borrar todos mis datos» la elimina.
 */
const llaveGuardadaSchema = z.object({
  id: z.literal('llave'),
  llave: z.custom<CryptoKey>((v) => typeof v === 'object' && v !== null),
});

function volcadoVacio(datos: Record<string, unknown[]>): boolean {
  return !Object.values(datos).some((arr) => Array.isArray(arr) && arr.length > 0);
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  private db = inject(LocalStore);
  private api = inject(CuentaApi);
  private sesion = inject(Sesion);
  private llave: CryptoKey | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enCurso: Promise<'subido' | 'bajado' | 'igual' | 'sin-llave' | 'sin-red'> | null = null;
  private cambiosMientras = false;
  /** Se llama tras cada subida correcta (respaldo manual, programado o sincronización). */
  alSubir: ((origen: 'sincronizacion' | 'manual' | 'programado') => void) | null = null;
  private origenSubida: 'sincronizacion' | 'manual' | 'programado' = 'sincronizacion';

  dispositivo(): string {
    return dispositivoId();
  }

  async prepararLlave(contrasena: string, saltHex: string): Promise<void> {
    this.llave = await derivarLlave(contrasena, saltDeHex(saltHex));
    await this.db.put('cuenta', { id: 'llave', llave: this.llave }).catch(() => undefined);
  }

  /** Recupera la llave guardada en este dispositivo (si hay). */
  async cargarLlave(): Promise<boolean> {
    const g = await this.db.get('cuenta', 'llave', llaveGuardadaSchema).catch(() => null);
    if (g) this.llave = g.llave;
    return !!this.llave;
  }

  olvidarLlave(): void {
    this.llave = null;
    void this.db.delete('cuenta', 'llave').catch(() => undefined);
  }

  /**
   * «Respaldar ahora»: sube lo que hay en este dispositivo como versión más nueva, aunque otro
   * dispositivo haya subido antes (el servidor conserva las 3 últimas versiones).
   */
  async subirAhora(origen: 'manual' | 'programado'): Promise<void> {
    if (this.enCurso) await this.enCurso.catch(() => undefined);
    const c = this.sesion.actual();
    if (!c) throw new Error('Crea una cuenta o inicia sesión para respaldar.');
    if (!this.llave) throw new Error('Escribe tu contraseña para activar el respaldo en este dispositivo.');
    const datos = await this.db.exportarSync();
    if (volcadoVacio(datos)) throw new Error('Aún no hay datos que respaldar.');
    const datos_cifrados = await cifrar(this.llave, datos);
    this.cambiosMientras = false;
    for (let intento = 0; ; intento++) {
      const remoto = await this.api.sync();
      const version = Math.max(c.version, remoto.max_version) + 1;
      try {
        const r = await this.api.subir({ dispositivo: c.dispositivo, version, datos_cifrados });
        this.origenSubida = origen;
        await this.cerrarSubida(c, r.version);
        return;
      } catch (e) {
        if (!(e instanceof CuentaError && e.status === 409) || intento >= 1) {
          this.marcarEstado('error');
          throw e;
        }
      }
    }
  }

  /** Reemplaza los datos de este dispositivo con el último respaldo del servidor. */
  async restaurarUltimo(): Promise<string> {
    if (this.enCurso) await this.enCurso.catch(() => undefined);
    const c = this.sesion.actual();
    if (!c) throw new Error('Crea una cuenta o inicia sesión para restaurar.');
    if (!this.llave) throw new Error('Escribe tu contraseña para activar el respaldo en este dispositivo.');
    const remoto = await this.api.sync();
    if (!remoto.ultimo) throw new Error('Aún no hay un respaldo en el servidor.');
    this.cambiosMientras = false;
    try {
      await this.bajar(c, remoto.ultimo.datos_cifrados, remoto.max_version);
    } catch (e) {
      if (e instanceof DOMException || (e instanceof Error && e.name === 'OperationError'))
        throw new Error('No pudimos descifrar el respaldo con la llave de este dispositivo. Vuelve a escribir tu contraseña.');
      throw e;
    }
    return remoto.ultimo.actualizado;
  }

  tieneLlave(): boolean {
    return !!this.llave;
  }

  async marcarSucio(): Promise<void> {
    this.cambiosMientras = true;
    this.marcarEstado('pendiente');
    const c = this.sesion.actual();
    if (c && !c.sucio) await this.sesion.guardar({ ...c, sucio: true });
    this.programar();
  }

  async sincronizar(): Promise<'subido' | 'bajado' | 'igual' | 'sin-llave' | 'sin-red'> {
    if (this.enCurso) return this.enCurso;
    this.enCurso = this.correr().finally(() => {
      this.enCurso = null;
    });
    return this.enCurso;
  }

  private programar(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sincronizar();
    }, 600);
  }

  private marcarEstado(valor: 'ok' | 'pendiente' | 'error'): void {
    if (typeof document !== 'undefined') document.documentElement.dataset['sync'] = valor;
  }

  private async correr(): Promise<'subido' | 'bajado' | 'igual' | 'sin-llave' | 'sin-red'> {
    const c = this.sesion.actual();
    if (!c) return 'igual';
    if (!this.llave) return 'sin-llave';
    let remoto: Awaited<ReturnType<CuentaApi['sync']>>;
    try {
      remoto = await this.api.sync();
    } catch (e) {
      if (e instanceof CuentaError && e.status === 0) return 'sin-red';
      this.marcarEstado('error');
      throw e;
    }
    const localVer = c.version;
    const remotaVer = remoto.max_version;
    if (c.sucio || localVer > remotaVer) {
      this.cambiosMientras = false;
      const datos = await this.db.exportarSync();
      if (volcadoVacio(datos)) {
        if (remotaVer > localVer && remoto.ultimo) {
          return this.bajar(c, remoto.ultimo.datos_cifrados, remotaVer);
        }
        return 'igual';
      }
      let version = Math.max(localVer, remotaVer) + 1;
      const datos_cifrados = await cifrar(this.llave, datos);
      try {
        const r = await this.api.subir({ dispositivo: c.dispositivo, version, datos_cifrados });
        await this.cerrarSubida(c, r.version);
      } catch (e) {
        if (e instanceof CuentaError && e.status === 409) {
          const otra = await this.api.sync();
          version = otra.max_version + 1;
          const r = await this.api.subir({ dispositivo: c.dispositivo, version, datos_cifrados });
          await this.cerrarSubida(c, r.version);
        } else {
          this.marcarEstado('error');
          throw e;
        }
      }
      return 'subido';
    }
    if (remotaVer > localVer && remoto.ultimo) {
      return this.bajar(c, remoto.ultimo.datos_cifrados, remotaVer);
    }
    this.marcarEstado('ok');
    return 'igual';
  }

  private async bajar(
    c: { token: string; usuario: string; alias: string; userId: string; salt: string; dispositivo: string; version: number; sucio: boolean; id: 'local' },
    datos_cifrados: string,
    remotaVer: number,
  ): Promise<'bajado'> {
    const datos = await descifrar(this.llave!, datos_cifrados);
    if (!datos || typeof datos !== 'object') throw new Error('El respaldo no tiene el formato esperado.');
    await this.db.importarSync(datos as Record<string, unknown[]>);
    const actual = this.sesion.actual() ?? c;
    await this.sesion.guardar({ ...actual, version: remotaVer, sucio: this.cambiosMientras });
    this.marcarEstado(this.cambiosMientras ? 'pendiente' : 'ok');
    if (this.cambiosMientras) this.programar();
    return 'bajado';
  }

  private async cerrarSubida(c: { token: string; usuario: string; alias: string; userId: string; salt: string; dispositivo: string; version: number; sucio: boolean; id: 'local' }, version: number): Promise<void> {
    const actual = this.sesion.actual() ?? c;
    await this.sesion.guardar({ ...actual, version, sucio: this.cambiosMientras });
    this.marcarEstado(this.cambiosMientras ? 'pendiente' : 'ok');
    this.alSubir?.(this.origenSubida);
    this.origenSubida = 'sincronizacion';
    if (this.cambiosMientras) this.programar();
  }
}
