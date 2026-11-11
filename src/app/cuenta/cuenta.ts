import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { VERSION_AVISO } from '../comunidad/dominio';
import { ComunidadApi } from '../comunidad/api';
import { CuentaApi, CuentaError } from './api';
import { Sesion } from './sesion';
import { SyncService } from './sync';
import { derivarContrasenaCuenta, generarParDeSales, saltAHex, saltDeHex } from './crypto';

@Component({
  selector: 'app-cuenta',
  imports: [FormsModule],
  templateUrl: './cuenta.html',
})
export class Cuenta {
  private api = inject(CuentaApi);
  private comunidad = inject(ComunidadApi);
  private sesion = inject(Sesion);
  private sync = inject(SyncService);
  private live = inject(LiveAnnouncer);

  @Output() readonly listo = new EventEmitter<void>();

  readonly modo = signal<'crear' | 'entrar'>('crear');
  readonly ocupado = signal(false);
  readonly error = signal('');
  readonly versionAviso = VERSION_AVISO;

  usuario = '';
  contrasena = '';
  correo = '';
  mayorDeEdad = false;
  aceptoTerminos = false;

  cambiarModo(modo: 'crear' | 'entrar') {
    this.modo.set(modo);
    this.error.set('');
  }

  async enviar() {
    this.error.set('');
    const usuario = this.usuario.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,31}$/.test(usuario)) {
      this.fallo('El alias debe tener de 3 a 32 caracteres, empezar con una letra y solo usar letras minúsculas, números o guion bajo.');
      return;
    }
    if (this.contrasena.length < 8 || this.contrasena.length > 128) {
      this.fallo('La contraseña debe tener entre 8 y 128 caracteres.');
      return;
    }
    this.ocupado.set(true);
    try {
      if (this.modo() === 'crear') {
        if (!this.mayorDeEdad || !this.aceptoTerminos) {
          this.fallo('Confirma que eres mayor de 18 años y acepta los términos y el aviso de privacidad.');
          return;
        }
        const sales = generarParDeSales();
        const contrasenaCuenta = await derivarContrasenaCuenta(this.contrasena, sales.saltCuenta);
        const alta = await this.api.alta({
          usuario,
          contrasena: contrasenaCuenta,
          salt_cuenta: saltAHex(sales.saltCuenta),
          salt_cifrado: saltAHex(sales.saltCifrado),
          ...(this.correo.trim() ? { correo: this.correo.trim() } : {}),
          mayor_de_edad: true,
          acepto_terminos: true,
          version_aviso: VERSION_AVISO,
        });
        const auth = await this.api.entrar(alta.usuario, contrasenaCuenta);
        this.comunidad.usarToken(auth.token);
        await this.sesion.guardar({
          id: 'local',
          token: auth.token,
          usuario: alta.usuario,
          alias: alta.alias,
          userId: alta.id,
          salt: alta.salt_cifrado || alta.salt,
          dispositivo: this.sync.dispositivo(),
          version: 0,
          sucio: true,
        });
        await this.sync.prepararLlave(this.contrasena, alta.salt_cifrado || alta.salt);
      } else {
        const sales = await this.api.sales(usuario);
        const contrasenaCuenta = await derivarContrasenaCuenta(this.contrasena, saltDeHex(sales.salt_cuenta));
        const auth = await this.api.entrar(usuario, contrasenaCuenta);
        this.comunidad.usarToken(auth.token);
        await this.sesion.guardar({
          id: 'local',
          token: auth.token,
          usuario,
          alias: usuario,
          userId: '',
          salt: sales.salt_cifrado,
          dispositivo: this.sync.dispositivo(),
          version: 0,
          sucio: false,
        });
        await this.sync.prepararLlave(this.contrasena, sales.salt_cifrado);
      }
      this.contrasena = '';
      await this.sync.sincronizar();
      this.listo.emit();
    } catch (e) {
      this.fallo(e instanceof CuentaError || e instanceof Error ? e.message : 'No pudimos completar la operación.');
    } finally {
      this.ocupado.set(false);
    }
  }

  private fallo(msg: string) {
    this.error.set(msg);
    void this.live.announce(msg, 'assertive');
    this.ocupado.set(false);
  }
}
