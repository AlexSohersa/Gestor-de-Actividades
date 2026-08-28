"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { GestorLogo } from "@/components/brand/GestorLogo";
import { Avatar } from "@/components/hub/Avatar";

/**
 * La barra superior: marca a la izquierda, quién eres a la derecha.
 *
 * Es la misma del portal, con dos cambios: la marca es la de esta herramienta y
 * el cierre de sesión va por `next-auth` en el cliente en vez de por la acción
 * de servidor del portal.
 */
export function CvTopbar({
  name,
  email,
  image,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}) {
  return (
    <header
      style={{
        position: "relative",
        zIndex: 30,
        height: 58,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        background: "var(--cv-deep)",
        overflow: "hidden",
      }}
    >
      {/* -------------------------------------------------------- marca -- */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 11,
        }}
      >
        <GestorLogo size={34} giro="idle" />
        <div>
          <div
            className="soh-display"
            style={{
              fontWeight: 700,
              fontSize: 15.5,
              letterSpacing: "-0.01em",
              color: "#fff",
              lineHeight: 1.1,
              whiteSpace: "nowrap",
            }}
          >
            Gestor de Actividad
          </div>
          <div
            className="soh-mono"
            style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "var(--soh-text-2)" }}
          >
            SOHERSA
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ usuario -- */}
      <div
        style={{
          position: "relative",
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "4px 12px 4px 5px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.13)",
            background: "rgba(255,255,255,.06)",
          }}
        >
          <Avatar name={name} email={email} image={image} size={28} online={false} />
          <span className="hidden lg:block" style={{ lineHeight: 1.2 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#fff" }}>
              {name ?? "Sin nombre"}
            </span>
            <span style={{ display: "block", fontSize: 10, color: "var(--cv-dk-3)" }}>
              {email}
            </span>
          </span>
        </span>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            signOut({ callbackUrl: "/login" });
          }}
        >
          <button
            type="submit"
            title="Salir"
            aria-label="Cerrar sesión"
            className="soh-icon-btn"
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              border: "1px solid rgba(255,255,255,.13)",
              background: "rgba(255,255,255,.06)",
              color: "var(--cv-dk-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <LogOut size={15} />
          </button>
        </form>
      </div>
    </header>
  );
}
