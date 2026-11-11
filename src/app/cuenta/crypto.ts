// Cifrado de extremo a extremo en el dispositivo.
// De la contraseña se derivan DOS valores distintos, cada uno con su propia sal:
//   (a) la contraseña de la cuenta que se manda a PocketBase
//   (b) la llave AES-GCM, que nunca sale del dispositivo
// La contraseña en claro no viaja en ninguna petición.
const ITERACIONES = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const LLAVE_BITS = 256;

function bytes(u8: Uint8Array): ArrayBuffer {
  const copia = new Uint8Array(u8.byteLength);
  copia.set(u8);
  return copia.buffer;
}

function aB64(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deB64(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function generarSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  return salt;
}

export function generarParDeSales(): { saltCuenta: Uint8Array; saltCifrado: Uint8Array } {
  let saltCuenta = generarSalt();
  let saltCifrado = generarSalt();
  while (saltAHex(saltCuenta) === saltAHex(saltCifrado)) saltCifrado = generarSalt();
  return { saltCuenta, saltCifrado };
}

export function saltAHex(salt: Uint8Array): string {
  return Array.from(salt, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function saltDeHex(hex: string): Uint8Array {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2) throw new Error('Salt inválido.');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function derivarMaterial(contrasena: string, salt: Uint8Array): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(contrasena),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: bytes(salt), iterations: ITERACIONES, hash: 'SHA-256' },
    base,
    LLAVE_BITS,
  );
  return new Uint8Array(bits);
}

/** (a) Contraseña que se envía a PocketBase. Nunca es la contraseña en claro. */
export async function derivarContrasenaCuenta(contrasena: string, saltCuenta: Uint8Array): Promise<string> {
  return 'v1.' + saltAHex(await derivarMaterial(contrasena, saltCuenta));
}

/** (b) Llave AES-GCM. Se queda en la memoria del dispositivo. */
export async function derivarLlave(contrasena: string, saltCifrado: Uint8Array): Promise<CryptoKey> {
  const material = await derivarMaterial(contrasena, saltCifrado);
  return crypto.subtle.importKey('raw', bytes(material), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function cifrar(llave: CryptoKey, datos: unknown): Promise<string> {
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const claro = new TextEncoder().encode(JSON.stringify(datos));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bytes(iv) }, llave, claro);
  return `v1.${aB64(iv)}.${aB64(ct)}`;
}

export async function descifrar(llave: CryptoKey, paquete: string): Promise<unknown> {
  const partes = paquete.split('.');
  if (partes.length !== 3 || partes[0] !== 'v1') throw new Error('Respaldo cifrado ilegible.');
  const iv = deB64(partes[1]);
  const ct = deB64(partes[2]);
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, llave, bytes(ct));
  return JSON.parse(new TextDecoder().decode(claro));
}

export function pareceCifrado(texto: string): boolean {
  return /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(texto);
}

export function pareceContrasenaDerivada(texto: string): boolean {
  return /^v1\.[a-f0-9]{64}$/.test(texto);
}

export { ITERACIONES };
