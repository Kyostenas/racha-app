import { Injectable } from '@angular/core';

// La API vive en el mismo origen que la PWA (la imagen sirve ambas). No hay URL configurable.
const BASE = '/api/progressium';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface Candidato {
  usuario: string;
  alias: string;
  puntaje: number;
  edad_rango: string | null;
  imc_cat: string | null;
  intencion: string | null;
  dieta: string | null;
  ejercicios_en_comun: string[];
  conexion: { id: string; estado: string; mia: boolean } | null;
}
export interface Match { suficiente: boolean; n?: number; n_minimo?: number; candidatos?: Candidato[]; motivo?: string }
export interface Comparacion { suficiente: boolean; n?: number; n_minimo?: number; habitos?: number; racha?: number; cambio_peso?: number | null }
export interface Conexion { id: string; usuario: string; alias: string; estado: string; enviada_por_mi: boolean }
export interface Reto { clave: string; titulo: string; descripcion: string; meta: number; semana: string; unido: boolean; avance: number; completado: boolean; participantes: number | null }
export interface Evento { id: string; usuario: string; alias: string; propio: boolean; tipo: string; reto: string | null; valor: number; creado: string; reacciones: Record<string, number>; mi_reaccion: string | null }
export interface Progreso { alias: string; compartido: boolean; semanas: { semana: string; pct_habitos: number; racha: number; cambio_peso_pct: number | null }[] }

@Injectable({ providedIn: 'root' })
export class ComunidadApi {
  private token = '';

  private async pedir<T>(metodo: string, ruta: string, body?: unknown, base = BASE): Promise<T> {
    let r: Response;
    try {
      r = await fetch(base + ruta, {
        method: metodo,
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: this.token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
    } catch {
      throw new ApiError('La comunidad no está disponible ahora. Tu app sigue funcionando.', 0);
    }
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new ApiError(data?.message ?? 'Algo salió mal.', r.status);
    return data as T;
  }

  conectado() { return !!this.token; }
  salir() { this.token = ''; }
  estado() { return this.pedir<{ version_aviso: string; k_min: number }>('GET', '/estado'); }
  alta(clave: string, version_aviso: string) {
    return this.pedir<{ usuario: string; alias: string; id: string }>('POST', '/alta', {
      clave,
      mayor_de_edad: true,
      consentimiento: { acepto: true, version_aviso },
    });
  }
  async entrar(usuario: string, clave: string) {
    const r = await this.pedir<{ token: string }>('POST', '/auth-with-password', { identity: usuario, password: clave }, '/api/collections/usuarios');
    this.token = r.token;
  }
  yo() { return this.pedir<{ id: string; alias: string; oculto: boolean; perfil: { visibles: Record<string, boolean> } | null }>('GET', '/yo'); }
  perfil(p: object) { return this.pedir('PUT', '/perfil', p); }
  semana(s: { semana: string; pct_habitos: number; racha: number; cambio_peso_pct?: number | null }) { return this.pedir('PUT', '/semana', s); }
  match() { return this.pedir<Match>('GET', '/match'); }
  comparar() { return this.pedir<Comparacion>('GET', '/comparar'); }
  conexiones() { return this.pedir<{ conexiones: Conexion[] }>('GET', '/conexiones'); }
  solicitar(para: string) { return this.pedir('POST', '/conexiones', { para }); }
  responder(id: string, estado: 'aceptada' | 'rechazada') { return this.pedir('PATCH', `/conexiones/${encodeURIComponent(id)}`, { estado }); }
  quitar(id: string) { return this.pedir('DELETE', `/conexiones/${encodeURIComponent(id)}`); }
  progreso(id: string) { return this.pedir<Progreso>('GET', `/conexiones/${encodeURIComponent(id)}/progreso`); }
  bloquear(usuario: string) { return this.pedir('POST', '/bloquear', { usuario }); }
  reportar(usuario: string, motivo: string) { return this.pedir('POST', '/reportar', { usuario, motivo }); }
  retos() { return this.pedir<{ retos: Reto[] }>('GET', '/retos'); }
  unirse(clave: string) { return this.pedir<{ retos: Reto[] }>('POST', `/retos/${encodeURIComponent(clave)}/unirse`); }
  avance(clave: string, avance: number) { return this.pedir<{ retos: Reto[] }>('PUT', `/retos/${encodeURIComponent(clave)}/avance`, { avance }); }
  dejarReto(clave: string) { return this.pedir<{ retos: Reto[] }>('DELETE', `/retos/${encodeURIComponent(clave)}`); }
  feed() { return this.pedir<{ eventos: Evento[] }>('GET', '/feed'); }
  reaccionar(evento: string, tipo: string) { return this.pedir('POST', '/reacciones', { evento, tipo }); }
  exportar() { return this.pedir<object>('GET', '/exportar'); }
  borrarCuenta() { return this.pedir('DELETE', '/cuenta'); }
}
