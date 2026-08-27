// Módulo Actividad · DOMINIO · Entidad y tipos.
//
// Lógica PURA: qué es una hora reportada y qué la hace válida. No conoce
// Prisma, ni Next, ni la base. Se puede probar sin nada montado.

/// Una hora ya guardada, tal como la usa la aplicación.
export interface Hora {
  id: string;
  personaId: string;
  /// Código del proyecto en el padrón (core.proyecto). Null cuando la fila
  /// vino de la hoja con un nombre que no está en el padrón; en ese caso el
  /// nombre original queda en `proyectoTexto`.
  proyectoCodigo: string | null;
  proyectoTexto: string | null;
  /// Nombre del proyecto para mostrar: el del padrón, o el texto suelto.
  proyectoNombre: string;
  entregableId: string | null;
  entregable: string | null;
  fecha: string; // AAAA-MM-DD
  horas: number;
  disciplina: string | null;
  tipo: string | null;
  esfuerzo: string | null;
  comentario: string | null;
  quincena: number | null;
  /// "hoja" si vino del gestor antiguo, "app" si se capturó aquí. Las
  /// importadas no se pueden borrar desde la aplicación.
  origen: string;
}

/// Una línea del formulario de captura, antes de guardarse.
export interface LineaNueva {
  entregable: string;
  disciplina: string;
  tipo: string;
  esfuerzo: string;
  horas: number;
  comentario: string;
}

/// El proyecto interno bajo el que se registran las ausencias. Existe en el
/// padrón y es la razón de que `actividad.ausencia` esté vacía: el histórico de
/// permisos entró como horas contra este proyecto.
export const PROYECTO_AUSENCIAS = "SOH_INT_00000_AUS";

/// Los tipos de actividad que NO son trabajo sobre un proyecto. Se excluyen de
/// los promedios y del radar para no inflar la dedicación real.
export const TIPOS_NO_TRABAJO = new Set([
  "VACACIONES",
  "AUSENCIA SIN PAGA",
  "PERMISO CON GOCE DE SUELDO",
  "PERMISO SIN GOCE DE SUELDO",
  "TIEMPO POR TIEMPO",
  "SALIDA TEMPRANO",
  "LLEGADA TARDE",
  "INCAPACIDAD",
]);

export function esTrabajo(h: Pick<Hora, "tipo" | "proyectoCodigo">): boolean {
  if (h.proyectoCodigo === PROYECTO_AUSENCIAS) return false;
  if (!h.tipo) return true;
  return !TIPOS_NO_TRABAJO.has(h.tipo.trim().toUpperCase());
}

/// Lo que puede salir mal al capturar. Se devuelve el motivo en texto porque va
/// directo a la pantalla.
export type Validacion = { ok: true } | { ok: false; error: string };

/**
 * ¿Se puede reportar este conjunto de líneas?
 *
 * Reglas, en el mismo orden que las aplicaba el gestor antiguo:
 *  1. Tiene que haber al menos una línea con entregable y horas > 0.
 *  2. Cada línea necesita tipo y comentario: sin eso la hora no dice nada.
 *  3. No se reportan fines de semana por la vía normal.
 *  4. La suma del día no puede pasar de la jornada de esa persona.
 *
 * `horasYaReportadas` son las que ya tiene ese día, para que capturar en dos
 * tandas no permita saltarse el tope.
 */
export function validarCaptura(args: {
  fecha: string;
  proyecto: string;
  lineas: LineaNueva[];
  esFinDeSemana: boolean;
  jornada: number;
  horasYaReportadas: number;
}): Validacion {
  const { fecha, proyecto, lineas, esFinDeSemana, jornada, horasYaReportadas } =
    args;

  if (!fecha) return { ok: false, error: "Falta la fecha." };
  if (!proyecto) return { ok: false, error: "Falta el proyecto." };

  const validas = lineas.filter((l) => l.entregable && l.horas > 0);
  if (validas.length === 0) {
    return { ok: false, error: "Estás intentando reportar cero horas." };
  }

  for (const l of validas) {
    if (!l.tipo) {
      return { ok: false, error: "Falta el tipo de actividad en alguna línea." };
    }
    if (!l.comentario.trim()) {
      return { ok: false, error: "Falta el comentario en alguna línea." };
    }
  }

  if (esFinDeSemana) {
    return {
      ok: false,
      error: "Ese día no es laboral. Repórtalo como horas extra.",
    };
  }

  const suma = validas.reduce((t, l) => t + l.horas, 0);
  if (suma + horasYaReportadas > jornada) {
    const restan = Math.max(0, jornada - horasYaReportadas);
    return {
      ok: false,
      error:
        `Estás intentando reportar ${suma} h y solo te quedan ${restan} h ` +
        `de tu jornada de ${jornada} h. Lo que exceda va como horas extra.`,
    };
  }

  return { ok: true };
}

/// Solo se borra lo que se capturó en la aplicación: lo importado del gestor
/// antiguo es histórico y su origen de verdad es la hoja.
export function sePuedeBorrar(h: Pick<Hora, "origen">): boolean {
  return h.origen !== "hoja";
}

/// Suma de horas de un conjunto, redondeada a 2 decimales para que no aparezcan
/// artefactos de coma flotante (0.1 + 0.2) en pantalla.
export function sumarHoras(horas: Array<Pick<Hora, "horas">>): number {
  return Math.round(horas.reduce((t, h) => t + h.horas, 0) * 100) / 100;
}
