/**
 * El código visible de un ticket: `AAMMDD_TIPO_NNNNN`.
 *
 * Es el formato del gestor de siempre —"260611_HARD_26020"—, el que Sistemas
 * lee en `BDD MANTENIMIENTO`, en los correos y en Dynamics. Un "TCK-001" no se
 * parece a nada de lo que hay ahí: al buscar un ticket por su código, el de la
 * pantalla y el de la hoja tienen que ser el MISMO.
 *
 * Vive aquí y no en cada sitio porque lo usan tres: la pantalla, la copia a la
 * hoja y el aviso por correo. Con tres copias, cambiar el formato en una y
 * olvidar las otras deja códigos que no casan entre sí.
 *
 * No lleva `server-only`: la pantalla también lo necesita.
 */
export function folioDeTicket(
  clase: string | null,
  numero: number,
  cuando: Date,
): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  })
    .format(cuando)
    .split("-");

  const tipo = (clase ?? "").toUpperCase().startsWith("HARD") ? "HARD" : "SOFT";
  return `${p[0]}${p[1]}${p[2]}_${tipo}_${String(numero).padStart(5, "0")}`;
}
