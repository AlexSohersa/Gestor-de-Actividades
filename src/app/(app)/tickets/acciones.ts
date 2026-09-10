"use server";

import { revalidatePath } from "next/cache";
import { exigirSeccion } from "@/modules/identidad/infrastructure/wiring";
import { resuelveMantenimiento } from "@/modules/identidad/domain/persona.entity";
import { atiendeMantenimiento } from "@/lib/trabajo/mantenimiento";
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

  /*
   * Quien RESUELVE, no quien administra.
   *
   * Esto miraba `veToda`, así que cualquier administrador podía cerrar
   * tickets aunque la bandeja se le concediera por otro lado: la pantalla
   * decidía con un criterio y esta acción con otro. Ahora las dos preguntan
   * lo mismo, y es un permiso que se da a mano.
   */
  const puedeResolver =
    resuelveMantenimiento(persona) || atiendeMantenimiento(persona.correo);

  const r = await cambiarEstadoTicketWired({
    id,
    estado,
    personaId: persona.id,
    atiendeMantenimiento: puedeResolver,
    esPropio,
  });

  if (r.ok) revalidatePath("/tickets");
  return r;
}
