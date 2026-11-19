import { describe, expect, it } from 'vitest';
import { enmascarar } from './enmascarar.js';

describe('enmascarar · documentos y números', () => {
  it('oculta la cédula completa, también la de 10 dígitos con puntos', () => {
    expect(enmascarar('Mi cédula es CC 79.321.654.')).toBe('Mi cédula es CC [DOC_PROTEGIDO].');
    const r = enmascarar('Mi cédula es CC 1.023.456.789 gracias');
    expect(r).toBe('Mi cédula es CC [DOC_PROTEGIDO] gracias');
    expect(r).not.toContain('789');
    expect(enmascarar('c.c. 1023456789')).toBe('c.c. [DOC_PROTEGIDO]');
    expect(enmascarar('Identificación No. 52 123 456')).toBe('Identificación No. [DOC_PROTEGIDO]');
    expect(enmascarar('NIT 900.123.456-7')).toBe('NIT [DOC_PROTEGIDO]');
  });

  it('oculta celulares y fijos colombianos en sus formatos habituales', () => {
    expect(enmascarar('Llamar al 310 555 1234')).toBe('Llamar al [TEL_PROTEGIDO]');
    expect(enmascarar('Llamar al +57 310-555-12-34')).toBe('Llamar al [TEL_PROTEGIDO]');
    expect(enmascarar('Mi fijo es 601 555 1234')).toBe('Mi fijo es [TEL_PROTEGIDO]');
    expect(enmascarar('Mi fijo es (604) 444 5566')).toContain('[TEL_PROTEGIDO]');
  });

  it('cualquier cifra larga sin rótulo también se oculta; las cortas no', () => {
    expect(enmascarar('Cuenta 0012345678901')).toBe('Cuenta [NUMERO_PROTEGIDO]');
    expect(enmascarar('Mi documento: 79321654')).not.toContain('79321654');
    expect(enmascarar('Hay 3 goteras desde hace 12 días y pagué 50000')).toBe('Hay 3 goteras desde hace 12 días y pagué 50000');
  });
});

describe('enmascarar · ubicación y vehículo', () => {
  it('oculta torre, apartamento y dirección', () => {
    expect(enmascarar('Vivo en Torre 2 Apto 504')).toBe('Vivo en [UNIDAD_PROTEGIDA] [UNIDAD_PROTEGIDA]');
    expect(enmascarar('Soy del T2-504')).toBe('Soy del [UNIDAD_PROTEGIDA]');
    expect(enmascarar('Queda en la Calle 10 # 20-30')).toBe('Queda en la [DIRECCION_PROTEGIDA]');
    expect(enmascarar('Carrera 7A No. 45-12, Bogotá')).toBe('[DIRECCION_PROTEGIDA], Bogotá');
  });

  it('oculta placas sin confundirlas con palabras seguidas de números', () => {
    expect(enmascarar('Mi carro placa ABC123 y la moto DEF-45G')).toBe('Mi carro placa [PLACA_PROTEGIDA] y la moto [PLACA_PROTEGIDA]');
    expect(enmascarar('Somos los 300 vecinos del mes 123')).toBe('Somos los 300 vecinos del mes 123');
  });
});

describe('enmascarar · contacto', () => {
  it('oculta correos y enlaces (pueden llevar identificadores)', () => {
    expect(enmascarar('Escribir a ana.perez@mail.com')).toBe('Escribir a [CORREO_PROTEGIDO]');
    expect(enmascarar('Vea https://banco.co/pago?cuenta=123 ya')).toBe('Vea [ENLACE_PROTEGIDO] ya');
  });
});

describe('enmascarar · nombres', () => {
  it('oculta el nombre conocido del residente, completo o por partes, solo como palabra entera', () => {
    const nombres = ['Ana Pérez'];
    expect(enmascarar('Habla Ana Pérez del conjunto', { nombres })).toBe('Habla [NOMBRE_PROTEGIDO] del conjunto');
    expect(enmascarar('La señora pérez reportó la fuga', { nombres })).toBe('La señora [NOMBRE_PROTEGIDO] reportó la fuga');
    expect(enmascarar('La banana y la manzana', { nombres })).toBe('La banana y la manzana');
    expect(enmascarar('Soy Ángel', { nombres: ['Ángel Ríos'] })).toBe('Soy [NOMBRE_PROTEGIDO]');
  });

  it('un nombre conocido con caracteres de expresión regular no rompe el enmascarado', () => {
    expect(enmascarar('Pregunta de Ana (Pérez)', { nombres: ['(Pérez)', null, undefined, ''] })).toBe('Pregunta de Ana [NOMBRE_PROTEGIDO]');
  });

  it('detecta presentaciones aunque el nombre no esté registrado', () => {
    expect(enmascarar('Buenas tardes, soy Carlos Ríos y escribo por la fuga')).toBe('Buenas tardes, soy [NOMBRE_PROTEGIDO] y escribo por la fuga');
    expect(enmascarar('Mi nombre es María José Gómez.')).toBe('Mi nombre es [NOMBRE_PROTEGIDO].');
    expect(enmascarar('Soy propietaria del apartamento')).toBe('Soy propietaria del apartamento');
  });
});

describe('enmascarar · historial y firma', () => {
  it('elimina la firma después de una despedida al final del correo', () => {
    const correo = 'Hay una fuga en el baño.\n\nGracias,\nAna Pérez\nTorre 2 - Apto 504\nCel. 3105551234';
    expect(enmascarar(correo)).toBe('Hay una fuga en el baño.');
  });

  it('no corta el cuerpo por un "gracias" al inicio de un correo largo', () => {
    const lineas = ['Gracias', ...Array.from({ length: 12 }, (_, i) => `Detalle ${i}`)];
    expect(enmascarar(lineas.join('\n'))).toContain('Detalle 11');
  });

  it('elimina respuestas citadas, historial y firma con "--"', () => {
    expect(enmascarar('Sigue la fuga.\n> Mensaje anterior\n> con datos')).toBe('Sigue la fuga.');
    expect(enmascarar('Sigue la fuga.\n\nEl lun, 2 nov 2026 a las 10:00, Ana <ana@mail.com> escribió:\n> hola')).toBe('Sigue la fuga.');
    expect(enmascarar('Sigue la fuga.\n--\nAna Pérez\n3105551234')).toBe('Sigue la fuga.');
  });

  it('el correo de ejemplo completo no deja datos personales a la vista', () => {
    const correo = `Buenas tardes,

Desde anoche hay una fuga de agua en la tubería del baño principal.

Quedo atenta. Mi celular es 310 555 1234 y mi cédula es CC 79.321.654.

Gracias,
Ana Pérez
Torre 2 - Apto 504`;
    const r = enmascarar(correo);
    for (const dato of ['310 555', '79.321', 'Ana', 'Pérez', '504']) expect(r).not.toContain(dato);
    expect(r).toContain('fuga de agua en la tubería');
  });
});
