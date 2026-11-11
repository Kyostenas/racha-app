import { Injectable, inject } from '@angular/core';
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

  dispositivo(): string {
    return dispositivoId();
  }

  async prepararLlave(contrasena: string, saltHex: string): Promise<void> {
    this.llave = await derivarLlave(contrasena, saltDeHex(saltHex));
  }

  olvidarLlave(): void {
    this.llave = null;
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
    if (this.cambiosMientras) this.programar();
  }
}
