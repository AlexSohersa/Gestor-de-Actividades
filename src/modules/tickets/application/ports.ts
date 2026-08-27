// Módulo Tickets · APLICACIÓN · Ports (contratos).

import type { Estado, Ticket } from "../domain/ticket.entity";

export interface NuevoTicket {
  personaId: string;
  titulo: string;
  detalle: string;
  clase: string;
  falla: string | null;
}

export interface TicketRepository {
  /// Los tickets de una persona.
  listarDe(personaId: string): Promise<Ticket[]>;

  /// Todos los tickets, para quien atiende el mantenimiento.
  listarTodos(): Promise<Ticket[]>;

  crear(datos: NuevoTicket): Promise<string>;

  /// Cambia el estado. `atendidoPor` queda registrado la primera vez que
  /// alguien lo mueve, para saber quién se hizo cargo.
  cambiarEstado(
    id: string,
    estado: Estado,
    atendidoPor: string,
  ): Promise<boolean>;
}
