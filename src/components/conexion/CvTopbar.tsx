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
      className="soh-hero"
      style={{
        position: "relative",
        height: 64,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "0 26px",
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={name} email={email} image={image} size={34} online={false} />

          <div className="hidden sm:block" style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--soh-dk-2)" }}>
              {name ?? "Sin nombre"}
            </div>
            <div
              className="soh-mono"
              style={{ fontSize: 9.5, color: "var(--soh-text-2)", whiteSpace: "nowrap" }}
            >
              {email}
            </div>
          </div>
        </div>

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
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.1)",
              background: "rgba(255,255,255,.04)",
              color: "var(--soh-text-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <LogOut size={16} />
          </button>
        </form>
      </div>
    </header>
  );
}
