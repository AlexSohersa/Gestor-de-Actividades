import { exigirSeccion } from "@/modules/identidad/infrastructure/wiring";
import {
  resuelveMantenimiento,
  veMantenimiento,
} from "@/modules/identidad/domain/persona.entity";
import { atiendeMantenimiento } from "@/lib/trabajo/mantenimiento";
import { loadTickets } from "@/lib/trabajo/queries";
import { catalogoFallas } from "@/lib/gestor/queries";
import { TicketsScreen } from "@/components/trabajo/TicketsScreen";

export const revalidate = 0;

/** Los tickets de la persona, con su folio y su historial. */
export default async function TicketsPage() {
  const persona = await exigirSeccion("tickets");

  /*
   * CADA QUIEN VE LOS SUYOS.
   *
   * Un ticket lleva el equipo, el AnyDesk y lo que la persona escribió de su
   * avería: no es asunto del resto de la oficina.
   *
   * La excepción son los dos permisos de Mantenimiento TI, que se dan por
   * persona desde la pantalla de Permisos. Van aparte de ser administrador a
   * propósito: administrar la plataforma y atender averías son dos trabajos
   * distintos, y confundirlos hacía que cualquier administrador viera las
   * incidencias de todo el mundo sin que nadie lo hubiera decidido.
   *
   * TICKETS_ATIENDEN se sigue respetando como respaldo: era la única forma
   * de darlo antes de que existiera la pantalla, y quitarlo de golpe dejaría
   * a Sistemas sin bandeja hasta que alguien vuelva a marcar las casillas.
   *
   * Las 27 fallas del catálogo son las mismas que ofrece el Digital Core.
   */
  const ve = veMantenimiento(persona) || atiendeMantenimiento(persona.correo);
  const resuelve =
    resuelveMantenimiento(persona) || atiendeMantenimiento(persona.correo);

  const [tickets, fallas] = await Promise.all([
    loadTickets(persona.id, ve),
    catalogoFallas(),
  ]);

  return (
    <TicketsScreen
      tickets={tickets}
      fallas={fallas}
      atiende={ve}
      resuelve={resuelve}
    />
  );
}
