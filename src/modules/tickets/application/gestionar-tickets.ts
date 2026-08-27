// Módulo Tickets · APLICACIÓN · Casos de uso.

import { validarTicket, type Estado, type Ticket } from "../domain/ticket.entity";
import type { TicketRepository } from "./ports";

export interface Resultado {
  ok: boolean;
  error?: string;
}

/**
 * Los tickets que hay que mostrar.
 *
 * Quien atiende el mantenimiento ve todos; el resto, solo los suyos. La
 * decisión se toma aquí y no en la pantalla: si dependiera del cliente,
 * bastaría con manipular una prop para ver los tickets de los demás.
 */
export async function verTickets(
  repo: TicketRepository,
  args: { personaId: string; atiendeMantenimiento: boolean },
): Promise<{ tickets: Ticket[]; viendoTodos: boolean }> {
  const tickets = args.atiendeMantenimiento
    ? await repo.listarTodos()
    : await repo.listarDe(args.personaId);

  return { tickets, viendoTodos: args.atiendeMantenimiento };
}

export async function crearTicket(
  repo: TicketRepository,
  args: {
    personaId: string;
    titulo: string;
    detalle: string;
    clase: string;
    falla: string | null;
  },
): Promise<Resultado & { id?: string }> {
  const validacion = validarTicket(args);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const id = await repo.crear({
    personaId: args.personaId,
    titulo: args.titulo,
    detalle: args.detalle,
    clase: args.clase,
    falla: args.falla,
  });

  return { ok: true, id };
}

/**
 * Cambiar el estado de un ticket.
 *
 * Lo mueve quien atiende el mantenimiento. Quien lo reportó también puede
 * cerrarlo —si se resolvió solo, obligarle a esperar sería absurdo— pero no
 * puede tocar los ajenos.
 */
export async function cambiarEstadoTicket(
  repo: TicketRepository,
  args: {
    id: string;
    estado: Estado;
    personaId: string;
    atiendeMantenimiento: boolean;
    /// Los tickets propios, para saber si este lo es.
    esPropio: boolean;
  },
): Promise<Resultado> {
  const { id, estado, personaId, atiendeMantenimiento, esPropio } = args;

  if (!atiendeMantenimiento && !esPropio) {
    return { ok: false, error: "Ese ticket no es tuyo." };
  }

  if (!atiendeMantenimiento && estado !== "CERRADO") {
    return {
      ok: false,
      error: "Solo puedes cerrar tus tickets; el resto lo mueve mantenimiento.",
    };
  }

  const cambiado = await repo.cambiarEstado(id, estado, personaId);
  if (!cambiado) return { ok: false, error: "Ese ticket ya estaba así." };

  return { ok: true };
}
