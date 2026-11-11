import { Injectable, inject, signal } from '@angular/core';
import { z } from 'zod';
import { LocalStore } from '../storage';

export const cuentaLocalSchema = z.object({
  id: z.literal('local'),
  token: z.string(),
  usuario: z.string(),
  alias: z.string(),
  userId: z.string(),
  salt: z.string(),
  dispositivo: z.string(),
  version: z.number().int().nonnegative(),
  sucio: z.boolean(),
});
export type CuentaLocal = z.infer<typeof cuentaLocalSchema>;

@Injectable({ providedIn: 'root' })
export class Sesion {
  private db = inject(LocalStore);
  readonly actual = signal<CuentaLocal | null>(null);
  token(): string {
    return this.actual()?.token ?? '';
  }
  async cargar(): Promise<CuentaLocal | null> {
    const c = await this.db.get('cuenta', 'local', cuentaLocalSchema);
    this.actual.set(c);
    return c;
  }
  async guardar(c: CuentaLocal): Promise<void> {
    await this.db.put('cuenta', c);
    this.actual.set(c);
  }
  async borrar(): Promise<void> {
    await this.db.delete('cuenta', 'local');
    this.actual.set(null);
  }
}
