import { exigirSeccion } from "@/modules/identidad/infrastructure/wiring";
import { puedeAprobar } from "@/modules/identidad/domain/persona.entity";
import { db } from "@/lib/db/client";
import { catalogoAusencias, listaAprobadores } from "@/lib/gestor/queries";
import { loadAusencias, saldoVacaciones } from "@/lib/trabajo/queries";
import { AusenciasScreen } from "@/components/trabajo/AusenciasScreen";

export const revalidate = 0;

/**
 * Ausencias de la persona: saldo, calendario y solicitudes.
 *
 * El saldo sale de sus bloques de vacaciones con vencimiento, igual que el
 * Gestor de siempre; quien aprueba ve además la bandeja que le toca.
 */
export default async function AusenciasPage() {
  const persona = await exigirSeccion("ausencias");
  const puedo = puedeAprobar(persona);

  const [{ lista }, saldo, tipos, aprobadores, pendientes] =
    await Promise.all([
      loadAusencias(persona.id),
      saldoVacaciones(persona.id),
      catalogoAusencias(),
      listaAprobadores(),
      /*
       * Lo que le toca decidir: las solicitudes que le MANDARON A ÉL.
       *
       * No las de su equipo: la solicitud se dirige a alguien concreto y es esa
       * persona quien responde.
       *
       * Y solo las pedidas DESDE ESTA HERRAMIENTA. Las importadas de la hoja
       * (`sheet_sync = "hoja"`) no llevan destinatario, y hacerlas caer en el
       * coordinador del padrón sacaba a la luz solicitudes de 2024 y 2025 que
       * nadie decidió en su momento: quince en total, pidiendo aprobación dos
       * años después. Eso no es una bandeja de trabajo, es ruido —y aprobar
       * hoy unas vacaciones de hace dos años descontaría saldo de verdad.
       *
       * Quedan en la base como historial; solo dejan de pedir una decisión.
       */
      puedo
        ? db.ausencia.findMany({
            where: {
              estado: "PENDIENTE",
              enviadaA: persona.id,
            },
            select: {
              id: true,
              tipo: true,
              fechaInicio: true,
              fechaFin: true,
              medioDia: true,
              horas: true,
              motivo: true,
              persona: { select: { nombre: true } },
              destinatario: { select: { nombre: true } },
            },
            orderBy: { creadoEn: "asc" },
          })
        : Promise.resolve([]),
    ]);

  return (
    <AusenciasScreen
      lista={lista}
      usados={saldo.usados}
      disponibles={saldo.disponibles}
      saldo={saldo}
      liberaciones={saldo.liberaciones}
      tipos={tipos}
      aprobadores={aprobadores}
      porAprobar={pendientes.map((a) => ({
        id: a.id,
        type: a.tipo,
        // Mediodía UTC, tal como se guardó: la pantalla lo formatea con
        // timeZone UTC y así el día no se corre al mostrarlo.
        startDate: a.fechaInicio.toISOString(),
        endDate: a.fechaFin.toISOString(),
        halfDay: a.medioDia,
        hours: a.horas === null ? null : Number(a.horas),
        detail: a.motivo,
        sentTo: a.destinatario?.nombre ?? null,
        status: "pendiente",
        userName: a.persona?.nombre ?? "—",
      }))}
      puedoAprobar={puedo}
    />
  );
}
