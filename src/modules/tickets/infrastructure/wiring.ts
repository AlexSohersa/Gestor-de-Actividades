// Módulo Tickets · INFRAESTRUCTURA · Composición (wiring).

import "server-only";
import { prismaTicketRepository } from "./ticket.repository";
import {
  cambiarEstadoTicket,
  crearTicket,
  verTickets,
} from "../application/gestionar-tickets";
import type { Estado } from "../domain/ticket.entity";

export function verTicketsWired(args: {
  personaId: string;
  atiendeMantenimiento: boolean;
}) {
  return verTickets(prismaTicketRepository, args);
}

export function crearTicketWired(args: {
  personaId: string;
  titulo: string;
  detalle: string;
  clase: string;
  falla: string | null;
}) {
  return crearTicket(prismaTicketRepository, args);
}

export function cambiarEstadoTicketWired(args: {
  id: string;
  estado: Estado;
  personaId: string;
  atiendeMantenimiento: boolean;
  esPropio: boolean;
}) {
  return cambiarEstadoTicket(prismaTicketRepository, args);
}

/// Para comprobar la propiedad antes de dejar cambiar el estado.
export async function esTicketDeWired(id: string, personaId: string) {
  const { db } = await import("@/modules/shared/infra/db");
  const t = await db.ticket.findUnique({
    where: { id },
    select: { personaId: true },
  });
  return t?.personaId === personaId;
}
