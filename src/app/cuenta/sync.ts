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

@Injectable({ providedIn: 'root' })
export class SyncService {
  private db = inject(LocalStore);
  private api = inject(CuentaApi);
  private sesion = inject(Sesion);
  private llave: CryptoKey | null = null;

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
    const c = this.sesion.actual();
    if (!c || c.sucio) return;
    await this.sesion.guardar({ ...c, sucio: true });
  }

  async sincronizar(): Promise<'subido' | 'bajado' | 'igual' | 'sin-llave' | 'sin-red'> {
    const c = this.sesion.actual();
    if (!c) return 'igual';
    if (!this.llave) return 'sin-llave';
    let remoto: Awaited<ReturnType<CuentaApi['sync']>>;
    try {
      remoto = await this.api.sync();
    } catch (e) {
      if (e instanceof CuentaError && e.status === 0) return 'sin-red';
      throw e;
    }
    const localVer = c.version;
    const remotaVer = remoto.max_version;
    if (c.sucio || localVer > remotaVer) {
      const datos = await this.db.exportarSync();
      let version = Math.max(localVer, remotaVer) + 1;
      const datos_cifrados = await cifrar(this.llave, datos);
      try {
        const r = await this.api.subir({ dispositivo: c.dispositivo, version, datos_cifrados });
        await this.sesion.guardar({ ...c, version: r.version, sucio: false });
      } catch (e) {
        if (e instanceof CuentaError && e.status === 409) {
          const otra = await this.api.sync();
          version = otra.max_version + 1;
          const r = await this.api.subir({ dispositivo: c.dispositivo, version, datos_cifrados });
          await this.sesion.guardar({ ...c, version: r.version, sucio: false });
        } else throw e;
      }
      return 'subido';
    }
    if (remotaVer > localVer && remoto.ultimo) {
      const datos = await descifrar(this.llave, remoto.ultimo.datos_cifrados);
      if (!datos || typeof datos !== 'object') throw new Error('El respaldo no tiene el formato esperado.');
      await this.db.importarSync(datos as Record<string, unknown[]>);
      await this.sesion.guardar({ ...c, version: remotaVer, sucio: false });
      return 'bajado';
    }
    return 'igual';
  }
}
