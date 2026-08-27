// Módulo Ausencias · INFRAESTRUCTURA · Repositorio Prisma.

import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/modules/shared/infra/db";
import { aFechaDia, deFechaDia } from "@/lib/fechas";
import {
  descuentaSaldo,
  diasQueConsume,
  type Ausencia,
  type Estado,
} from "../domain/ausencia.entity";
import type { Bloque } from "../domain/saldo.rules";
import type { AusenciaRepository, NuevaAusencia } from "../application/ports";

const SELECCION = {
  id: true,
  personaId: true,
  tipo: true,
  fechaInicio: true,
  fechaFin: true,
  medioDia: true,
  horas: true,
  motivo: true,
  estado: true,
  decididaPor: true,
  decididaEn: true,
  periodo: true,
  creadoEn: true,
  persona: { select: { nombre: true } },
  decisorPor: { select: { nombre: true } },
} as const;

type Fila = {
  id: string;
  personaId: string;
  tipo: string;
  fechaInicio: Date;
  fechaFin: Date;
  medioDia: boolean;
  horas: unknown;
  motivo: string | null;
  estado: string;
  decididaPor: string | null;
  decididaEn: Date | null;
  periodo: number | null;
  creadoEn: Date;
  persona: { nombre: string } | null;
  decisorPor: { nombre: string } | null;
};

function aDominio(f: Fila): Ausencia {
  return {
    id: f.id,
    personaId: f.personaId,
    personaNombre: f.persona?.nombre ?? "—",
    tipo: f.tipo,
    fechaInicio: deFechaDia(f.fechaInicio),
    fechaFin: deFechaDia(f.fechaFin),
    medioDia: f.medioDia,
    horas: f.horas === null ? null : Number(f.horas),
    motivo: f.motivo,
    estado: f.estado as Estado,
    decididaPor: f.decididaPor,
    decididaPorNombre: f.decisorPor?.nombre ?? null,
    decididaEn: f.decididaEn,
    periodo: f.periodo,
    creadoEn: f.creadoEn,
  };
}

export const prismaAusenciaRepository: AusenciaRepository = {
  async listarDe(personaId) {
    const filas = await db.ausencia.findMany({
      where: { personaId },
      select: SELECCION,
      orderBy: [{ fechaInicio: "desc" }],
    });
    return filas.map((f) => aDominio(f as Fila));
  },

  async pendientesDe(coordinadorId) {
    // Lo que le toca decidir: las solicitudes pendientes de la gente que tiene
    // a su cargo. La relación vive en core.persona.coordinador_id, así que
    // "quién aprueba a quién" es un dato del padrón y no una copia local.
    const filas = await db.ausencia.findMany({
      where: {
        estado: "PENDIENTE",
        persona: { coordinadorId },
      },
      select: SELECCION,
      orderBy: [{ creadoEn: "asc" }],
    });
    return filas.map((f) => aDominio(f as Fila));
  },

  async porId(id) {
    const f = await db.ausencia.findUnique({ where: { id }, select: SELECCION });
    return f ? aDominio(f as Fila) : null;
  },

  async crear(datos: NuevaAusencia) {
    const id = randomUUID();
    await db.ausencia.create({
      data: {
        id,
        personaId: datos.personaId,
        tipo: datos.tipo,
        fechaInicio: aFechaDia(datos.fechaInicio),
        fechaFin: aFechaDia(datos.fechaFin),
        medioDia: datos.medioDia,
        horas: datos.horas,
        motivo: datos.motivo,
        estado: "PENDIENTE",
        periodo: datos.periodo,
      },
    });
    return id;
  },

  async decidir(id, estado, decididaPor) {
    // El filtro por estado PENDIENTE dentro del propio update es lo que impide
    // que dos coordinadores decidan a la vez: el segundo no encuentra fila.
    const r = await db.ausencia.updateMany({
      where: { id, estado: "PENDIENTE" },
      data: { estado, decididaPor, decididaEn: new Date() },
    });
    return r.count > 0;
  },

  async cancelar(id, personaId) {
    const r = await db.ausencia.deleteMany({
      where: { id, personaId, estado: "PENDIENTE" },
    });
    return r.count > 0;
  },

  async bloquesDe(personaId): Promise<Bloque[]> {
    const filas = await db.saldoVacaciones.findMany({
      where: { personaId },
      orderBy: { periodo: "asc" },
    });
    return filas.map((f) => ({
      periodo: f.periodo,
      dias: Number(f.dias),
      venceEn: f.venceEn ? deFechaDia(f.venceEn) : null,
    }));
  },

  async diasConsumidos(personaId, jornada) {
    // Se traen las aprobadas y se suman en memoria: son pocas por persona y el
    // cálculo de "cuántos días laborales consume" necesita saltar fines de
    // semana, algo que en SQL sería un ejercicio de contorsionismo.
    const filas = await db.ausencia.findMany({
      where: { personaId, estado: "APROBADA" },
      select: {
        tipo: true,
        fechaInicio: true,
        fechaFin: true,
        medioDia: true,
        horas: true,
      },
    });

    const total = filas
      .filter((f) => descuentaSaldo(f.tipo))
      .reduce(
        (t, f) =>
          t +
          diasQueConsume(
            {
              fechaInicio: deFechaDia(f.fechaInicio),
              fechaFin: deFechaDia(f.fechaFin),
              medioDia: f.medioDia,
              horas: f.horas === null ? null : Number(f.horas),
            },
            jornada,
          ),
        0,
      );

    return Math.round(total * 100) / 100;
  },
};
