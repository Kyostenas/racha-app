import { Injectable, inject } from '@angular/core';
import { Sesion } from './sesion';

export class CuentaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface AltaRespuesta {
  id: string;
  usuario: string;
  alias: string;
  salt: string;
}

export interface SyncEstado {
  salt: string;
  max_version: number;
  ultimo: { dispositivo: string; version: number; actualizado: string; datos_cifrados: string } | null;
  historial: { dispositivo: string; version: number; actualizado: string }[];
}

const BASE = '/api/progressium';

@Injectable({ providedIn: 'root' })
export class CuentaApi {
  private sesion = inject(Sesion);

  private async pedir<T>(metodo: string, ruta: string, body?: unknown, base = BASE): Promise<T> {
    const token = this.sesion.token();
    let r: Response;
    try {
      r = await fetch(base + ruta, {
        method: metodo,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
    } catch {
      throw new CuentaError('No hay conexión con el servidor. Tus datos siguen en este dispositivo.', 0);
    }
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new CuentaError(data?.message ?? 'Algo salió mal.', r.status);
    return data as T;
  }

  async estado() {
    const d = await this.pedir<{ servicio: string; version: string; version_aviso: string }>('GET', '/estado');
    if (d?.servicio !== 'progressium') {
      throw new CuentaError('El servidor de cuentas no está disponible.', 0);
    }
    return d;
  }

  alta(body: {
    usuario: string;
    contrasena: string;
    correo?: string;
    mayor_de_edad: true;
    acepto_terminos: true;
    version_aviso: string;
  }) {
    return this.pedir<AltaRespuesta>('POST', '/cuenta/alta', body);
  }

  async entrar(usuario: string, contrasena: string): Promise<{ token: string }> {
    const r = await this.pedir<{ token: string }>('POST', '/auth-with-password', { identity: usuario, password: contrasena }, '/api/collections/usuarios');
    return r;
  }

  sync() {
    return this.pedir<SyncEstado>('GET', '/sync');
  }

  subir(body: { dispositivo: string; version: number; datos_cifrados: string }) {
    return this.pedir<{ version: number }>('PUT', '/sync', body);
  }

  borrarCuenta() {
    return this.pedir<{ borrada: true }>('DELETE', '/cuenta');
  }
}
