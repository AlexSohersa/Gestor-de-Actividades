import "server-only";
import { db } from "@/lib/db/client";
import { deFechaDia } from "@/lib/fechas";

/**
 * Las ausencias APROBADAS de todo el equipo, para el calendario.
 *
 * Solo se usan ahí: sirven para saber quién falta cada día y poder pedir los
 * propios días sabiendo con quién coincides. En el resto de la pantalla cada
 * quien sigue viendo solo lo suyo.
 *
 * Van únicamente las aprobadas: una solicitud pendiente todavía puede no
 * ocurrir, y pintarla haría que la gente evitara días que quizá se liberen.
 */

export type DiaOcupado = {
  /** El día, AAAA-MM-DD. */
  dia: string;
  personaId: string;
  nombre: string;
  tipo: string;
  /** Horas, cuando no es día completo. */
  horas: number | null;

  /*
   * El rango entero al que pertenece el día, y con quién contar mientras.
   *
   * El calendario solo necesita el día para pintarlo, pero al abrirlo la
   * pregunta siguiente siempre es la misma: cuánto falta, quién lo cubre y si
   * se le puede escribir. Sale de la misma consulta, así que viaja con el día.
   */
  desde: string;
  hasta: string;
  backup: string | null;
  disponibilidad: string | null;
  disponibilidadNota: string | null;
};

/**
 * Lo aprobado en una ventana de fechas.
 *
 * Se acota al mes que se está mirando —con margen— en vez de traerlo todo:
 * son 442 ausencias y el calendario solo necesita las de treinta días.
 */
export async function ausenciasDelEquipo(
  desdeISO: string,
  hastaISO: string,
): Promise<DiaOcupado[]> {
  const desde = new Date(`${desdeISO}T00:00:00.000Z`);
  const hasta = new Date(`${hastaISO}T23:59:59.999Z`);

  const filas = await db.ausencia.findMany({
    where: {
      estado: "APROBADA",
      // Se solapa con la ventana: empieza antes de que acabe y acaba después
      // de que empiece. Una ausencia de dos semanas cuenta aunque empezara el
      // mes pasado.
      fechaInicio: { lte: hasta },
      fechaFin: { gte: desde },
    },
    select: {
      personaId: true,
      tipo: true,
      horas: true,
      fechaInicio: true,
      fechaFin: true,
      backup: true,
      disponibilidad: true,
      disponibilidadNota: true,
      persona: { select: { nombre: true, nombreUsuario: true } },
    },
  });

  /*
   * Una entrada por DÍA, no por ausencia.
   *
   * El calendario pregunta "quién falta el 18", y con rangos habría que
   * recorrerlos en cada celda. Desplegarlos aquí deja la pantalla simple.
   *
   * Se saltan sábados y domingos: no son días de trabajo y llenarían el
   * calendario de gente "ausente" en fin de semana.
   */
  const dias: DiaOcupado[] = [];

  for (const f of filas) {
    const d = new Date(f.fechaInicio);
    const fin = new Date(f.fechaFin);
    const desdeAus = f.fechaInicio.toISOString().slice(0, 10);
    const hastaAus = f.fechaFin.toISOString().slice(0, 10);

    while (d <= fin) {
      const semana = d.getUTCDay();
      const iso = d.toISOString().slice(0, 10);

      if (semana !== 0 && semana !== 6 && iso >= desdeISO && iso <= hastaISO) {
        dias.push({
          dia: iso,
          personaId: f.personaId,
          nombre: f.persona.nombreUsuario ?? f.persona.nombre,
          tipo: f.tipo,
          horas: f.horas === null ? null : Number(f.horas),
          desde: desdeAus,
          hasta: hastaAus,
          backup: f.backup,
          disponibilidad: f.disponibilidad,
          disponibilidadNota: f.disponibilidadNota,
        });
      }

      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  return dias;
}

/** El primer y el último día del mes de una fecha, como AAAA-MM-DD. */
export function ventanaDelMes(mesISO: string): [string, string] {
  const d = new Date(`${mesISO.slice(0, 7)}-01T12:00:00.000Z`);
  const primero = deFechaDia(d);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return [primero, deFechaDia(d)];
}
