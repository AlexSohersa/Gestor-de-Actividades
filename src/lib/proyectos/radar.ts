import "server-only";

import { cache } from "react";
import { db } from "@/lib/db/client";
import { deFechaDia } from "@/lib/fechas";

/**
 * Reunión de radar: el estatus de un proyecto por sus horas.
 *
 * Es el tablero de Looker Studio traído a la plataforma. El cálculo es el
 * mismo; lo que cambia es de dónde salen los dos lados de la balanza:
 * lo registrado ya no es `HistoricHours` filtrado por NOMBRE de proyecto sino
 * `actividad.hora` por `proyecto_codigo`, y lo cotizado es
 * `actividad.hora_cotizada`. Cruzar por código y no por texto es lo que evita
 * que "SOH-2024-011" y "SOH 2024 011" cuenten como dos proyectos.
 *
 * Se cuentan TODAS las horas, no solo las importadas de la hoja: lo reportado
 * desde la plataforma consume presupuesto igual que lo demás, y dejarlo fuera
 * haría ver disponible un proyecto que ya se pasó.
 */

export type PuntoDia = {
  /** `aaaa-mm-dd`, para el eje. */
  iso: string;
  horas: number;
  /** Lo acumulado hasta ese día: la línea verde del tablero. */
  acumulado: number;
};

/** Un mes de la serie, para cuando la vista diaria es ilegible. */
export type PuntoMes = {
  /** `aaaa-mm`. */
  clave: string;
  /** "ago", para el eje. */
  etiqueta: string;
  anio: number;
  horas: number;
  acumulado: number;
};

export type Reparto = {
  nombre: string;
  horas: number;
  /** Del total, de 0 a 1. */
  parte: number;
};

export type EntregableRadar = {
  nombre: string;
  cotizadas: number;
  registradas: number;
  /** Lo consumido sobre lo cotizado. `null` si no se cotizó. */
  uso: number | null;
};

export type RadarProyecto = {
  proyecto: string;
  cliente: string | null;
  cotizadas: number;
  registradas: number;
  /** Porcentaje de uso, redondeado. `null` si no hay horas cotizadas. */
  uso: number | null;
  disponibles: number | null;
  personas: number;
  /** Días con actividad, y la media de horas de esos días. */
  diasConRegistro: number;
  mediaDiaria: number;
  /** El día que más horas llevó, para dimensionar los picos. */
  pico: { iso: string; horas: number } | null;
  /** Primer y último día con registro, en ISO. */
  desde: string | null;
  hasta: string | null;
  serie: PuntoDia[];
  /** La misma serie por mes, para proyectos largos. */
  meses: PuntoMes[];
  esfuerzos: Reparto[];
  colaboradores: Reparto[];
  entregables: EntregableRadar[];
  /** Entregables que ya pasaron de sus horas cotizadas. */
  pasados: number;
};

/** Un proyecto en el selector, con lo justo para ordenarlos. */
export type ProyectoEnLista = {
  nombre: string;
  registradas: number;
  cotizadas: number;
  uso: number | null;
};

/** Una fila de horas ya normalizada para el cálculo del radar. */
type FilaRadar = {
  /** El día como `aaaa-mm-dd`: la única forma en que se agrupa y se ordena. */
  iso: string;
  horas: number;
  entregable: string;
  esfuerzo: string | null;
  colaborador: string;
};

/**
 * Los proyectos que tienen horas, del más consumido al menos.
 *
 * Solo los que registraron algo: un proyecto cotizado en el que nadie ha
 * trabajado no tiene estatus que consultar.
 */
export const proyectosConHoras = cache(async function proyectosConHoras(): Promise<
  ProyectoEnLista[]
> {
  const [reg, cot, padron] = await Promise.all([
    db.hora.groupBy({
      by: ["proyectoCodigo"],
      where: { proyectoCodigo: { not: null } },
      _sum: { horas: true },
    }),
    db.horaCotizada.groupBy({
      by: ["proyectoCodigo"],
      _sum: { horas: true },
    }),
    db.proyecto.findMany({ select: { codigo: true, nombre: true } }),
  ]);

  // La pantalla identifica el proyecto por su NOMBRE (es lo que enseña y lo que
  // pone en la dirección), pero las horas cuelgan del código: este padrón es el
  // puente entre los dos.
  const nombrePorCodigo = new Map(padron.map((p) => [p.codigo, p.nombre]));

  const cotPorCodigo = new Map(
    cot.map((c) => [c.proyectoCodigo, Number(c._sum.horas ?? 0)]),
  );

  return reg
    .map((r) => {
      // `proyectoCodigo` no es null: el `where` ya lo filtró, pero groupBy lo
      // sigue tipando como nullable.
      const codigo = r.proyectoCodigo ?? "";
      const registradas = Number(r._sum.horas ?? 0);
      const cotizadas = cotPorCodigo.get(codigo) ?? 0;
      return {
        // Sin nombre en el padrón se muestra el código: perder la fila sería
        // esconder horas reales de la lista.
        nombre: nombrePorCodigo.get(codigo) ?? codigo,
        registradas,
        cotizadas,
        uso: cotizadas > 0 ? Math.round((registradas / cotizadas) * 100) : null,
      };
    })
    .sort((a, b) => b.registradas - a.registradas);
});

/**
 * Todo lo que necesita el tablero de un proyecto.
 *
 * `proyecto` llega como el NOMBRE que enseña la lista; también se acepta el
 * código por si la dirección se escribe a mano.
 *
 * `meses` acota por meses hacia atrás; `null` es toda la historia, que es lo
 * que interesa al mirar cuánto se lleva consumido de lo cotizado.
 */
export const radarDeProyecto = cache(async function radarDeProyecto(
  proyecto: string,
  meses: number | null = null,
): Promise<RadarProyecto | null> {
  if (!proyecto) return null;

  const padron = await db.proyecto.findFirst({
    where: { OR: [{ codigo: proyecto }, { nombre: proyecto }] },
    select: { codigo: true, nombre: true, cliente: { select: { nombre: true } } },
  });
  if (!padron) return null;

  const desde = meses
    ? (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - meses);
        return d;
      })()
    : undefined;

  const [filasPrisma, cotizadasFilas] = await Promise.all([
    db.hora.findMany({
      where: {
        proyectoCodigo: padron.codigo,
        ...(desde ? { fecha: { gte: desde } } : {}),
      },
      orderBy: { fecha: "asc" },
      select: {
        fecha: true,
        horas: true,
        esfuerzo: true,
        entregableTexto: true,
        entregable: { select: { nombre: true } },
        persona: { select: { nombre: true } },
      },
    }),
    db.horaCotizada.findMany({
      where: { proyectoCodigo: padron.codigo },
      select: { entregable: true, horas: true },
    }),
  ]);

  if (filasPrisma.length === 0 && cotizadasFilas.length === 0) return null;

  const filas: FilaRadar[] = filasPrisma.map((f) => ({
    // `fecha` es columna `date` a medianoche UTC: sacarle el día con métodos
    // locales lo correría un día en cualquier zona negativa, que es la nuestra.
    iso: deFechaDia(f.fecha),
    // `horas` es Decimal de Prisma: sin Number() las sumas concatenarían.
    horas: Number(f.horas),
    // El nombre del padrón manda; si la hora vino de la hoja con un entregable
    // que nadie dio de alta, se conserva el texto original.
    entregable: f.entregable?.nombre ?? f.entregableTexto ?? "GENERAL",
    esfuerzo: f.esfuerzo,
    colaborador: f.persona.nombre,
  }));

  const registradas = filas.reduce((n, f) => n + f.horas, 0);
  const cotizadas = cotizadasFilas.reduce((n, c) => n + Number(c.horas), 0);

  /* ------------------------------------------------ serie diaria ----- */
  const porDia = new Map<string, number>();
  for (const f of filas) {
    porDia.set(f.iso, (porDia.get(f.iso) ?? 0) + f.horas);
  }
  let acumulado = 0;
  const serie: PuntoDia[] = [...porDia.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, horas]) => {
      acumulado += horas;
      return { iso: k, horas, acumulado };
    });

  /* ------------------------------------------------- repartos -------- */
  const agrupar = (clave: (f: FilaRadar) => string): Reparto[] => {
    const m = new Map<string, number>();
    for (const f of filas) {
      const k = clave(f);
      m.set(k, (m.get(k) ?? 0) + f.horas);
    }
    const total = [...m.values()].reduce((n, v) => n + v, 0) || 1;
    return [...m.entries()]
      .map(([nombre, horas]) => ({ nombre, horas, parte: horas / total }))
      .sort((a, b) => b.horas - a.horas);
  };

  /* --------------------------------------------- por entregable ------ */
  const regPorEnt = new Map<string, number>();
  for (const f of filas) {
    const k = f.entregable.trim() || "GENERAL";
    regPorEnt.set(k, (regPorEnt.get(k) ?? 0) + f.horas);
  }
  const cotPorEnt = new Map<string, number>();
  for (const c of cotizadasFilas) {
    const k = c.entregable.trim() || "GENERAL";
    cotPorEnt.set(k, (cotPorEnt.get(k) ?? 0) + Number(c.horas));
  }

  /*
   * Se listan los entregables de los dos lados: uno cotizado sin horas es
   * trabajo que no ha empezado, y uno con horas sin cotizar es trabajo que
   * nadie presupuestó. Las dos cosas importan en una reunión de radar.
   */
  const entregables: EntregableRadar[] = [
    ...new Set([...regPorEnt.keys(), ...cotPorEnt.keys()]),
  ]
    .map((nombre) => {
      const reg = regPorEnt.get(nombre) ?? 0;
      const cot = cotPorEnt.get(nombre) ?? 0;
      return {
        nombre,
        cotizadas: cot,
        registradas: reg,
        uso: cot > 0 ? reg / cot : null,
      };
    })
    // Primero lo más pasado de horas, que es lo que hay que mirar.
    .sort(
      (a, b) => (b.uso ?? -1) - (a.uso ?? -1) || b.registradas - a.registradas,
    );

  const pico = serie.reduce<PuntoDia | null>(
    (may, p) => (!may || p.horas > may.horas ? p : may),
    null,
  );

  /*
   * La misma serie agrupada por mes.
   *
   * Con dos años de proyecto, la vista diaria son cientos de barras de un
   * píxel: se ve el ritmo pero no se lee ninguna. Por mes son doce barras con
   * su nombre debajo, y ahí sí se distingue qué mes se disparó.
   */
  const porMes = new Map<string, number>();
  for (const f of filas) {
    // Los siete primeros caracteres de aaaa-mm-dd son justo aaaa-mm.
    const k = f.iso.slice(0, 7);
    porMes.set(k, (porMes.get(k) ?? 0) + f.horas);
  }
  let acumMes = 0;
  const serieMensual: PuntoMes[] = [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, horas]) => {
      acumMes += horas;
      const [anio, mes] = clave.split("-").map(Number);
      const d = new Date(Date.UTC(anio, mes - 1, 1));
      return {
        clave,
        etiqueta: new Intl.DateTimeFormat("es-MX", {
          timeZone: "UTC",
          month: "short",
        })
          .format(d)
          .replace(".", ""),
        anio,
        horas,
        acumulado: acumMes,
      };
    });

  return {
    proyecto: padron.nombre,
    cliente: padron.cliente?.nombre ?? null,
    cotizadas,
    registradas,
    uso: cotizadas > 0 ? Math.round((registradas / cotizadas) * 100) : null,
    disponibles: cotizadas > 0 ? cotizadas - registradas : null,
    personas: new Set(filas.map((f) => f.colaborador)).size,
    diasConRegistro: serie.length,
    // Se divide entre los días CON actividad, no entre los del calendario: un
    // proyecto que solo se toca los martes no trabaja a media máquina.
    mediaDiaria: serie.length > 0 ? registradas / serie.length : 0,
    pico: pico ? { iso: pico.iso, horas: pico.horas } : null,
    desde: serie[0]?.iso ?? null,
    hasta: serie.at(-1)?.iso ?? null,
    serie,
    meses: serieMensual,
    esfuerzos: agrupar((f) => f.esfuerzo?.trim() || "SIN CLASIFICAR"),
    colaboradores: agrupar((f) => f.colaborador),
    entregables,
    pasados: entregables.filter((e) => e.uso !== null && e.uso > 1).length,
  };
});
