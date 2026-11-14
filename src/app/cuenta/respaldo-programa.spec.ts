import { RESPALDO_INICIAL, anotarResultado, horaDelDia, respaldoPendiente } from './respaldo-programa';

const cfg = { ...RESPALDO_INICIAL, activo: true, hora: '21:30' };
const a = (h: string, dia = 13) => new Date(2026, 10, dia, Number(h.slice(0, 2)), Number(h.slice(3)));

describe('respaldo programado', () => {
  it('apagado nunca está pendiente', () => {
    expect(respaldoPendiente({ ...cfg, activo: false }, a('23:00'))).toBe(false);
  });
  it('antes de la hora no toca; después sí', () => {
    expect(respaldoPendiente(cfg, a('21:29'))).toBe(false);
    expect(respaldoPendiente(cfg, a('21:30'))).toBe(true);
    expect(respaldoPendiente(cfg, a('23:59'))).toBe(true);
  });
  it('un respaldo correcto después de la hora cubre el día; uno anterior no', () => {
    const hecho = anotarResultado(cfg, true, a('21:31'), 'programado');
    expect(respaldoPendiente(hecho, a('22:00'))).toBe(false);
    expect(respaldoPendiente(hecho, a('21:29', 14))).toBe(false);
    expect(respaldoPendiente(hecho, a('21:30', 14))).toBe(true);
    const manualTemprano = anotarResultado(cfg, true, a('08:00'), 'manual');
    expect(respaldoPendiente({ ...manualTemprano, ultimoIntento: null }, a('22:00'))).toBe(true);
  });
  it('tras un error reintenta a los 15 minutos y conserva el último OK', () => {
    const ok = anotarResultado(cfg, true, a('10:00', 12), 'manual');
    const fallo = anotarResultado(ok, false, a('21:40'), 'programado', 'Sin red');
    expect(fallo.resultado).toBe('error');
    expect(fallo.mensaje).toBe('Sin red');
    expect(fallo.ultimoOk).toBe(ok.ultimoOk);
    expect(respaldoPendiente(fallo, a('21:50'))).toBe(false);
    expect(respaldoPendiente(fallo, a('21:55'))).toBe(true);
  });
  it('la hora es local del dispositivo', () => {
    const d = horaDelDia('07:05', a('23:00'));
    expect([d.getHours(), d.getMinutes(), d.getDate()]).toEqual([7, 5, 13]);
  });
});
