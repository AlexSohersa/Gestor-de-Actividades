import "server-only";

import { cache } from "react";
import { db } from "@/lib/db/client";

/**
 * El reporte semanal: en qué se trabajó y cuánto presupuesto queda.
 *
 * Responde la pregunta del lunes por la mañana —"¿en qué anduvimos y cuál va
 * apretado?"— sin abrir proyecto por proyecto. Vive aparte del radar porque
 * mira otra cosa: el radar parte de un proyecto y cuenta su historia; esto
 * parte de la semana y dice qué se movió.
 *
 * Alimenta la pestaña y el correo de los lunes con la MISMA función, para que
 * lo que se lee en pantalla y lo que llega al buzón no puedan discrepar.
 */

/** Ocho días: la semana de trabajo más el margen de quien reporta el lunes. */
export const DIAS_REPORTE = 8;

export type FilaSemanal = {
  proyecto: string;
  cliente: string | null;
  /** Horas reportadas en la ventana del reporte. */
  semana: number;
  /** Todo lo registrado en el proyecto, desde que empezó. */
  registradas: number;
  cotizadas: number;
  /** Lo consumido sobre lo cotizado. `null` si no se cotizó. */
  uso: number | null;
  /** Lo que queda. Negativo cuando ya se pasó. `null` si no se cotizó. */
  disponibles: number | null;
  /** El semáforo: qué tan cerca está de quedarse sin horas. */
  luz: "verde" | "ambar" | "rojo" | "gris";
};

export type ReporteSemanal = {
  /** El primer y el último día de la ventana, en ISO. */
  desde: string;
  hasta: string;
  filas: FilaSemanal[];
  /** Horas reportadas en la ventana, de todos los proyectos. */
  horasSemana: number;
  /** Cuántas personas registraron algo. */
  personas: number;
  /** Proyectos que ya se pasaron de lo cotizado. */
  enRojo: number;
};

/**
 * El semáforo, por lo que QUEDA y no por el porcentaje.
 *
 * "85% consumido" no dice lo mismo en un proyecto de 100 horas que en uno de
 * 6,000: en el primero quedan quince horas —una tarde— y en el segundo
 * novecientas. Lo que importa el lunes es si alcanza para la semana que
 * empieza, así que se mira el porcentaje Y las horas sueltas, y manda la peor
 * de las dos lecturas.
 */
function semaforo(cotizadas: number, disponibles: number | null): FilaSemanal["luz"] {
  // Sin presupuesto no hay nada que agotar: no es una alarma, es otra cosa.
  if (disponibles === null || cotizadas <= 0) return "gris";
  if (disponibles <= 0) return "rojo";

  const parte = disponibles / cotizadas;
  if (parte <= 0.1 || disponibles < 40) return "rojo";
  if (parte <= 0.25 || disponibles < 120) return "ambar";
  return "verde";
}

/** El día de hoy en México, como `aaaa-mm-dd`. */
function hoyEnMexico(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const reporteSemanal = cache(async function reporteSemanal(
  dias: number = DIAS_REPORTE,
): Promise<ReporteSemanal> {
  const hasta = hoyEnMexico();
  const d = new Date(`${hasta}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - (dias - 1));
  const desde = d.toISOString().slice(0, 10);

  const ventana = {
    fecha: {
      gte: new Date(`${desde}T12:00:00.000Z`),
      lte: new Date(`${hasta}T12:00:00.000Z`),
    },
  };

  // Lo de la ventana: qué proyectos se movieron y quién trabajó.
  const [recientes, personas] = await Promise.all([
    db.hora.groupBy({
      by: ["proyectoCodigo"],
      where: { proyectoCodigo: { not: null }, ...ventana },
      _sum: { horas: true },
    }),
    db.hora.findMany({
      where: { proyectoCodigo: { not: null }, ...ventana },
      select: { personaId: true },
      distinct: ["personaId"],
    }),
  ]);

  if (recientes.length === 0) {
    return { desde, hasta, filas: [], horasSemana: 0, personas: 0, enRojo: 0 };
  }

  const codigos = recientes
    .map((r) => r.proyectoCodigo)
    .filter((c): c is string => Boolean(c));

  /*
   * El saldo se mide contra TODO lo registrado, no contra la semana.
   *
   * Un proyecto no deja de estar al 90% porque esta semana se le tocaran dos
   * horas: lo consumido es lo consumido desde que empezó. La ventana solo
   * decide QUÉ proyectos salen en el reporte, no cuánto llevan gastado.
   */
  const [totales, cotizadas, padron] = await Promise.all([
    db.hora.groupBy({
      by: ["proyectoCodigo"],
      where: { proyectoCodigo: { in: codigos } },
      _sum: { horas: true },
    }),
    db.horaCotizada.groupBy({
      by: ["proyectoCodigo"],
      where: { proyectoCodigo: { in: codigos } },
      _sum: { horas: true },
    }),
    db.proyecto.findMany({
      where: { codigo: { in: codigos } },
      select: {
        codigo: true,
        nombre: true,
        cliente: { select: { nombre: true } },
      },
    }),
  ]);

  const totalPorCodigo = new Map(
    totales.map((t) => [t.proyectoCodigo, Number(t._sum.horas ?? 0)]),
  );
  const cotPorCodigo = new Map(
    cotizadas.map((c) => [c.proyectoCodigo, Number(c._sum.horas ?? 0)]),
  );
  const padronPorCodigo = new Map(padron.map((p) => [p.codigo, p]));

  const filas: FilaSemanal[] = recientes
    .map((r) => {
      const codigo = r.proyectoCodigo ?? "";
      const p = padronPorCodigo.get(codigo);
      const registradas = totalPorCodigo.get(codigo) ?? 0;
      const cot = cotPorCodigo.get(codigo) ?? 0;
      const disponibles = cot > 0 ? cot - registradas : null;

      return {
        // Sin nombre en el padrón se muestra el código: perder la fila sería
        // esconder horas que alguien reportó de verdad.
        proyecto: p?.nombre ?? codigo,
        cliente: p?.cliente?.nombre ?? null,
        semana: Number(r._sum.horas ?? 0),
        registradas,
        cotizadas: cot,
        uso: cot > 0 ? Math.round((registradas / cot) * 100) : null,
        disponibles,
        luz: semaforo(cot, disponibles),
      };
    })
    /*
     * Lo urgente primero, no lo más trabajado.
     *
     * Es un reporte para decidir: lo que hay que mirar el lunes es lo que se
     * está quedando sin horas, aunque esta semana se le tocaran dos. Dentro de
     * cada color mandan las horas de la semana, que es lo que está vivo.
     */
    .sort((a, b) => {
      const orden = { rojo: 0, ambar: 1, verde: 2, gris: 3 };
      return orden[a.luz] - orden[b.luz] || b.semana - a.semana;
    });

  return {
    desde,
    hasta,
    filas,
    horasSemana: filas.reduce((n, f) => n + f.semana, 0),
    personas: personas.length,
    enRojo: filas.filter((f) => f.luz === "rojo").length,
  };
});
