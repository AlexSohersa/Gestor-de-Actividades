import { exigirSeccion } from "@/modules/identidad/infrastructure/wiring";
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
   * La excepción es quien ATIENDE el mantenimiento, que necesita la bandeja
   * completa para trabajarla. Eso se declara con TICKETS_ATIENDEN —los correos
   * de Sistemas, separados por comas—, no con ser administrador: administrar
   * la plataforma y atender averías son dos cosas distintas, y hasta ahora
   * cualquier administrador veía las incidencias de todo el mundo sin que
   * nadie lo hubiera decidido.
   *
   * Las 27 fallas del catálogo son las mismas que ofrece el Digital Core.
   */
  const atiende = atiendeMantenimiento(persona.correo);

  const [tickets, fallas] = await Promise.all([
    loadTickets(persona.id, atiende),
    catalogoFallas(),
  ]);

  return <TicketsScreen tickets={tickets} fallas={fallas} atiende={atiende} />;
}
