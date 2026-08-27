"use client";

import { signOut } from "next-auth/react";
import Image from "next/image";
import { LogOut, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Rol } from "@/modules/identidad/domain/persona.entity";

const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: "Admin",
  DIRECCION: "Dirección",
  COORDINADOR: "Coordinador",
  COLABORADOR: "Colaborador",
  LECTURA: "Lectura",
  EXTERNO: "Externo",
};

const COLOR_ROL: Record<Rol, { bg: string; text: string; border: string }> = {
  ADMIN:       { bg: "rgba(168,85,247,0.12)", text: "#8B3FD6", border: "rgba(168,85,247,0.25)" },
  DIRECCION:   { bg: "rgba(230,149,0,0.12)",  text: "#B57200", border: "rgba(230,149,0,0.25)" },
  COORDINADOR: { bg: "rgba(37,99,235,0.10)",  text: "#2563EB", border: "rgba(37,99,235,0.25)" },
  COLABORADOR: { bg: "var(--soh-accent-glow)", text: "var(--soh-accent-dim)", border: "rgba(55,211,91,0.30)" },
  LECTURA:     { bg: "rgba(133,147,168,0.12)", text: "var(--soh-text-secondary)", border: "var(--soh-border)" },
  EXTERNO:     { bg: "rgba(133,147,168,0.12)", text: "var(--soh-text-secondary)", border: "var(--soh-border)" },
};

interface Props {
  usuario: {
    nombre: string;
    correo: string | null;
    foto: string | null;
    rol: Rol;
    area: string | null;
  };
  /** Título de la pantalla actual, a la izquierda. */
  titulo?: string;
}

export function Topbar({ usuario, titulo }: Props) {
  const [abierto, setAbierto] = useState(false);
  const color = COLOR_ROL[usuario.rol] ?? COLOR_ROL.COLABORADOR;
  const iniciales = usuario.nombre
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <header
      className="h-16 flex items-center justify-between px-6 shrink-0"
      style={{
        background: "var(--soh-bg-card)",
        borderBottom: "1px solid var(--soh-border)",
      }}
    >
      <div className="min-w-0">
        {titulo && (
          <h1
            className="soh-display text-base truncate"
            style={{ color: "var(--soh-text-primary)" }}
          >
            {titulo}
          </h1>
        )}
      </div>

      <div className="relative shrink-0">
        <button
          onClick={() => setAbierto(!abierto)}
          className="flex items-center gap-3 px-3 py-2 rounded-xl transition-colors"
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--soh-bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          aria-haspopup="true"
          aria-expanded={abierto}
          aria-label="Menú de usuario"
        >
          <div
            className="w-8 h-8 rounded-full overflow-hidden shrink-0"
            style={{ border: "1.5px solid var(--soh-border)" }}
          >
            {usuario.foto ? (
              <Image
                src={usuario.foto}
                alt={usuario.nombre}
                width={32}
                height={32}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: "var(--soh-accent-glow)",
                  color: "var(--soh-accent-dim)",
                }}
              >
                {iniciales}
              </div>
            )}
          </div>

          <div className="hidden sm:block text-left">
            <p
              className="text-sm font-medium leading-tight"
              style={{ color: "var(--soh-text-primary)" }}
            >
              {usuario.nombre.split(" ")[0]}
            </p>
            <span
              className="inline-block text-xs px-1.5 py-px rounded-md font-medium"
              style={{
                background: color.bg,
                color: color.text,
                border: `1px solid ${color.border}`,
              }}
            >
              {ETIQUETA_ROL[usuario.rol] ?? usuario.rol}
            </span>
          </div>

          <ChevronDown
            className="w-3.5 h-3.5 transition-transform duration-150"
            style={{
              color: "var(--soh-text-muted)",
              transform: abierto ? "rotate(180deg)" : "rotate(0deg)",
            }}
            aria-hidden="true"
          />
        </button>

        {abierto && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setAbierto(false)}
              aria-hidden="true"
            />
            <div
              className="absolute right-0 top-full mt-2 w-64 z-20 rounded-xl shadow-2xl overflow-hidden soh-pop-in"
              style={{
                background: "var(--soh-bg-card)",
                border: "1px solid var(--soh-border)",
              }}
            >
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--soh-border)" }}>
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: "var(--soh-text-primary)" }}
                >
                  {usuario.nombre}
                </p>
                {usuario.correo && (
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--soh-text-muted)" }}>
                    {usuario.correo}
                  </p>
                )}
                {usuario.area && (
                  <p className="text-xs truncate mt-1" style={{ color: "var(--soh-text-secondary)" }}>
                    {usuario.area}
                  </p>
                )}
              </div>

              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors"
                style={{ color: "var(--soh-text-secondary)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(224,54,79,0.08)";
                  e.currentTarget.style.color = "var(--soh-error)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--soh-text-secondary)";
                }}
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
