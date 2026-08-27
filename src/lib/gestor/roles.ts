/**
 * Los papeles del Gestor.
 *
 * Vive aparte de `equipo.ts` a propósito: ese archivo es `"use server"`, y ahí
 * todo lo exportado tiene que ser una función async. Un array exportado desde
 * un módulo de servidor llega al cliente como referencia remota, no como
 * array, y `ROLES.slice` revienta en tiempo de ejecución.
 *
 * Hubo un tercer papel, `APROBADOR_FINAL`, pensado como segundo filtro. Se
 * retiró porque en la práctica nadie llegaba a usarlo: lo que aprueba el
 * coordinador queda aprobado. El valor sigue reconociéndose en `Rol` para que
 * quien lo tenga guardado en la base no quede sin permisos, y volver a
 * activarlo es añadir aquí su entrada.
 */
export const ROLES = [
  {
    id: "COLABORADOR",
    label: "Colaborador",
    detalle: "Reporta horas y pide permisos. No aprueba nada.",
  },
  {
    id: "COORDINADOR",
    label: "Coordinador",
    detalle: "Aprueba las ausencias y las horas extra que le envían.",
  },
] as const;
