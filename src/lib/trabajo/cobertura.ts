/**
 * Quién te cubre y cómo localizarte: cuándo se exigen.
 *
 * Vive aparte —sin `server-only`— porque la regla la necesitan los dos lados:
 * el formulario, para marcar los campos como obligatorios y no dejar enviar
 * sin ellos, y la acción de servidor, para volver a comprobarlo. Tenerla en un
 * solo sitio es lo que evita que una pantalla exija algo que el servidor deja
 * pasar, o al revés.
 */

/**
 * Los tipos que NO las exigen.
 *
 * Home office no es una ausencia: la persona trabaja su jornada completa y
 * está localizable como cualquier otro día. Pedirle que nombre a quien la
 * cubra no significa nada, y obligar a rellenar un campo que no aplica solo
 * enseña a poner cualquier cosa con tal de pasar el formulario.
 *
 * En el resto sí se exigen: quien las pide no está ni presente ni en línea, y
 * el equipo necesita saber con quién contar mientras. También en las de horas
 * sueltas —llegada tarde, salida temprano—: son pocas horas, pero son horas en
 * las que alguien puede necesitar algo que estaba en tus manos.
 */
export const SIN_COBERTURA: readonly string[] = ["HOME OFFICE"];

/** `true` si ese tipo exige backup y disponibilidad. */
export function exigeCobertura(tipo: string): boolean {
  return !SIN_COBERTURA.includes(tipo.trim().toUpperCase());
}
