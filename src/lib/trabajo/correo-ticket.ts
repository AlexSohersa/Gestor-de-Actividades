import "server-only";

/**
 * El correo que anuncia un ticket nuevo.
 *
 * Mismo contenido y mismo aspecto que el del Apps Script: quien lo recibe hoy
 * en Sistemas no tiene que aprender a leer otra cosa.
 */

/**
 * Escapa lo que escribió la persona.
 *
 * La descripción de una avería entra tal cual en el HTML del correo. Sin esto,
 * un `<` en un texto como "la pantalla parpadea <2 veces>" rompe el mensaje, y
 * cualquier etiqueta pegada se interpretaría.
 */
function esc(t: unknown): string {
  return String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const COLOR_URGENCIA: Record<string, string> = {
  ALTA: "#c0392b",
  MEDIA: "#e67e22",
  BAJA: "#27ae60",
};

export function asuntoTicket(datos: {
  problema: string;
  prioridad: string;
}): string {
  return `🔧 Nuevo ticket de mantenimiento — ${datos.problema} [${datos.prioridad}]`;
}

export function cuerpoTicket(datos: {
  colaborador: string;
  correoColaborador: string;
  codigo: string;
  tipo: string;
  problema: string;
  detalles: string;
  prioridad: string;
  idCaso: string | null;
  equipo: string | null;
  anydesk: string | null;
  fecha: string;
}): string {
  const pill = COLOR_URGENCIA[datos.prioridad.toUpperCase()] ?? "#7f8c8d";

  const fila = (rotulo: string, valor: string | null) =>
    valor
      ? `<tr><td class="label">${esc(rotulo)}</td><td>${esc(valor)}</td></tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<style>
  body { margin:0; padding:0; background:#f4f6f8; font-family:Arial,sans-serif; }
  .wrapper { max-width:620px; margin:32px auto; background:#ffffff; border-radius:8px;
             overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.12); }
  .header  { background:#1a3c5e; padding:28px 36px; }
  .header h1 { margin:0; color:#ffffff; font-size:20px; font-weight:700; letter-spacing:.5px; }
  .header p  { margin:6px 0 0; color:#a8c0d6; font-size:13px; }
  .body    { padding:32px 36px; }
  .badge   { display:inline-block; padding:4px 14px; border-radius:20px; font-size:12px;
             font-weight:700; color:#fff; background:${pill}; margin-bottom:20px; }
  table    { width:100%; border-collapse:collapse; font-size:14px; }
  td       { padding:9px 0; border-bottom:1px solid #eceff1; vertical-align:top; }
  .label   { color:#78909c; width:150px; font-size:12px; text-transform:uppercase;
             letter-spacing:.4px; }
  .desc-box{ background:#f7f9fa; border-left:3px solid #1a3c5e; padding:14px 16px;
             font-size:14px; color:#37474f; border-radius:0 4px 4px 0;
             white-space:pre-wrap; }
  .footer  { background:#f7f9fa; padding:18px 36px; font-size:11px; color:#90a4ae;
             text-align:center; line-height:1.6; }
</style></head><body>
<div class="wrapper">
  <div class="header">
    <h1>Ticket de Mantenimiento</h1>
    <p>Grupo Sohersa &mdash; Sistema de Gestión de TI &mdash; ${esc(datos.fecha)}</p>
  </div>
  <div class="body">
    <span class="badge">Urgencia: ${esc(datos.prioridad)}</span>
    <table>
      ${fila("Colaborador", datos.colaborador)}
      ${fila("Correo", datos.correoColaborador)}
      ${fila("Código", datos.codigo || "—")}
      ${fila("Tipo de falla", datos.tipo)}
      ${fila("Problema", datos.problema)}
      ${fila("Equipo", datos.equipo)}
      ${fila("AnyDesk", datos.anydesk)}
      ${fila("ID Dynamics", datos.idCaso)}
    </table>
    <p style="margin:20px 0 6px;font-weight:700;font-size:13px;color:#1a3c5e;">DESCRIPCIÓN DEL PROBLEMA</p>
    <div class="desc-box">${esc(datos.detalles)}</div>
  </div>
  <div class="footer">
    Este correo fue generado automáticamente por el Gestor de Actividad.<br>
    Por favor no responda directamente a este mensaje.
  </div>
</div>
</body></html>`;
}
