import "server-only";

import type { FilaSemanal, ReporteSemanal } from "./semanal";

/**
 * El reporte semanal, en un correo.
 *
 * Tabla y estilos en línea, sin `<style>` ni flexbox: Outlook y Gmail
 * descartan las hojas embebidas y no entienden el layout moderno, y lo que
 * aquí se ve como una rejilla llegaría al buzón como una columna de texto
 * suelto. Con tablas y atributos en cada celda se ve igual en los dos.
 *
 * Sale de la MISMA función que la pantalla (`reporteSemanal`), así que lo que
 * llega al buzón y lo que se abre en la app no pueden discrepar.
 */

const VERDE = "#178A49";
const AMBAR = "#B07C10";
const ROJO = "#B23A40";
const NAVY = "#102039";
const TINTA = "#3B4A5E";
const SUAVE = "#8A97A8";
const LINEA = "#E4E9EF";

const fmt = (n: number) =>
  Math.round(n).toLocaleString("es-MX", { maximumFractionDigits: 0 });

const LUZ: Record<FilaSemanal["luz"], { ink: string; soft: string; texto: string }> = {
  rojo: { ink: ROJO, soft: "#FBEAEB", texto: "Sin horas" },
  ambar: { ink: AMBAR, soft: "#FDF3DC", texto: "Ajustado" },
  verde: { ink: VERDE, soft: "#E4F8EB", texto: "Holgado" },
  gris: { ink: SUAVE, soft: "#F2F5F8", texto: "Sin cotizar" },
};

const dia = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(new Date(`${iso}T12:00:00.000Z`));

/** Escapa lo que venga de la base: un nombre con `&` rompería el HTML. */
function esc(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function asuntoSemanal(d: ReporteSemanal): string {
  const alerta = d.enRojo > 0 ? ` · ${d.enRojo} sin horas` : "";
  return `Reporte semanal · ${d.filas.length} proyectos${alerta}`;
}

/**
 * La barra de consumo, como una tabla.
 *
 * Una `<div>` con ancho en porcentaje no sobrevive a Outlook, que la colapsa;
 * una tabla de dos celdas con `width` sí. Es fea por dentro y correcta por
 * fuera, que es lo que importa en un correo.
 */
function barra(f: FilaSemanal): string {
  if (f.cotizadas <= 0) return "";

  const escala = Math.max(f.cotizadas, f.registradas, 1);
  const pasado = f.registradas > f.cotizadas;
  const usado = Math.min(100, Math.round((f.registradas / escala) * 100));
  const resto = 100 - usado;

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           width="100%" style="border-collapse:collapse;margin-top:5px">
      <tr>
        <td width="${usado}%" height="8"
            style="background:${pasado ? ROJO : NAVY};font-size:0;line-height:0;border-radius:4px 0 0 4px">&nbsp;</td>
        ${
          resto > 0
            ? `<td width="${resto}%" height="8" style="background:#DCE6EE;font-size:0;line-height:0;border-radius:0 4px 4px 0">&nbsp;</td>`
            : ""
        }
      </tr>
    </table>`;
}

function fila(f: FilaSemanal): string {
  const luz = LUZ[f.luz];
  const pasado = f.disponibles !== null && f.disponibles < 0;

  const saldo =
    f.disponibles === null
      ? luz.texto
      : pasado
        ? `${fmt(-f.disponibles)} h de más`
        : `quedan ${fmt(f.disponibles)} h`;

  return `
    <tr>
      <td style="padding:11px 0;border-bottom:1px solid ${LINEA}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="font:600 13px/1.3 Arial,Helvetica,sans-serif;color:${NAVY}">
              ${esc(f.proyecto)}
              ${
                f.cliente
                  ? `<span style="font:400 11px/1.3 Arial,Helvetica,sans-serif;color:${SUAVE}"> · ${esc(f.cliente)}</span>`
                  : ""
              }
            </td>
            <td align="right" style="white-space:nowrap;padding-left:10px">
              <span style="font:700 12px/1.3 Arial,Helvetica,sans-serif;color:${TINTA}">+${fmt(f.semana)} h</span>
              <span style="font:400 11px/1.3 Arial,Helvetica,sans-serif;color:${SUAVE}">
                &nbsp;${
                  f.cotizadas > 0
                    ? `${fmt(f.registradas)} / ${fmt(f.cotizadas)} h`
                    : `${fmt(f.registradas)} h`
                }
              </span>
              <span style="font:700 12px/1.3 Arial,Helvetica,sans-serif;color:${luz.ink}">
                &nbsp;${f.uso === null ? "—" : `${f.uso}%`}
              </span>
              <span style="font:700 11px/1.3 Arial,Helvetica,sans-serif;color:${luz.ink};background:${luz.soft};padding:3px 9px;border-radius:99px">
                ${saldo}
              </span>
            </td>
          </tr>
        </table>
        ${barra(f)}
      </td>
    </tr>`;
}

export function cuerpoSemanal(d: ReporteSemanal, enlace?: string): string {
  if (d.filas.length === 0) {
    return `
      <div style="font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${TINTA};padding:24px">
        Del ${dia(d.desde)} al ${dia(d.hasta)} nadie registró horas en ningún
        proyecto.
      </div>`;
  }

  const kpi = (rotulo: string, valor: string, tono: string) => `
    <td width="25%" style="padding:0 6px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="background:#fff;border:1px solid ${LINEA};border-radius:10px">
        <tr><td style="padding:11px 13px">
          <div style="font:700 9px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${SUAVE}">${rotulo}</div>
          <div style="font:700 21px/1.2 Arial,Helvetica,sans-serif;color:${tono};padding-top:2px">${valor}</div>
        </td></tr>
      </table>
    </td>`;

  return `
<div style="background:#F4F7FA;padding:26px 0;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680"
             style="width:680px;max-width:96%">

        <tr><td style="padding:0 6px 16px">
          <div style="font:700 19px/1.3 Arial,Helvetica,sans-serif;color:${NAVY}">Reporte semanal</div>
          <div style="font:400 13px/1.5 Arial,Helvetica,sans-serif;color:${SUAVE};padding-top:3px">
            Del ${dia(d.desde)} al ${dia(d.hasta)} · en qué se trabajó y a cuál se le están acabando las horas
          </div>
        </td></tr>

        <tr><td style="padding-bottom:14px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              ${kpi("Proyectos", String(d.filas.length), NAVY)}
              ${kpi("Horas reportadas", fmt(d.horasSemana), NAVY)}
              ${kpi("Personas", String(d.personas), NAVY)}
              ${kpi("Sin horas", String(d.enRojo), d.enRojo > 0 ? ROJO : VERDE)}
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 6px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="background:#fff;border:1px solid ${LINEA};border-radius:12px">
            <tr><td style="padding:6px 16px 14px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${d.filas.map(fila).join("")}
              </table>
            </td></tr>
          </table>
        </td></tr>

        ${
          enlace
            ? `<tr><td align="center" style="padding:18px 6px 0">
                 <a href="${enlace}" style="font:700 12px/1.3 Arial,Helvetica,sans-serif;color:#fff;background:${NAVY};padding:10px 20px;border-radius:9px;text-decoration:none">
                   Abrir el Gestor de Actividad
                 </a>
               </td></tr>`
            : ""
        }

        <tr><td align="center" style="padding:18px 6px 0">
          <div style="font:400 10.5px/1.5 Arial,Helvetica,sans-serif;color:${SUAVE}">
            Gestor de Actividad · SOHERSA. Este correo se envía solo, los lunes
            por la mañana.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</div>`;
}
