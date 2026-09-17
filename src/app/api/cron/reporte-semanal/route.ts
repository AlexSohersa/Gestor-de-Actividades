import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { reporteSemanal } from "@/lib/proyectos/semanal";
import { asuntoSemanal, cuerpoSemanal } from "@/lib/proyectos/correo-semanal";
import { enviarCorreo } from "@/lib/google/correo";

/**
 * El reporte semanal, por correo, los lunes a primera hora.
 *
 * Lo dispara Vercel Cron (ver `vercel.json`). No se puede hacer desde la
 * aplicación: un envío programado necesita que alguien lo despierte, y nadie
 * garantiza que haya una pestaña abierta un lunes a las nueve de la mañana.
 *
 * LA HORA, que es lo enredado. Vercel programa siempre en UTC y solo garantiza
 * el minuto exacto en los planes Pro y Enterprise. En Hobby la precisión es
 * "por hora" y el minuto del cron SE IGNORA: `30 14 * * 1` no dispara entre
 * las 14:30 y las 15:30, dispara en cualquier momento entre las 14:00 y las
 * 14:59.
 *
 * Lo pedido era entre 8:30 y 9:00 de México, con más tarde tolerable pero
 * nunca antes. Con un solo cron eso no se puede: a las 8:30 se adelantaría
 * hasta las 8:00 en Hobby, y a las 9:00 nunca llegaría a las 8:30 en Pro.
 *
 * De ahí los DOS crons —14:30 y 15:00 UTC, o 8:30 y 9:00 en México— más las
 * dos guardas de abajo: la hora mínima descarta lo que llegue antes de las
 * 8:30, y el registro en `actividad.envio_programado` impide que el segundo
 * intento mande un correo repetido.
 *
 *   · En Pro   → el de 8:30 entra; el de 9:00 se descarta por repetido.
 *   · En Hobby → el primero suele caer antes de 8:30 y se descarta por hora;
 *                el segundo cae entre 9:00 y 9:59, y ese es el que sale.
 *
 * México ya no cambia de hora desde 2022, así que UTC-6 es fijo. Si alguna vez
 * volviera el cambio, habría que mover las dos expresiones.
 *
 * Node y no Edge: el envío usa la API de Gmail con `googleapis`, que necesita
 * las librerías de Node.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** La clave del registro: distingue este envío de otros que se añadan luego. */
const CLAVE = "reporte-semanal";

/** Antes de esta hora de México no se manda, aunque el cron se adelante. */
const HORA_MINIMA = 8 * 60 + 30;

/**
 * A quién le llega.
 *
 * Se lee de `REPORTE_SEMANAL_PARA`, correos separados por comas. Va en el
 * entorno y no en el código porque la lista cambia —hoy es una prueba, mañana
 * son cinco personas— y cambiarla no debería costar un despliegue.
 *
 * Sin la variable no se manda a nadie: el lado seguro por el que equivocarse
 * es que no salga el correo, no que salga a quien no debía.
 */
function destinatarios(): string[] {
  return (process.env.REPORTE_SEMANAL_PARA ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.includes("@"));
}

/**
 * Que solo lo dispare quien debe.
 *
 * La ruta es pública —Vercel Cron la llama sin sesión—, así que sin esto
 * cualquiera que adivine la dirección puede lanzar el envío a todo el mundo
 * cuantas veces quiera.
 *
 * Vercel firma sus llamadas con `CRON_SECRET`; si no está configurado, solo se
 * acepta la cabecera propia de Vercel, que no se puede falsificar desde fuera.
 */
function autorizada(req: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (secreto) return auth === `Bearer ${secreto}`;
  return req.headers.get("x-vercel-cron") !== null;
}

/** La hora y el día de hoy en México, que es donde se decide. */
function ahoraEnMexico(): { dia: string; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "0";
  // `hour12: false` devuelve "24" a medianoche en algunos entornos.
  const hora = Number(v("hour")) % 24;

  return {
    dia: `${v("year")}-${v("month")}-${v("day")}`,
    minutos: hora * 60 + Number(v("minute")),
  };
}

/** El día como `date` de Postgres: mediodía UTC para que no se corra. */
const aFecha = (dia: string) => new Date(`${dia}T12:00:00.000Z`);

export async function GET(req: Request) {
  if (!autorizada(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const { dia, minutos } = ahoraEnMexico();

  /*
   * Demasiado temprano: se descarta y se espera al siguiente intento.
   *
   * En Hobby el primer cron cae en cualquier momento entre las 8:00 y las
   * 8:59, y media hora de esas es antes de lo pedido. Un reporte a las 8:05
   * llega cuando buena parte de la oficina no ha abierto el correo.
   *
   * Que `?forzar=1` lo salte es a propósito: es lo que permite probarlo a mano
   * desde el panel de Vercel a cualquier hora.
   */
  const forzar = new URL(req.url).searchParams.get("forzar") === "1";

  if (!forzar && minutos < HORA_MINIMA) {
    const h = Math.floor(minutos / 60);
    const m = String(minutos % 60).padStart(2, "0");
    return NextResponse.json({
      ok: true,
      enviado: false,
      motivo: `Son las ${h}:${m} en México y el reporte no sale antes de las 8:30. Lo manda el siguiente disparo.`,
    });
  }

  const para = destinatarios();
  if (para.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "REPORTE_SEMANAL_PARA está vacío: no hay a quién enviarlo.",
    });
  }

  const d = await reporteSemanal();

  /*
   * Sin movimiento no se manda nada.
   *
   * Un correo que dice "no pasó nada" cada lunes de vacaciones enseña a
   * ignorar el correo, y entonces tampoco se lee el lunes que sí importa.
   */
  if (d.filas.length === 0) {
    return NextResponse.json({
      ok: true,
      enviado: false,
      motivo: "Nadie reportó horas en la ventana: no hay nada que contar.",
    });
  }

  /*
   * Un solo correo al día, aunque haya dos crons.
   *
   * Se aparta el sitio ANTES de enviar y no después: entre enviar y anotar hay
   * un hueco en el que el otro disparo puede colarse. La clave primaria es
   * (clave, día), así que el segundo choca aquí y se va sin mandar nada.
   */
  try {
    await db.envioProgramado.create({
      data: { clave: CLAVE, dia: aFecha(dia) },
    });
  } catch {
    return NextResponse.json({
      ok: true,
      enviado: false,
      motivo: "El reporte de hoy ya se envió.",
    });
  }

  const base = process.env.NEXTAUTH_URL ?? process.env.APP_URL;

  const r = await enviarCorreo({
    para,
    asunto: asuntoSemanal(d),
    html: cuerpoSemanal(d, base ? `${base}/proyectos?vista=semanal` : undefined),
  });

  if (!r.ok) {
    /*
     * Si el envío falla, se libera el sitio.
     *
     * Dejar la marca puesta convertiría un fallo de Gmail en un lunes sin
     * reporte: el segundo cron lo daría por enviado y nadie se enteraría.
     */
    await db.envioProgramado
      .delete({ where: { clave_dia: { clave: CLAVE, dia: aFecha(dia) } } })
      .catch(() => {});

    return NextResponse.json({ ok: false, error: r.motivo }, { status: 500 });
  }

  // Ya salió: se completa la fila con a quién y con qué, para poder mirarlo
  // después sin depender de los registros de Vercel, que caducan.
  await db.envioProgramado
    .update({
      where: { clave_dia: { clave: CLAVE, dia: aFecha(dia) } },
      data: {
        destinatarios: para.join(", "),
        detalle: `${d.filas.length} proyectos · ${d.enRojo} sin horas`,
      },
    })
    .catch(() => {});

  return NextResponse.json({
    ok: true,
    enviado: true,
    para,
    proyectos: d.filas.length,
    enRojo: d.enRojo,
  });
}
