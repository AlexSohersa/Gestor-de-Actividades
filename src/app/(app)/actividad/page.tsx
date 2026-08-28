import { exigirSeccion } from "@/modules/identidad/infrastructure/wiring";
import { veToda } from "@/modules/identidad/domain/persona.entity";
import { db } from "@/lib/db/client";
import { catalogosActividad, listaAprobadores } from "@/lib/gestor/queries";
import {
  cargarDashboard,
  cargarResumenSemana,
  type Periodo,
} from "@/lib/gestor/dashboard";
import { estadoHomeOffice } from "@/lib/gestor/homeoffice";
import { sincronizarEnSegundoPlano } from "@/lib/google/sincronizar";
import { aFechaDia, hoyEnMexico, lunesDe, sumarDias, deFechaDia} from "@/lib/fechas";
import { ActividadScreen } from "@/components/gestor/ActividadScreen";

// Las horas cambian a cada rato y la pantalla es de uso personal: servir una
// versión cacheada solo mostraría datos viejos.
export const revalidate = 0;


/** Lo que la base guarda → lo que la pantalla espera. */
const ESTADO_EXTRA: Record<string, string> = {
  PENDIENTE: "pendiente",
  APROBADA: "aprobado",
  RECHAZADA: "rechazado",
};
export default async function ActividadPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string; vista?: string; periodo?: string }>;
}) {
  const persona = await exigirSeccion("actividad");
  const { semana, vista, periodo: periodoParam } = await searchParams;

  /*
   * El tablero solo se calcula si se va a ver.
   *
   * Recorre un año de filas, y la vista semanal —donde cae la gente por
   * omisión— no usa ni una. Cargarlo siempre hacía esperar a todo el mundo por
   * una pantalla que la mayoría no abre.
   */
  const necesitaTablero = vista === "historial" || vista === "consulta";

  // Por omisión el último año: es donde hay historia suficiente para que el
  // tablero diga algo. La quincena en curso suele tener una o dos filas, y
  // arrancar ahí hace parecer que no hay datos cuando sí los hay.
  const periodo: Periodo =
    periodoParam === "mes" || periodoParam === "quincena"
      ? periodoParam
      : "anio";

  // "Hoy" según México, no según el reloj del servidor (que en producción va en
  // UTC y a media tarde ya sería mañana).
  const hoy = hoyEnMexico();
  const lunesISO = lunesDe(semana ?? hoy);
  const domingoISO = sumarDias(lunesISO, 6);

  const verEmpresa = veToda(persona);

  /*
   * Las horas extra, en dos listas.
   *
   * Las SUYAS —para que vea en qué quedaron— y las que le MANDARON a él, que
   * son las que tiene que decidir. Como en las ausencias, decide solo quien
   * las recibió: tener el papel de coordinador no basta.
   */
  const [horas, catalogos, aprobadores, tablero, extras, porAprobar] =
    await Promise.all([
    db.hora.findMany({
      where: {
        personaId: persona.id,
        fecha: { gte: aFechaDia(lunesISO), lte: aFechaDia(domingoISO) },
      },
      select: {
        id: true,
        fecha: true,
        horas: true,
        disciplina: true,
        tipo: true,
        esfuerzo: true,
        comentario: true,
        origen: true,
        sheetSync: true,
        proyectoTexto: true,
        entregableTexto: true,
        proyecto: { select: { nombre: true } },
        entregable: { select: { nombre: true } },
      },
      orderBy: { fecha: "asc" },
    }),
    catalogosActividad(),
    listaAprobadores(),
    necesitaTablero
      ? cargarDashboard(persona.id, verEmpresa, periodo)
      : cargarResumenSemana(persona.id, periodo, verEmpresa),
    db.horaExtra.findMany({
      where: { personaId: persona.id },
      orderBy: { fecha: "desc" },
      take: 60,
      include: {
        persona: { select: { nombre: true, nombreUsuario: true } },
        destinatario: { select: { nombre: true, nombreUsuario: true } },
        proyecto: { select: { nombre: true } },
      },
    }),
    db.horaExtra.findMany({
      where: { enviadaA: persona.id, estado: "PENDIENTE" },
      orderBy: { fecha: "asc" },
      include: {
        persona: { select: { nombre: true, nombreUsuario: true } },
        destinatario: { select: { nombre: true, nombreUsuario: true } },
        proyecto: { select: { nombre: true } },
      },
    }),
  ]);

  // La checada está siempre: no depende de ningún permiso.
  const estadoHO = await estadoHomeOffice();

  /*
   * Reintenta lo que no llegó a la hoja.
   *
   * La subida ocurre justo después de guardar, con las credenciales que
   * hubiera en ese momento; si fallaron, la fila se quedó pendiente y solo se
   * reintentaría al guardar otra cosa. Abrir esta pantalla es el momento
   * natural para volver a intentarlo, y va sin esperar: si Google tarda, la
   * pantalla no espera.
   */
  sincronizarEnSegundoPlano();

  return (
    <ActividadScreen
      lunesISO={lunesISO}
      entradas={horas.map((h) => ({
        id: h.id,
        // Mediodía UTC, tal como se guardó: la pantalla lo formatea con
        // timeZone UTC y así el día no se corre al mostrarlo.
        date: h.fecha.toISOString(),
        project: h.proyecto?.nombre ?? h.proyectoTexto ?? "SIN PROYECTO",
        deliverable: h.entregable?.nombre ?? h.entregableTexto ?? "",
        discipline: h.disciplina ?? "",
        kind: h.tipo ?? "",
        effort: h.esfuerzo,
        hours: Number(h.horas),
        comment: h.comentario,
        category: "NORMAL",
        status: "PAGADO",
        // Lo importado se marca como tal —no se puede borrar desde aquí,
        // porque su origen es la hoja— y lo capturado aquí enseña si ya subió.
        sheetSync: h.origen === "hoja" ? "importado" : h.sheetSync,
      }))}
      extras={extras.map((e) => ({
        id: e.id,
        date: deFechaDia(e.fecha),
        userName: e.persona.nombreUsuario ?? e.persona.nombre,
        project: e.proyecto?.nombre ?? e.proyectoTexto ?? "",
        deliverable: e.entregable ?? "",
        hours: Number(e.horas),
        reason: e.justificacion ?? "",
        status: ESTADO_EXTRA[e.estado] ?? "pendiente",
        approverName:
          e.destinatario?.nombreUsuario ?? e.destinatario?.nombre ?? null,
        isCourse: false,
      }))}
      porAprobar={porAprobar.map((e) => ({
        id: e.id,
        date: deFechaDia(e.fecha),
        userName: e.persona.nombreUsuario ?? e.persona.nombre,
        project: e.proyecto?.nombre ?? e.proyectoTexto ?? "",
        deliverable: e.entregable ?? "",
        hours: Number(e.horas),
        reason: e.justificacion ?? "",
        status: "pendiente",
        approverName: null,
        isCourse: false,
      }))}
      catalogos={catalogos}
      aprobadores={aprobadores}
      puedoAprobar={porAprobar.length > 0}
      topeDia={persona.horasDia}
      estadoHO={estadoHO}
      tablero={tablero}
    />
  );
}
