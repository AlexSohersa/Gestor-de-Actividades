import "server-only";

/**
 * Quién ATIENDE el mantenimiento.
 *
 * Es lo único que da acceso a la bandeja completa de tickets: un ticket lleva
 * el equipo, el AnyDesk y lo que la persona escribió de su avería, y eso no es
 * asunto del resto de la oficina.
 *
 * Va aparte de ser administrador a propósito. Administrar la plataforma
 * —papeles, permisos, secciones— y atender averías son dos trabajos distintos,
 * y confundirlos hacía que cualquier administrador viera las incidencias de
 * todo el mundo sin que nadie lo hubiera decidido.
 *
 * Se declara con TICKETS_ATIENDEN: los correos de Sistemas separados por
 * comas. Si está vacío, NADIE ve los ajenos — que es el lado seguro por el que
 * equivocarse: se queda una bandeja sin atender, no una fuga de datos.
 */
export function atiendeMantenimiento(correo?: string | null): boolean {
  const lista = process.env.TICKETS_ATIENDEN?.trim();
  if (!lista || !correo) return false;

  const yo = correo.trim().toLowerCase();
  return lista
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .includes(yo);
}
