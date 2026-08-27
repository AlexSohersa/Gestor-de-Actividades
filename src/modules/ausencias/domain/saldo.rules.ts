// Módulo Ausencias · DOMINIO · Saldo de vacaciones.
//
// Cómo se acumulan, se liberan, se consumen y se vencen los días de vacaciones.
// Lógica pura: entran bloques y una fecha, sale un saldo.

/**
 * Un bloque de vacaciones: los días que corresponden a un periodo de
 * antigüedad, con su fecha de vencimiento.
 *
 * La ley mexicana da días por año trabajado y concede doce meses para tomarlos.
 * De ahí que cada bloque tenga periodo y vencimiento: lo del periodo 1 no se
 * mezcla con lo del 3, y lo que no se toma a tiempo se pierde.
 */
export interface Bloque {
  periodo: number;
  dias: number;
  /// Cuándo se pierde lo no tomado de este bloque. Null = no vence.
  venceEn: string | null; // AAAA-MM-DD
}

/// Un bloque con lo ya consumido, que se calcula desde las ausencias aprobadas.
export interface BloqueConUso extends Bloque {
  usados: number;
}

export interface Saldo {
  /// Días que se pueden tomar hoy.
  disponibles: number;
  /// Días ya tomados (ausencias aprobadas que descuentan saldo).
  usados: number;
  /// Días que se perdieron por no tomarlos a tiempo.
  vencidos: number;
  /// Total otorgado a lo largo de la relación laboral.
  otorgados: number;
  /// El siguiente vencimiento, para poder avisar.
  proximoVencimiento: { fecha: string; dias: number } | null;
  /// Detalle por periodo, de más antiguo a más nuevo.
  porPeriodo: Array<BloqueConUso & { disponibles: number; vencido: boolean }>;
}

/**
 * Calcula el saldo a una fecha dada.
 *
 * El consumo se reparte por ANTIGÜEDAD (el periodo más viejo primero): así se
 * gastan antes los días que están a punto de vencer, que es lo que conviene a
 * la persona. Es la misma regla del gestor anterior, pero aquí se aplica sobre
 * el total en lugar de ir marcando bloque por bloque, lo que evita el problema
 * que tenía: si el proceso fallaba a media lista, unos bloques quedaban
 * actualizados y otros no, y el saldo quedaba mal para siempre.
 *
 * Ahora `usados` se deriva de las ausencias aprobadas cada vez que se pregunta.
 * No hay estado que corromper: si se cancela una ausencia, el saldo vuelve solo.
 */
export function calcularSaldo(
  bloques: Bloque[],
  diasConsumidos: number,
  hoyISO: string,
): Saldo {
  const ordenados = [...bloques].sort((a, b) => a.periodo - b.periodo);

  let porRepartir = diasConsumidos;
  const detalle = ordenados.map((b) => {
    const usados = Math.min(b.dias, porRepartir);
    porRepartir = Math.round((porRepartir - usados) * 100) / 100;

    const vencido = b.venceEn !== null && b.venceEn < hoyISO;
    const restantes = Math.round((b.dias - usados) * 100) / 100;

    return {
      ...b,
      usados: Math.round(usados * 100) / 100,
      // Lo vencido ya no se puede tomar, aunque quede sin usar.
      disponibles: vencido ? 0 : restantes,
      vencido,
    };
  });

  const disponibles = detalle.reduce((t, d) => t + d.disponibles, 0);
  const vencidos = detalle
    .filter((d) => d.vencido)
    .reduce((t, d) => t + (d.dias - d.usados), 0);

  // El próximo vencimiento con días aún por tomar: avisar de uno ya agotado
  // sería ruido.
  const proximo = detalle
    .filter((d) => !d.vencido && d.venceEn !== null && d.disponibles > 0)
    .sort((a, b) => (a.venceEn ?? "").localeCompare(b.venceEn ?? ""))[0];

  return {
    disponibles: Math.round(disponibles * 100) / 100,
    usados: Math.round(diasConsumidos * 100) / 100,
    vencidos: Math.round(vencidos * 100) / 100,
    otorgados: Math.round(ordenados.reduce((t, b) => t + b.dias, 0) * 100) / 100,
    proximoVencimiento: proximo
      ? { fecha: proximo.venceEn!, dias: proximo.disponibles }
      : null,
    porPeriodo: detalle,
  };
}

/**
 * De qué periodo salen los días de una solicitud nueva.
 *
 * El más antiguo con saldo: es el que primero vence. Se guarda en la ausencia
 * para poder explicar de dónde se descontó.
 */
export function periodoQueSeConsume(saldo: Saldo): number | null {
  const bloque = saldo.porPeriodo.find((b) => !b.vencido && b.disponibles > 0);
  return bloque?.periodo ?? null;
}
