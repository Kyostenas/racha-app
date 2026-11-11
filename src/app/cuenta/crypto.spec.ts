import { describe, it, expect } from 'vitest';
import {
  cifrar,
  descifrar,
  derivarLlave,
  generarSalt,
  pareceCifrado,
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
