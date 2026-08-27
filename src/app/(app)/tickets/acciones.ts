"use server";

import { revalidatePath } from "next/cache";
import { exigirSeccion } from "@/modules/identidad/infrastructure/wiring";
import { veToda } from "@/modules/identidad/domain/persona.entity";
import {
  cambiarEstadoTicketWired,
  crearTicketWired,
  esTicketDeWired,
} from "@/modules/tickets/infrastructure/wiring";
import type { Estado } from "@/modules/tickets/domain/ticket.entity";

export async function crearTicket(datos: {
  titulo: string;
  detalle: string;
  clase: string;
  falla: string | null;
}) {
  const persona = await exigirSeccion("tickets");

  const r = await crearTicketWired({ personaId: persona.id, ...datos });
  if (r.ok) revalidatePath("/tickets");
  return r;
}

export async function cambiarEstadoTicket(id: string, estado: Estado) {
  const persona = await exigirSeccion("tickets");

  const esPropio = await esTicketDeWired(id, persona.id);

  const r = await cambiarEstadoTicketWired({
    id,
    estado,
    personaId: persona.id,
    atiendeMantenimiento: veToda(persona),
    esPropio,
  });

  if (r.ok) revalidatePath("/tickets");
  return r;
}
