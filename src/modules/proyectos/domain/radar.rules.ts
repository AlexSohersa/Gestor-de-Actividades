// Módulo Proyectos · DOMINIO · El radar de horas.
//
// Cruza lo COTIZADO con lo REGISTRADO para responder la pregunta que importa:
// ¿en qué se está yendo el tiempo de este proyecto, y alcanza?
//
// Lógica pura: entran dos listas de horas, sale el análisis.

/// Una hora registrada, reducida a lo que el radar necesita.
export interface HoraRegistrada {
  fecha: string; // AAAA-MM-DD
  horas: number;
  entregable: string | null;
  disciplina: string | null;
  esfuerzo: string | null;
  persona: string;
}

/// Una hora cotizada por entregable.
export interface HoraCotizada {
  entregable: string;
  disciplina: string | null;
  horas: number;
}

export interface LineaEntregable {
  entregable: string;
  cotizadas: number;
  registradas: number;
  /// Cotizadas menos registradas. Negativo = se pasó del presupuesto.
  disponibles: number;
  /// Porcentaje consumido. `null` cuando no hay cotización con la que comparar.
  uso: number | null;
  /// Si se pasó de lo cotizado.
  excedido: boolean;
  /// Si hay horas cotizadas pero nadie ha trabajado en él.
  sinEmpezar: boolean;
  /// Si hay horas trabajadas pero no estaba cotizado.
  noPresupuestado: boolean;
}

export interface Radar {
  cotizadas: number;
  registradas: number;
  disponibles: number;
  uso: number | null;
  /// Cuántos entregables se pasaron de lo cotizado.
  excedidos: number;
  entregables: LineaEntregable[];
  porPersona: Array<{ clave: string; horas: number; porcentaje: number }>;
  porEsfuerzo: Array<{ clave: string; horas: number; porcentaje: number }>;
  porDisciplina: Array<{ clave: string; horas: number; porcentaje: number }>;
  /// Serie mensual acumulada, para ver el ritmo de consumo.
  serie: Array<{ mes: string; horas: number; acumulado: number }>;
  /// Días con actividad y media diaria sobre esos días.
  diasConActividad: number;
  mediaDiaria: number;
  primerDia: string | null;
  ultimoDia: string | null;
}

/// Normaliza la clave de un entregable: lo que viene vacío se agrupa bajo
/// GENERAL, que es como lo trataba el gestor antiguo.
function claveEntregable(valor: string | null): string {
  return valor?.trim() || "GENERAL";
}

function agrupar(
  horas: HoraRegistrada[],
  dimension: (h: HoraRegistrada) => string | null,
): Array<{ clave: string; horas: number; porcentaje: number }> {
  const mapa = new Map<string, number>();
  for (const h of horas) {
    const clave = dimension(h)?.trim() || "SIN CLASIFICAR";
    mapa.set(clave, (mapa.get(clave) ?? 0) + h.horas);
  }

  const total = [...mapa.values()].reduce((t, v) => t + v, 0);
  if (total === 0) return [];

  return [...mapa.entries()]
    .map(([clave, h]) => ({
      clave,
      horas: Math.round(h * 100) / 100,
      porcentaje: Math.round((h / total) * 100),
    }))
    .sort((a, b) => b.horas - a.horas);
}

export function calcularRadar(
  registradas: HoraRegistrada[],
  cotizadas: HoraCotizada[],
): Radar {
  const totalRegistradas =
    Math.round(registradas.reduce((t, h) => t + h.horas, 0) * 100) / 100;
  const totalCotizadas =
    Math.round(cotizadas.reduce((t, h) => t + h.horas, 0) * 100) / 100;

  // ── Entregables: la UNIÓN de los cotizados y los trabajados ──────────────
  // Un cotizado sin horas es trabajo que no ha empezado; uno con horas y sin
  // cotizar es trabajo que nadie presupuestó. Las dos cosas hay que verlas.
  const regPorEnt = new Map<string, number>();
  for (const h of registradas) {
    const k = claveEntregable(h.entregable);
    regPorEnt.set(k, (regPorEnt.get(k) ?? 0) + h.horas);
  }

  const cotPorEnt = new Map<string, number>();
  for (const c of cotizadas) {
    const k = claveEntregable(c.entregable);
    cotPorEnt.set(k, (cotPorEnt.get(k) ?? 0) + c.horas);
  }

  const claves = new Set([...regPorEnt.keys(), ...cotPorEnt.keys()]);

  const entregables: LineaEntregable[] = [...claves]
    .map((entregable) => {
      const reg = Math.round((regPorEnt.get(entregable) ?? 0) * 100) / 100;
      const cot = Math.round((cotPorEnt.get(entregable) ?? 0) * 100) / 100;

      return {
        entregable,
        cotizadas: cot,
        registradas: reg,
        disponibles: Math.round((cot - reg) * 100) / 100,
        uso: cot > 0 ? Math.round((reg / cot) * 100) : null,
        excedido: cot > 0 && reg > cot,
        sinEmpezar: cot > 0 && reg === 0,
        noPresupuestado: cot === 0 && reg > 0,
      };
    })
    // Lo más consumido arriba: es donde está el riesgo.
    .sort((a, b) => (b.uso ?? 999) - (a.uso ?? 999) || b.registradas - a.registradas);

  // ── Serie mensual con acumulado ──────────────────────────────────────────
  const porMes = new Map<string, number>();
  for (const h of registradas) {
    const mes = h.fecha.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + h.horas);
  }

  let acumulado = 0;
  const serie = [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, horas]) => {
      acumulado = Math.round((acumulado + horas) * 100) / 100;
      return { mes, horas: Math.round(horas * 100) / 100, acumulado };
    });

  const dias = [...new Set(registradas.map((h) => h.fecha))].sort();

  return {
    cotizadas: totalCotizadas,
    registradas: totalRegistradas,
    disponibles: Math.round((totalCotizadas - totalRegistradas) * 100) / 100,
    uso:
      totalCotizadas > 0
        ? Math.round((totalRegistradas / totalCotizadas) * 100)
        : null,
    excedidos: entregables.filter((e) => e.excedido).length,
    entregables,
    porPersona: agrupar(registradas, (h) => h.persona),
    porEsfuerzo: agrupar(registradas, (h) => h.esfuerzo),
    porDisciplina: agrupar(registradas, (h) => h.disciplina),
    serie,
    diasConActividad: dias.length,
    mediaDiaria:
      dias.length > 0 ? Math.round((totalRegistradas / dias.length) * 100) / 100 : 0,
    primerDia: dias[0] ?? null,
    ultimoDia: dias[dias.length - 1] ?? null,
  };
}

/// Cómo se lee un porcentaje de uso, para pintarlo.
export function semaforo(uso: number | null): "bien" | "atencion" | "excedido" {
  if (uso === null) return "bien";
  if (uso > 100) return "excedido";
  if (uso >= 85) return "atencion";
  return "bien";
}
