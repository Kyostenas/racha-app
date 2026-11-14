import { z } from 'zod';

/**
 * Respaldo de datos locales en el servidor (v0.4.7). Se guarda en el almacén «cuenta» (no se
 * sincroniza) con id «respaldo». public/sw-respaldo.js repite `respaldoPendiente` para el
 * respaldo en segundo plano (Periodic Background Sync); si cambias la regla, cámbiala ahí también.
 */
export const respaldoConfigSchema = z.object({
  id: z.literal('respaldo'),
  activo: z.boolean(),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  ultimoOk: z.string().nullable(),
  ultimoIntento: z.string().nullable(),
  resultado: z.enum(['ok', 'error']).nullable(),
  mensaje: z.string(),
  origen: z.enum(['manual', 'programado', 'segundo-plano', 'sincronizacion', 'restaurado']).nullable(),
});
export type RespaldoConfig = z.infer<typeof respaldoConfigSchema>;
export type OrigenRespaldo = NonNullable<RespaldoConfig['origen']>;

export const RESPALDO_INICIAL: RespaldoConfig = {
  id: 'respaldo',
  activo: false,
  hora: '21:00',
  ultimoOk: null,
  ultimoIntento: null,
  resultado: null,
  mensaje: '',
  origen: null,
};
/** Tras un error, el respaldo programado se reintenta como mucho cada 15 minutos. */
export const REINTENTO_MS = 15 * 60 * 1000;
export const PERIODIC_SYNC_TAG = 'progressium-respaldo';

/** La hora elegida (HH:MM, hora local del dispositivo) en el día de `ahora`. */
export function horaDelDia(hora: string, ahora: Date): Date {
  const [h, m] = hora.split(':').map(Number);
  const d = new Date(ahora);
  d.setHours(h, m, 0, 0);
  return d;
}

/** ¿Toca respaldar? Activo, ya pasó la hora de hoy, no hay respaldo correcto desde esa hora
 * y no hubo un intento en los últimos 15 minutos. */
export function respaldoPendiente(cfg: RespaldoConfig, ahora: Date): boolean {
  if (!cfg.activo) return false;
  const objetivo = horaDelDia(cfg.hora, ahora);
  if (ahora < objetivo) return false;
  if (cfg.ultimoOk && new Date(cfg.ultimoOk) >= objetivo) return false;
  if (cfg.ultimoIntento && ahora.getTime() - new Date(cfg.ultimoIntento).getTime() < REINTENTO_MS) return false;
  return true;
}

export function anotarResultado(
  cfg: RespaldoConfig,
  ok: boolean,
  ahora: Date,
  origen: OrigenRespaldo,
  mensaje = '',
): RespaldoConfig {
  const iso = ahora.toISOString();
  return {
    ...cfg,
    ultimoIntento: iso,
    ultimoOk: ok ? iso : cfg.ultimoOk,
    resultado: ok ? 'ok' : 'error',
    mensaje: ok ? '' : mensaje,
    origen,
  };
}

export function fechaRespaldo(iso: string | null): string {
  if (!iso) return 'nunca';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}
