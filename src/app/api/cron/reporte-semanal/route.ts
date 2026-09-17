import { NextResponse } from "next/server";

import { reporteSemanal } from "@/lib/proyectos/semanal";
import { asuntoSemanal, cuerpoSemanal } from "@/lib/proyectos/correo-semanal";
import { enviarCorreo } from "@/lib/google/correo";

/**
 * El reporte semanal, por correo, los lunes a primera hora.
 *
 * Lo dispara Vercel Cron (ver `vercel.json`). No se puede hacer desde la
 * aplicación: un envío programado necesita que alguien lo despierte, y nadie
 * garantiza que haya una pestaña abierta un lunes a las nueve menos cuarto.
 *
 * LA HORA. El cron dice `30 14 * * 1` y Vercel programa siempre en UTC, sin
 * entender de husos: son las 8:30 en México, que ya no cambia de hora desde
 * 2022 y se queda fijo en UTC-6.
 *
 * Y llega CUANDO LLEGA, no a las 8:30 en punto. Vercel solo garantiza el
 * minuto exacto en los planes Pro y Enterprise; en Hobby la precisión es "por
 * hora", lo que significa que un cron de las 14:30 UTC puede dispararse en
 * cualquier momento entre las 14:00 y las 14:59 —de 8:00 a 8:59 en México—.
 *
 * Por eso se eligió :30 y no :00 ni :45. En Pro cae exactamente a las 8:30,
 * dentro de la ventana pedida; en Hobby cae en esa hora, que es lo más cerca
 * que se puede estar sin pagar por el minuto. Es un reporte para leer con el
 * café, no una alarma: media hora arriba o abajo no cambia nada.
 *
 * Hobby también limita a un disparo AL DÍA, y este es semanal, así que ahí
 * no hay problema.
 *
 * Node y no Edge: el envío usa la API de Gmail con `googleapis`, que necesita
 * las librerías de Node.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A quién le llega.
 *
 * Se lee de `REPORTE_SEMANAL_PARA`, correos separados por comas. Va en el
 * entorno y no en el código porque la lista cambia —hoy es una prueba, mañana
 * son tres personas— y cambiarla no debería costar un despliegue.
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

export async function GET(req: Request) {
  if (!autorizada(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
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

  const base = process.env.NEXTAUTH_URL ?? process.env.APP_URL;

  const r = await enviarCorreo({
    para,
    asunto: asuntoSemanal(d),
    html: cuerpoSemanal(d, base ? `${base}/proyectos?vista=semanal` : undefined),
  });

  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.motivo }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    enviado: true,
    para,
    proyectos: d.filas.length,
    enRojo: d.enRojo,
  });
}
