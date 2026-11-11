import { describe, it, expect } from 'vitest';
import {
  cifrar,
  descifrar,
  derivarContrasenaCuenta,
  derivarLlave,
  derivarMaterial,
  generarParDeSales,
  generarSalt,
  pareceCifrado,
  pareceContrasenaDerivada,
  saltAHex,
  saltDeHex,
} from './crypto';

describe('cifrado de extremo a extremo', () => {
  it('cifra y descifra el JSON de la app', async () => {
    const salt = generarSalt();
    const llave = await derivarLlave('clave-de-prueba-segura', salt);
    const datos = { hábitos: [{ id: 'agua', nombre: 'Agua' }], perfil: { peso: 70 } };
    const paquete = await cifrar(llave, datos);
    expect(pareceCifrado(paquete)).toBe(true);
    expect(paquete).not.toContain('peso');
    expect(paquete).not.toContain('agua');
    expect(await descifrar(llave, paquete)).toEqual(datos);
  });

  it('la misma contraseña y salt producen una llave que abre el blob', async () => {
    const salt = saltDeHex(saltAHex(generarSalt()));
    const a = await derivarLlave('misma', salt);
    const b = await derivarLlave('misma', salt);
    const paquete = await cifrar(a, { racha: 3 });
    expect(await descifrar(b, paquete)).toEqual({ racha: 3 });
  });

  it('una contraseña distinta no descifra', async () => {
    const salt = generarSalt();
    const paquete = await cifrar(await derivarLlave('una', salt), { secreto: 1 });
    await expect(descifrar(await derivarLlave('otra', salt), paquete)).rejects.toThrow();
  });
});

describe('dos derivaciones distintas a partir de la contraseña', () => {
  const claro = 'clave-de-prueba-segura';

  it('(a) contraseña de cuenta y (b) material de la llave AES son distintos, y ninguno es la contraseña en claro', async () => {
    const { saltCuenta, saltCifrado } = generarParDeSales();
    const cuenta = await derivarContrasenaCuenta(claro, saltCuenta);
    const materialLlave = 'v1.' + saltAHex(await derivarMaterial(claro, saltCifrado));
    expect(pareceContrasenaDerivada(cuenta)).toBe(true);
    expect(pareceContrasenaDerivada(materialLlave)).toBe(true);
    expect(cuenta).not.toEqual(materialLlave);
    expect(cuenta.includes(claro)).toBe(false);
    expect(materialLlave.includes(claro)).toBe(false);
    expect(saltAHex(saltCuenta)).not.toEqual(saltAHex(saltCifrado));
  });

  it('con la misma sal, (a) y el material de (b) coincidirían, por eso cada uno tiene su propia sal', async () => {
    const sal = generarSalt();
    const cuenta = await derivarContrasenaCuenta(claro, sal);
    const materialLlave = 'v1.' + saltAHex(await derivarMaterial(claro, sal));
    expect(cuenta).toEqual(materialLlave);
  });
});
