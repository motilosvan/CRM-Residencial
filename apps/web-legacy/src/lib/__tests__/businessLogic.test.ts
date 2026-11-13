import { describe, it, expect } from 'vitest';
import { maskPII } from '../piiMasker';
import { classifyByKeywords } from '../keywordClassifier';
import { computeKpis } from '../kpiCalculator';
import { Solicitud } from '../../types/domain';

describe('Pruebas de Lógica de Negocio SOC-CRM', () => {
  it('maskPII oculta teléfonos, correos y cédulas colombianas correctamente', () => {
    const raw =
      'Buenas tardes, soy Carlos Ruiz con CC 79.845.123, mi celular es +57 310 456 7890 y mi correo carlos.ruiz@gmail.com.\n> Cita anterior';
    const result = maskPII(raw);

    expect(result.maskedText).toContain('CC [DOC_PROTEGIDO]');
    expect(result.maskedText).toContain('[TEL_PROTEGIDO]');
    expect(result.maskedText).toContain('[CORREO_PROTEGIDO]');
    expect(result.maskedText).not.toContain('79.845.123');
    expect(result.maskedText).not.toContain('310 456 7890');
    expect(result.maskedText).not.toContain('> Cita anterior');
    expect(result.detectedItems).toEqual({ emails: 1, phones: 1, ids: 1 });
  });

  it('classifyByKeywords asigna Prioridad Alta y Categoría Mantenimiento ante fuga e inundación', () => {
    const text = 'Urgente hay una fuga de agua terrible e inundación en el sótano 1 del parqueadero';
    const res = classifyByKeywords(text);

    expect(res.categoria).toBe('Mantenimiento');
    expect(res.prioridad).toBe('Alta');
    expect(res.origen).toBe('Reglas');
    expect(res.pendienteRevisionReglas).toBe(true);
  });

  it('computeKpis calcula correctamente los indicadores desde un arreglo de solicitudes', () => {
    const mockRequests: Partial<Solicitud>[] = [
      {
        id: '1',
        estado: 'Pendiente de validación',
        prioridad: 'Alta',
      },
      {
        id: '2',
        estado: 'Resuelta',
        prioridad: 'Alta',
        tiempoRespuestaHoras: 4,
        huboModificacionAlValidar: false,
      },
      {
        id: '3',
        estado: 'En proceso',
        prioridad: 'Baja',
        tiempoRespuestaHoras: 8,
        huboModificacionAlValidar: true,
      },
    ];

    const kpis = computeKpis(mockRequests as Solicitud[]);
    expect(kpis.pendientesValidar).toBe(1);
    expect(kpis.urgentesAbiertas).toBe(1);
    expect(kpis.resueltasMes).toBe(1);
    expect(kpis.tiempoPromedioRespuestaHoras).toBe(6);
    expect(kpis.porcentajeAprobadasSinCambios).toBe(50);
    expect(kpis.porcentajeUrgentesAlta).toBe(67);
  });
});
