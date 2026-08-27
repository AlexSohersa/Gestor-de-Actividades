"use client";

import { useState, useTransition } from "react";
import { Fingerprint } from "lucide-react";

import { checarHomeOffice, type EstadoHO } from "@/lib/gestor/homeoffice";

/**
 * Checada de home office: un botón que abre y cierra el día.
 *
 * Es el `checkHO` del Gestor. La primera vez marca entrada, la segunda salida;
 * si el primer toque llega pasadas las 3:30 PM se registra como salida, porque
 * a esa hora ya se trabajó el día.
 *
 * Solo aparece para quien tiene home office ese día: a quien está en la
 * oficina no le sirve de nada y solo ocuparía sitio.
 */
export function BotonHomeOffice({ estado }: { estado: EstadoHO }) {
  const [local, setLocal] = useState(estado);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const checar = () =>
    startTransition(async () => {
      const r = await checarHomeOffice();
      if (!r.ok) {
        setAviso(r.error ?? "No se pudo registrar.");
        return;
      }
      setAviso(`${r.tipo === "entrada" ? "Entrada" : "Salida"}: ${r.hora}`);
      setLocal(
        r.tipo === "entrada"
          ? { ...local, entrada: r.hora ?? null, siguiente: "salida" }
          : { ...local, salida: r.hora ?? null, siguiente: "cerrado" },
      );
    });

  const cerrado = local.siguiente === "cerrado";
  const texto = cerrado
    ? "Día cerrado"
    : local.siguiente === "salida"
      ? "Marcar salida"
      : "Marcar entrada";

  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        onClick={checar}
        disabled={pendiente || cerrado}
        title={
          cerrado
            ? `Entrada ${local.entrada ?? "—"} · Salida ${local.salida ?? "—"}`
            : "Checada de home office"
        }
        className="cv-btn"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          border: `1px solid ${cerrado ? "var(--cv-line)" : "#86D8A6"}`,
          background: cerrado ? "#fff" : "#F0FBF4",
          color: cerrado ? "var(--cv-ink-4)" : "#178A49",
          fontSize: 12,
          fontWeight: 700,
          padding: "9px 14px",
          borderRadius: 11,
          cursor: cerrado ? "default" : "pointer",
          opacity: pendiente ? 0.6 : 1,
        }}
      >
        <Fingerprint size={14} strokeWidth={2.2} />
        {pendiente ? "Registrando…" : texto}
      </button>

      {(aviso || local.entrada) && (
        <span
          style={{
            fontSize: 10,
            color: "var(--cv-ink-4)",
            textAlign: "center",
          }}
        >
          {aviso ??
            `Entrada ${local.entrada}${local.salida ? ` · Salida ${local.salida}` : ""}`}
        </span>
      )}
    </span>
  );
}
