"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db/client";
import { exigirPersona } from "@/modules/identidad/infrastructure/wiring";
import { veToda } from "@/modules/identidad/domain/persona.entity";
import { PANTALLA_A_ESTADO } from "./queries";
import { sincronizarEnSegundoPlano } from "@/lib/google/sincronizar";
import { crearCasoDynamics, dynamicsConfigurado } from "@/lib/dynamics/casos";
import { correoConfigurado, enviarCorreo } from "@/lib/google/correo";
import { asuntoTicket, cuerpoTicket } from "./correo-ticket";
import { folioDeTicket } from "./folio";

/**
 * Acciones de Tickets.
 *
 * Mismas firmas que en la plataforma para que `TicketsScreen` se pueda usar sin
 * retocar; por dentro escriben en `actividad.ticket` y su bitácora.
 *
 * El circuito es el del gestor de siempre: se levanta el ticket, queda "En
 * revisión", pasa por "En proceso" y termina "Resuelto". Cada
 * paso deja una línea en la bitácora, que es lo que sirve cuando la avería se
 * repite meses después.
 *
 * Al levantarlo se hacen además las dos cosas del gestor de siempre: se abre
 * el caso en Dynamics y se avisa por correo a Sistemas. Ninguna de las dos
 * puede tumbar el ticket —ya está guardado— y cada una informa por separado de
 * si salió o no: importa saber que el correo llegó aunque Dynamics fallara.
 */

/** Cómo fue con cada canal. La pantalla lo enseña tal cual. */
export type EnvioTicket = {
  dynamics: { ok: boolean; detalle: string };
  correo: { ok: boolean; detalle: string };
};

/**
 * A quién se avisa de un ticket nuevo.
 *
 * Los mismos de siempre (`destinatarios` en el Apps Script). Se puede cambiar
 * sin tocar el código con TICKETS_CORREOS, separando por comas — es lo que
 * permite probar contra la propia dirección antes de avisar a nadie más.
 */
function destinatariosTicket(): string[] {
  const config = process.env.TICKETS_CORREOS?.trim();
  if (config) {
    return config.split(",").map((c) => c.trim()).filter(Boolean);
  }
  return ["elton@gruposohersa.com", "rrhh@gruposohersa.com"];
}

export async function crearTicket(
  form: FormData,
): Promise<{ ok: boolean; error?: string; envio?: EnvioTicket }> {
  const persona = await exigirPersona();

  const title = String(form.get("title") ?? "").trim();
  const category = String(form.get("category") ?? "").trim() || "SOFTWARE";
  /*
   * El problema: del catálogo, o escrito a mano.
   *
   * Las 27 fallas del catálogo no cubren todo, así que la pantalla ofrece
   * "Otro" y un campo libre. La marca `__OTRO__` NO se guarda nunca: si viene,
   * lo que vale es lo que la persona escribió.
   */
  const problemaCrudo = String(form.get("problem") ?? "").trim();
  const problem =
    problemaCrudo === "__OTRO__"
      ? String(form.get("problemFree") ?? "").trim().slice(0, 120) || null
      : problemaCrudo || null;
  const detalle = String(form.get("detail") ?? "").trim() || null;
  const equipo = String(form.get("equipment") ?? "").trim() || null;

  const prioridadCruda = String(form.get("priority") ?? "").trim().toUpperCase();
  const prioridad = ["ALTA", "MEDIA", "BAJA"].includes(prioridadCruda)
    ? prioridadCruda
    : "MEDIA";

  if (!title) return { ok: false, error: "Describe el problema en una línea." };

  const id = randomUUID();

  // El ticket y su primera línea de bitácora van juntos: un ticket sin rastro
  // de cuándo se levantó no se puede seguir.
  await db.ticket.create({
    data: {
      // El id lo pone la aplicación: los históricos traían el suyo, así que no
      // es autogenerado. El FOLIO visible sí lo numera la base (`numero`).
      id,
      personaId: persona.id,
      titulo: title,
      detalle,
      clase: category,
      falla: problem,
      prioridad,
      equipo,
      estado: "EN_REVISION",
      eventos: {
        create: {
          id: randomUUID(),
          texto: `Ticket levantado por ${persona.nombre}.`,
        },
      },
    },
  });

  /*
   * El folio y el correo de la persona, para el caso y el aviso.
   *
   * Se leen DESPUÉS de crear: `numero` lo pone la base al insertar, y es lo
   * que se ve como código del ticket.
   */
  const creado = await db.ticket.findUnique({
    where: { id },
    select: {
      numero: true,
      creadoEn: true,
      anydesk: true,
      persona: {
        select: {
          nombre: true,
          nombreUsuario: true,
          correos: {
            where: { principal: true },
            select: { correo: true },
            take: 1,
          },
        },
      },
    },
  });

  const codigo = folioDeTicket(
    category,
    creado?.numero ?? 0,
    creado?.creadoEn ?? new Date(),
  );
  const quien = creado?.persona.nombreUsuario?.trim() || persona.nombre;
  const correoQuien = creado?.persona.correos[0]?.correo ?? "Sin correo registrado";

  /*
   * DYNAMICS.
   *
   * La descripción lleva quién lo pide, su correo y la urgencia, como armaba
   * el script: en Dynamics el caso se ve sin el contexto de esta herramienta.
   */
  const envio: EnvioTicket = {
    dynamics: { ok: false, detalle: "" },
    correo: { ok: false, detalle: "" },
  };

  if (!dynamicsConfigurado()) {
    envio.dynamics.detalle = "Dynamics no está configurado en este entorno.";
  } else {
    const r = await crearCasoDynamics({
      titulo: problem || title,
      descripcion:
        `Solicitado por: ${quien}\n` +
        `Correo: ${correoQuien}\n` +
        `Urgencia: ${prioridad}\n` +
        `Detalles: ${detalle ?? title}`,
    });

    if (r.ok) {
      envio.dynamics = { ok: true, detalle: r.idCaso };
      // El id del caso se guarda: es el puente entre este ticket y Dynamics.
      await db.ticket.update({
        where: { id },
        data: { dynamicsId: r.idCaso },
      });
    } else {
      envio.dynamics.detalle = r.motivo;
    }
  }

  /*
   * CORREO.
   *
   * Se manda aunque Dynamics haya fallado: son avisos independientes, y quien
   * atiende prefiere enterarse por correo a no enterarse.
   */
  if (!(await correoConfigurado())) {
    envio.correo.detalle = "El correo no está configurado en este entorno.";
  } else {
    const r = await enviarCorreo({
      para: destinatariosTicket(),
      asunto: asuntoTicket({ problema: problem || title, prioridad }),
      html: cuerpoTicket({
        colaborador: quien,
        correoColaborador: correoQuien,
        codigo,
        tipo: category,
        problema: problem || title,
        detalles: detalle ?? title,
        prioridad,
        idCaso: envio.dynamics.ok ? envio.dynamics.detalle : null,
        equipo,
        anydesk: creado?.anydesk ?? null,
        fecha: new Intl.DateTimeFormat("es-MX", {
          timeZone: "America/Mexico_City",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(creado?.creadoEn ?? new Date()),
      }),
    });

    envio.correo = r.ok
      ? { ok: true, detalle: r.destinatarios.join(", ") }
      : { ok: false, detalle: r.motivo };
  }

  // Lo que pasó con cada canal queda en la bitácora del ticket: dentro de un
  // mes, "no llegó el correo" se responde mirando aquí.
  await db.ticketEvento.create({
    data: {
      id: randomUUID(),
      ticketId: id,
      texto:
        `Dynamics: ${envio.dynamics.ok ? `caso ${envio.dynamics.detalle}` : `sin enviar — ${envio.dynamics.detalle}`}. ` +
        `Correo: ${envio.correo.ok ? `enviado a ${envio.correo.detalle}` : `sin enviar — ${envio.correo.detalle}`}.`,
    },
  });

  sincronizarEnSegundoPlano();
  revalidatePath("/tickets");
  return { ok: true, envio };
}

/** Añade un comentario a la bitácora del ticket. */
export async function comentarTicket(
  ticketId: string,
  texto: string,
): Promise<{ ok: boolean; error?: string }> {
  const persona = await exigirPersona();

  const limpio = texto.trim();
  if (!limpio) return { ok: false, error: "Escribe algo antes de enviar." };

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { personaId: true },
  });
  if (!ticket) return { ok: false, error: "Ese ticket ya no existe." };

  // Comenta quien lo levantó y quien atiende el mantenimiento; nadie más tiene
  // por qué escribir en una incidencia ajena.
  if (ticket.personaId !== persona.id && !veToda(persona)) {
    return { ok: false, error: "Ese ticket no es tuyo." };
  }

  await db.$transaction([
    db.ticketEvento.create({
      data: {
        id: randomUUID(),
        ticketId,
        personaId: persona.id,
        texto: limpio,
      },
    }),
    // La fecha de modificación mueve el ticket al frente de la lista: un
    // comentario nuevo es señal de que algo pasó.
    db.ticket.update({
      where: { id: ticketId },
      data: { actualizadoEn: new Date() },
    }),
  ]);

  revalidatePath("/tickets");
  return { ok: true };
}

/**
 * Cambia el estado de un ticket.
 *
 * Se llama `resolverTicket` por compatibilidad con la pantalla, pero admite
 * cualquiera de los cuatro estados: es el mismo botón el que hace avanzar la
 * incidencia por el circuito.
 */
export async function resolverTicket(
  ticketId: string,
  estadoPantalla = "Resuelto",
): Promise<{ ok: boolean; error?: string }> {
  const persona = await exigirPersona();

  const estado = PANTALLA_A_ESTADO[estadoPantalla];
  if (!estado) return { ok: false, error: "Ese estado no existe." };

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { personaId: true, estado: true },
  });
  if (!ticket) return { ok: false, error: "Ese ticket ya no existe." };
  if (ticket.estado === estado) {
    return { ok: false, error: "El ticket ya estaba así." };
  }

  const atiende = veToda(persona);
  const esPropio = ticket.personaId === persona.id;

  if (!atiende && !esPropio) {
    return { ok: false, error: "Ese ticket no es tuyo." };
  }
  // Quien lo levantó puede darlo por resuelto —si se arregló solo, esperar a
  // mantenimiento sería absurdo— pero el resto del circuito lo mueve quien
  // atiende.
  if (!atiende && estado !== "RESUELTO") {
    return {
      ok: false,
      error: "Solo puedes marcarlo como resuelto; el resto lo mueve Sistemas.",
    };
  }

  await db.$transaction([
    db.ticket.update({
      where: { id: ticketId },
      data: {
        estado,
        atendidoPor: persona.id,
        actualizadoEn: new Date(),
        // La fecha de cierre solo tiene sentido si se está cerrando; al
        // reabrirlo se limpia para que no contradiga al estado.
        cerradoEn: estado === "RESUELTO" ? new Date() : null,
      },
    }),
    db.ticketEvento.create({
      data: {
        id: randomUUID(),
        ticketId,
        personaId: persona.id,
        texto: `${persona.nombre} lo pasó a «${estadoPantalla}».`,
      },
    }),
  ]);

  revalidatePath("/tickets");
  return { ok: true };
}
