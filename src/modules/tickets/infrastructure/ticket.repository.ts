// Módulo Tickets · INFRAESTRUCTURA · Repositorio Prisma.

import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/modules/shared/infra/db";
import type { Estado, Ticket } from "../domain/ticket.entity";
import type { NuevoTicket, TicketRepository } from "../application/ports";

const SELECCION = {
  id: true,
  personaId: true,
  titulo: true,
  detalle: true,
  clase: true,
  falla: true,
  estado: true,
  atendidoPor: true,
  creadoEn: true,
  cerradoEn: true,
  persona: { select: { nombre: true } },
  atendida: { select: { nombre: true } },
} as const;

type Fila = {
  id: string;
  personaId: string;
  titulo: string;
  detalle: string | null;
  clase: string | null;
  falla: string | null;
  estado: string;
  atendidoPor: string | null;
  creadoEn: Date;
  cerradoEn: Date | null;
  persona: { nombre: string } | null;
  atendida: { nombre: string } | null;
};

function aDominio(f: Fila): Ticket {
  return {
    id: f.id,
    personaId: f.personaId,
    personaNombre: f.persona?.nombre ?? "—",
    titulo: f.titulo,
    detalle: f.detalle,
    clase: f.clase,
    falla: f.falla,
    estado: f.estado as Estado,
    atendidoPor: f.atendidoPor,
    atendidoPorNombre: f.atendida?.nombre ?? null,
    creadoEn: f.creadoEn,
    cerradoEn: f.cerradoEn,
  };
}

/// Los abiertos primero: es lo que hay que atender. Dentro de cada grupo, lo
/// más reciente arriba.
const ORDEN = [{ estado: "asc" as const }, { creadoEn: "desc" as const }];

export const prismaTicketRepository: TicketRepository = {
  async listarDe(personaId) {
    const filas = await db.ticket.findMany({
      where: { personaId },
      select: SELECCION,
      orderBy: ORDEN,
    });
    return filas.map((f) => aDominio(f as Fila));
  },

  async listarTodos() {
    const filas = await db.ticket.findMany({
      select: SELECCION,
      orderBy: ORDEN,
      // El histórico importado son cientos de incidencias ya cerradas; traerlas
      // todas no aporta nada a quien está atendiendo hoy.
      take: 300,
    });
    return filas.map((f) => aDominio(f as Fila));
  },

  async crear(datos: NuevoTicket) {
    const id = randomUUID();
    await db.ticket.create({
      data: {
        id,
        personaId: datos.personaId,
        titulo: datos.titulo.trim(),
        detalle: datos.detalle.trim() || null,
        clase: datos.clase,
        falla: datos.falla,
        estado: "ABIERTO",
      },
    });
    return id;
  },

  async cambiarEstado(id, estado, atendidoPor) {
    const r = await db.ticket.updateMany({
      where: { id, estado: { not: estado } },
      data: {
        estado,
        atendidoPor,
        // La fecha de cierre solo tiene sentido si se está cerrando; si se
        // reabre, se limpia para no dejar una fecha que contradice al estado.
        cerradoEn: estado === "CERRADO" ? new Date() : null,
      },
    });
    return r.count > 0;
  },
};
