import { describe, expect, it } from 'vitest';
import {
  CATEGORIAS,
  clasificar,
  normalizar,
  PALABRAS_CLAVE_POR_CATEGORIA,
  REGLAS_CATEGORIA,
} from './clasificador.js';
import { CORREOS_EJEMPLO } from '../../test/fixtures/correos.js';
import { destinosDesde, ESTADOS, puedeTransicionar } from './estados.js';
import {
  PALABRAS_CLAVE_URGENCIA,
  PRIORIDAD_BASE_POR_CATEGORIA,
  PRIORIDADES,
  priorizar,
} from './priorizador.js';

describe('normalizar', () => {
  it('quita tildes y pasa a minúsculas', () => {
    expect(normalizar('CÁMARA de Seguridad — Ñandú')).toBe('camara de seguridad — nandu');
  });
});

describe('clasificar', () => {
  it('es insensible a tildes y mayúsculas', () => {
    expect(clasificar('ROBO EN PARQUEADERO', '')).toBe('SEGURIDAD');
    expect(clasificar('camaras', '')).toBe('SEGURIDAD');
  });

  it('no confunde raíces que son prefijo de otras palabras', () => {
    expect(clasificar('Armario', 'Quiero comprar un armario')).toBe('SIN_CLASIFICAR'); // "arma" ≠ "armario"
  });

  it('el asunto pesa el doble que el cuerpo', () => {
    // asunto: 1 coincidencia de FACTURACION ×2; cuerpo: 1 de MANTENIMIENTO ×1
    expect(clasificar('Cobro', 'hay una fuga')).toBe('FACTURACION');
  });

  it('un empate se resuelve por el orden de prioridad de las categorías', () => {
    expect(clasificar('', 'robo cobro')).toBe('SEGURIDAD');
  });

  it('texto vacío o sin señales va a SIN_CLASIFICAR', () => {
    expect(clasificar('', '')).toBe('SIN_CLASIFICAR');
    expect(clasificar('Hola', 'buenas tardes')).toBe('SIN_CLASIFICAR');
  });

  it('acierta al menos el 80 % del conjunto de ejemplo', () => {
    const fallos = CORREOS_EJEMPLO.filter((c) => clasificar(c.asunto, c.cuerpo) !== c.categoria);
    const acierto = 1 - fallos.length / CORREOS_EJEMPLO.length;
    expect(CORREOS_EJEMPLO.length).toBeGreaterThanOrEqual(30);
    expect(
      acierto,
      `Acierto ${(acierto * 100).toFixed(1)} %. Fallos: ${fallos.map((f) => `"${f.asunto}"→${clasificar(f.asunto, f.cuerpo)}`).join(' | ')}`,
    ).toBeGreaterThanOrEqual(0.8);
  });
});

describe('priorizar', () => {
  it('SEGURIDAD nunca es BAJA, sea cual sea el texto', () => {
    for (const c of CORREOS_EJEMPLO.filter((x) => x.categoria === 'SEGURIDAD')) {
      expect(priorizar('SEGURIDAD', c.asunto, c.cuerpo)).not.toBe('BAJA');
    }
    expect(priorizar('SEGURIDAD', '', '')).toBe('ALTA');
  });

  it('prioridad base por categoría', () => {
    expect(priorizar('MANTENIMIENTO', 'Bombillo', 'quemado')).toBe('MEDIA');
    expect(priorizar('FACTURACION', 'Recibo', 'reenviar')).toBe('BAJA');
    expect(priorizar('ADMINISTRATIVO', 'Certificado', 'por favor')).toBe('BAJA');
    expect(priorizar('SIN_CLASIFICAR', 'Hola', '')).toBe('MEDIA');
  });

  it('una señal de urgencia eleva a ALTA aunque la categoría sea de baja prioridad', () => {
    expect(priorizar('FACTURACION', 'Cobro', 'es urgente, me van a cortar el servicio')).toBe('ALTA');
    expect(priorizar('ADMINISTRATIVO', 'Permiso', 'EMERGENCIA médica en el 302')).toBe('ALTA');
    expect(priorizar('MANTENIMIENTO', 'Ascensor', 'hay una persona atrapada')).toBe('ALTA');
  });

  it('la urgencia nunca baja una prioridad', () => {
    expect(priorizar('SEGURIDAD', 'x', 'nada urgente')).toBe('ALTA');
  });

  it('coincide con la prioridad esperada en el conjunto de ejemplo cuando la categoría es correcta', () => {
    const fallos = CORREOS_EJEMPLO.filter((c) => priorizar(c.categoria, c.asunto, c.cuerpo) !== c.prioridad);
    expect(fallos.map((f) => f.asunto)).toEqual([]);
  });
});

describe('máquina de estados', () => {
  it('permite exactamente las 6 transiciones del modelo', () => {
    const permitidas = ESTADOS.flatMap((o) => ESTADOS.filter((d) => puedeTransicionar(o, d)).map((d) => `${o}>${d}`));
    expect(permitidas.sort()).toEqual(
      ['NUEVA>ASIGNADA', 'ASIGNADA>EN_PROCESO', 'EN_PROCESO>RESUELTA', 'RESUELTA>CERRADA', 'RESUELTA>EN_PROCESO', 'ASIGNADA>NUEVA'].sort(),
    );
  });

  it('CERRADA es final y ningún estado transiciona a sí mismo', () => {
    expect(destinosDesde('CERRADA')).toEqual([]);
    for (const e of ESTADOS) expect(puedeTransicionar(e, e)).toBe(false);
  });
});

describe('metadatos puros de dominio (catálogos)', () => {
  it('expone reglas y palabras clave derivadas de REGLAS para cada categoría sin bordes \\b', () => {
    expect(REGLAS_CATEGORIA.map((r) => r.categoria)).toEqual([
      'SEGURIDAD',
      'MANTENIMIENTO',
      'FACTURACION',
      'ADMINISTRATIVO',
    ]);
    for (const cat of CATEGORIAS) {
      const palabras = PALABRAS_CLAVE_POR_CATEGORIA[cat];
      expect(Array.isArray(palabras)).toBe(true);
      if (cat === 'SIN_CLASIFICAR') {
        expect(palabras).toEqual([]);
      } else {
        expect(palabras.length).toBeGreaterThan(0);
        for (const p of palabras) expect(p).not.toContain('\\b');
      }
    }
    expect(PALABRAS_CLAVE_POR_CATEGORIA.SEGURIDAD).toContain('robo');
    expect(PALABRAS_CLAVE_POR_CATEGORIA.MANTENIMIENTO).toContain('fuga');
    expect(PALABRAS_CLAVE_POR_CATEGORIA.FACTURACION).toContain('factura');
    expect(PALABRAS_CLAVE_POR_CATEGORIA.ADMINISTRATIVO).toContain('asamblea');
  });

  it('expone prioridad base por categoría y palabras clave de urgencia coherentes con priorizar', () => {
    for (const cat of CATEGORIAS) {
      const base = PRIORIDAD_BASE_POR_CATEGORIA[cat];
      expect(PRIORIDADES).toContain(base);
      expect(priorizar(cat, 'hola', 'buenos dias')).toBe(base);
    }
    expect(PRIORIDAD_BASE_POR_CATEGORIA).toEqual({
      SEGURIDAD: 'ALTA',
      MANTENIMIENTO: 'MEDIA',
      FACTURACION: 'BAJA',
      ADMINISTRATIVO: 'BAJA',
      SIN_CLASIFICAR: 'MEDIA',
    });
    expect(PALABRAS_CLAVE_URGENCIA.length).toBeGreaterThan(0);
    for (const p of PALABRAS_CLAVE_URGENCIA) expect(p).not.toContain('\\b');
    expect(PALABRAS_CLAVE_URGENCIA).toContain('urgente');
    expect(PALABRAS_CLAVE_URGENCIA).toContain('fuga de gas');
  });
});
