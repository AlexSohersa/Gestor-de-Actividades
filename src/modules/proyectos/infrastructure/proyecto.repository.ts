// Módulo Proyectos · INFRAESTRUCTURA · Repositorio Prisma.

import "server-only";
import { db } from "@/modules/shared/infra/db";
import { deFechaDia, sumarDias } from "@/lib/fechas";
import type {
  HoraCotizada,
  HoraRegistrada,
} from "../domain/radar.rules";

export interface ProyectoEnLista {
  codigo: string;
  nombre: string;
  estado: string;
  cliente: string | null;
  registradas: number;
  cotizadas: number;
  uso: number | null;
}

/**
 * Los proyectos con actividad, para el selector.
 *
 * Se agregan las dos tablas por separado y se juntan en memoria: son unos
 * cientos de filas agrupadas, y un JOIN entre dos agregados en Prisma exigiría
 * SQL crudo sin ganar nada.
 */
export async function listarProyectos(): Promise<ProyectoEnLista[]> {
  const [registradas, cotizadas, proyectos] = await Promise.all([
    db.hora.groupBy({
      by: ["proyectoCodigo"],
      where: { proyectoCodigo: { not: null } },
      _sum: { horas: true },
    }),
    db.horaCotizada.groupBy({
      by: ["proyectoCodigo"],
      _sum: { horas: true },
    }),
    db.proyecto.findMany({
      select: {
        codigo: true,
        nombre: true,
        estado: true,
        cliente: { select: { nombre: true } },
      },
    }),
  ]);

  const regPorCodigo = new Map(
    registradas.map((r) => [r.proyectoCodigo!, Number(r._sum.horas ?? 0)]),
  );
  const cotPorCodigo = new Map(
    cotizadas.map((c) => [c.proyectoCodigo, Number(c._sum.horas ?? 0)]),
  );

  return proyectos
    // Solo los que tienen algo que mostrar: 506 proyectos en un selector, la
    // mayoría sin una sola hora, no ayuda a nadie.
    .filter((p) => regPorCodigo.has(p.codigo) || cotPorCodigo.has(p.codigo))
    .map((p) => {
      const reg = Math.round((regPorCodigo.get(p.codigo) ?? 0) * 100) / 100;
      const cot = Math.round((cotPorCodigo.get(p.codigo) ?? 0) * 100) / 100;
      return {
        codigo: p.codigo,
        nombre: p.nombre,
        estado: p.estado,
        cliente: p.cliente?.nombre ?? null,
        registradas: reg,
        cotizadas: cot,
        uso: cot > 0 ? Math.round((reg / cot) * 100) : null,
      };
    })
    .sort((a, b) => b.registradas - a.registradas);
}

/**
 * Las horas de un proyecto para el radar.
 *
 * IMPORTANTE: lee `actividad.hora` completa, sin filtrar por origen. El gestor
 * anterior solo miraba el histórico importado, así que lo que la gente
 * capturaba en la aplicación no aparecía nunca en el radar — un proyecto podía
 * verse al 40% llevando meses de trabajo registrado. Aquí cuenta todo.
 */
export async function horasDeProyecto(
  proyectoCodigo: string,
  meses: number | null,
  hoyISO: string,
): Promise<{ registradas: HoraRegistrada[]; cotizadas: HoraCotizada[] }> {
  const desde =
    meses === null ? null : sumarDias(hoyISO, -Math.round(meses * 30.44));

  const [horas, cotizadas] = await Promise.all([
    db.hora.findMany({
      where: {
        proyectoCodigo,
        ...(desde ? { fecha: { gte: new Date(`${desde}T12:00:00.000Z`) } } : {}),
      },
      select: {
        fecha: true,
        horas: true,
        disciplina: true,
        esfuerzo: true,
        entregableTexto: true,
        entregable: { select: { nombre: true } },
        persona: { select: { nombre: true } },
      },
      orderBy: { fecha: "asc" },
    }),
    db.horaCotizada.findMany({
      where: { proyectoCodigo },
      select: { entregable: true, disciplina: true, horas: true },
    }),
  ]);

  return {
    registradas: horas.map((h) => ({
      fecha: deFechaDia(h.fecha),
      horas: Number(h.horas),
      // El enlace del padrón manda; si no lo hay, el nombre que traía la hoja.
      // Es lo que permite cruzar las horas con lo cotizado, que se guarda por
      // NOMBRE de entregable y no por id.
      entregable: h.entregable?.nombre ?? h.entregableTexto ?? null,
      disciplina: h.disciplina,
      esfuerzo: h.esfuerzo,
      persona: h.persona?.nombre ?? "—",
    })),
    cotizadas: cotizadas.map((c) => ({
      entregable: c.entregable,
      disciplina: c.disciplina,
      horas: Number(c.horas),
    })),
  };
}

export async function datosDeProyecto(codigo: string) {
  return db.proyecto.findUnique({
    where: { codigo },
    select: {
      codigo: true,
      nombre: true,
      estado: true,
      fechaInicio: true,
      fechaFin: true,
      cliente: { select: { nombre: true } },
      lider: { select: { nombre: true } },
    },
  });
}
