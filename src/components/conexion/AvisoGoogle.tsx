"use client";

import { useState, useTransition } from "react";
import { ShieldAlert, X } from "lucide-react";

import { reconectarGoogle } from "@/app/login/actions";

/**
 * "Falta un permiso" — para quien nunca pasó por el consentimiento del Gestor.
 *
 * La sesión se comparte entre las herramientas por el dominio, así que quien
 * entra desde el Digital Core llega con sesión válida y el Gestor no le pide
 * nada. Google solo entrega el `refresh_token` cuando se pasa por su pantalla
 * de permisos, de modo que esas personas —27 de las 34 que ya usaron la app—
 * se quedan sin él.
 *
 * Sin token, sus horas y checadas se guardan igual en la base, pero no pueden
 * escribirse en las hojas con SU cuenta: van a la cola y esperan a que entre
 * alguien que sí lo tenga. Conceder el permiso quita esa dependencia.
 *
 * Se puede cerrar y no vuelve a salir en esa pestaña: es un aviso, no una
 * barrera. Nadie debería quedarse sin marcar su entrada por esto.
 */
export function AvisoGoogle() {
  const [oculto, setOculto] = useState(false);
  const [pendiente, startTransition] = useTransition();

  if (oculto) return null;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "10px 14px",
        background: "#FDF3DC",
        borderBottom: "1px solid #F0D9A0",
        fontSize: 12.5,
        color: "#7A5B12",
      }}
    >
      <ShieldAlert size={16} style={{ flexShrink: 0, color: "#B07C10" }} />

      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>
        <b>Falta un permiso de Google.</b> Tu trabajo se guarda bien, pero para
        que llegue a las hojas a tu nombre hace falta autorizarlo una vez.
      </span>

      <button
        type="button"
        onClick={() =>
          startTransition(() => {
            void reconectarGoogle(window.location.pathname);
          })
        }
        disabled={pendiente}
        className="cv-btn"
        style={{
          border: "none",
          background: "#B07C10",
          color: "#fff",
          fontSize: 11.5,
          fontWeight: 700,
          padding: "7px 13px",
          borderRadius: 9,
          flexShrink: 0,
          cursor: pendiente ? "default" : "pointer",
          opacity: pendiente ? 0.7 : 1,
        }}
      >
        {pendiente ? "Abriendo…" : "Autorizar"}
      </button>

      <button
        type="button"
        onClick={() => setOculto(true)}
        aria-label="Ocultar el aviso"
        style={{
          border: "none",
          background: "none",
          padding: 4,
          cursor: "pointer",
          color: "#B07C10",
          lineHeight: 0,
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
