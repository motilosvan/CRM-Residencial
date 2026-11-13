import { KpiResumen, Solicitud } from '../types/domain';

export function computeKpis(requests: Solicitud[]): KpiResumen {
  if (requests.length === 0) {
    return {
      pendientesValidar: 0,
      urgentesAbiertas: 0,
      tiempoPromedioRespuestaHoras: 0,
      resueltasMes: 0,
      porcentajeAprobadasSinCambios: 0,
      porcentajeUrgentesAlta: 0,
    };
  }

  const pendientesValidar = requests.filter(
    (r) => r.estado === 'Pendiente de validación'
  ).length;

  const urgentesAbiertas = requests.filter(
    (r) =>
      r.prioridad === 'Alta' &&
      r.estado !== 'Resuelta' &&
      r.estado !== 'Cerrada'
  ).length;

  const conTiempo = requests.filter(
    (r) => typeof r.tiempoRespuestaHoras === 'number' && r.tiempoRespuestaHoras > 0
  );
  const tiempoPromedioRespuestaHoras =
    conTiempo.length > 0
      ? Number(
          (
            conTiempo.reduce((acc, item) => acc + (item.tiempoRespuestaHoras ?? 0), 0) /
            conTiempo.length
          ).toFixed(1)
        )
      : 0;

  const resueltasMes = requests.filter(
    (r) => r.estado === 'Resuelta' || r.estado === 'Cerrada'
  ).length;

  const validadas = requests.filter((r) => r.estado !== 'Pendiente de validación');
  const aprobadasSinCambios = validadas.filter(
    (r) => r.huboModificacionAlValidar === false
  ).length;

  const porcentajeAprobadasSinCambios =
    validadas.length > 0
      ? Math.round((aprobadasSinCambios / validadas.length) * 100)
      : 0;

  const porcentajeUrgentesAlta = Math.round(
    (requests.filter((r) => r.prioridad === 'Alta').length / requests.length) * 100
  );

  return {
    pendientesValidar,
    urgentesAbiertas,
    tiempoPromedioRespuestaHoras,
    resueltasMes,
    porcentajeAprobadasSinCambios,
    porcentajeUrgentesAlta,
  };
}
