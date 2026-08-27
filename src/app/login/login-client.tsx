"use client";

import { entrarConGoogle, reconectarGoogle } from "./actions";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { GestorLogo } from "@/components/brand/GestorLogo";

/**
 * Los motivos por los que alguien puede rebotar aquí.
 *
 * Se explican en concreto y sin jerga interna: quien lee esto necesita saber a
 * quién pedirle ayuda, no cómo se llama el sistema por dentro.
 */
const MOTIVOS: Record<string, string> = {
  AccessDenied:
    "Tu cuenta todavía no está registrada. Pide a Recursos Humanos que te den de alta.",
  inactiva:
    "Tu cuenta está desactivada. Habla con Recursos Humanos si crees que es un error.",
  OAuthSignin: "No se pudo conectar con Google. Vuelve a intentarlo.",
  OAuthCallback: "Google no completó el acceso. Vuelve a intentarlo.",
  Configuration: "Hay un problema técnico con el acceso. Avisa a Sistemas.",
  Verification: "El enlace caducó. Vuelve a entrar.",
};

const LO_QUE_HACE = [
  "Reporta tus horas del día en un minuto",
  "Pide vacaciones y permisos, y sigue su aprobación",
  "Consulta cuántos días de vacaciones te quedan",
  "Mira cómo va el avance de tus proyectos",
];

export default function LoginClient() {
  const params = useSearchParams();
  const error = params.get("error");
  const destino = params.get("callbackUrl") ?? "/actividad";
  const [entrando, setEntrando] = useState(false);

  const mensaje = error
    ? (MOTIVOS[error] ?? "No se pudo iniciar sesión. Vuelve a intentarlo.")
    : null;

  return (
    <div className="w-full min-h-screen flex" style={{ background: "var(--soh-bg-base)" }}>
      {/* ── Panel de marca ─────────────────────────────────────────────
          Se esconde en pantallas estrechas: en un móvil, media pantalla de
          decoración deja el formulario abajo del pliegue. */}
      <div
        className="hidden lg:flex flex-col justify-between w-1/2 p-16 relative overflow-hidden"
        style={{ background: "var(--soh-nav-bg)" }}
      >
        {/* Resplandor verde muy tenue detrás del texto, para que el azul no
            quede plano. Sin imagen: es un degradado radial. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 30%, rgba(55,211,91,0.10), transparent 70%)",
          }}
          aria-hidden="true"
        />

        <div className="relative flex items-center gap-3">
          <GestorLogo size={44} giro="idle" />
          <span className="flex flex-col leading-tight">
            <span
              className="soh-wordmark text-[11px]"
              style={{ color: "var(--soh-accent)" }}
            >
              Sohersa
            </span>
            <span
              className="soh-display text-[17px]"
              style={{ color: "#FFFFFF" }}
            >
              Gestor
            </span>
          </span>
        </div>

        <div className="relative">
          <div
            className="soh-eyebrow inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6 text-[11px]"
            style={{
              background: "var(--soh-accent-glow)",
              color: "var(--soh-accent)",
              border: "1px solid rgba(55,211,91,0.30)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: "var(--soh-accent)" }}
            />
            Tu tiempo, en un solo lugar
          </div>

          <h1
            className="soh-display text-5xl leading-[1.02] mb-4"
            style={{ color: "#FFFFFF" }}
          >
            Gestor de
            <br />
            <span style={{ color: "var(--soh-accent)" }}>Actividad</span>
          </h1>

          <p
            className="text-base leading-relaxed max-w-sm"
            style={{ color: "var(--soh-nav-text)" }}
          >
            Registra las horas que dedicas a cada proyecto, gestiona tus
            ausencias y consulta el avance de tu trabajo.
          </p>
        </div>

        <div className="relative space-y-3">
          {LO_QUE_HACE.map((linea) => (
            <div key={linea} className="flex items-center gap-3">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle
                  cx="8"
                  cy="8"
                  r="7"
                  stroke="var(--soh-accent)"
                  strokeWidth="1.2"
                  opacity="0.4"
                />
                <path
                  d="M5 8l2 2 4-4"
                  stroke="var(--soh-accent)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-sm" style={{ color: "var(--soh-nav-text)" }}>
                {linea}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Panel del formulario ───────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center flex-1 px-6">
        <div className="w-full max-w-sm">
          {/* La marca vuelve a aparecer cuando el panel de la izquierda no cabe. */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <GestorLogo size={38} giro="idle" />
            <span className="flex flex-col leading-tight">
              <span
                className="soh-wordmark text-[10px]"
                style={{ color: "var(--soh-accent-dim)" }}
              >
                Sohersa
              </span>
              <span
                className="soh-display text-[15px]"
                style={{ color: "var(--soh-text-primary)" }}
              >
                Gestor
              </span>
            </span>
          </div>

          <h2
            className="soh-display text-2xl mb-1"
            style={{ color: "var(--soh-text-primary)" }}
          >
            Iniciar sesión
          </h2>
          <p className="text-sm mb-8" style={{ color: "var(--soh-text-secondary)" }}>
            Entra con tu cuenta de correo de SOHERSA.
          </p>

          {mensaje && (
            <div
              role="alert"
              className="flex items-start gap-3 px-4 py-3 rounded-xl mb-6 text-sm leading-relaxed soh-fade-in"
              style={{
                background: "rgba(224,54,79,0.08)",
                border: "1px solid rgba(224,54,79,0.22)",
                color: "var(--soh-error)",
              }}
            >
              <svg
                className="w-4 h-4 mt-0.5 shrink-0"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
                <path
                  d="M8 5v3.5M8 11h.01"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {mensaje}
            </div>
          )}

          <button
            onClick={() => {
              setEntrando(true);
              // La acción del servidor decide si hace falta la pantalla de
              // permisos: solo la ve quien todavía no concedió los suyos.
              void entrarConGoogle(destino);
            }}
            disabled={entrando}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl font-semibold text-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
            style={{ background: "var(--soh-accent)", color: "#FFFFFF" }}
            onMouseEnter={(e) => {
              if (!entrando) e.currentTarget.style.background = "var(--soh-accent-dim)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--soh-accent)";
            }}
          >
            {entrando ? (
              "Entrando…"
            ) : (
              <>
                <GoogleIcon />
                Continuar con Google
              </>
            )}
          </button>

          {/*
            Volver a pedir permisos.
            Google caduca los enlaces de la foto de perfil y puede revocar el
            token que permite escribir en las hojas. Cuando eso pasa no hay
            error visible: la foto sale como iniciales y lo que se aprueba deja
            de subir. Esto lo arregla sin tener que borrar cookies a mano.
          */}
          <button
            type="button"
            onClick={() => {
              setEntrando(true);
              void reconectarGoogle(destino);
            }}
            disabled={entrando}
            className="w-full mt-3 py-2.5 px-4 rounded-xl text-xs transition-colors duration-150 disabled:opacity-60"
            style={{
              background: "transparent",
              color: "var(--soh-text-muted)",
              border: "1px solid var(--soh-border)",
            }}
            onMouseEnter={(e) => {
              if (!entrando) e.currentTarget.style.color = "var(--soh-text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--soh-text-muted)";
            }}
          >
            Volver a conceder permisos de Google
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px" style={{ background: "var(--soh-border)" }} />
            <span className="text-xs" style={{ color: "var(--soh-text-muted)" }}>
              acceso interno
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--soh-border)" }} />
          </div>

          <p
            className="text-xs text-center leading-relaxed"
            style={{ color: "var(--soh-text-muted)" }}
          >
            Si no puedes entrar, pide a Recursos Humanos que revisen tu alta.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <span
      className="flex items-center justify-center w-5 h-5 rounded-full shrink-0"
      style={{ background: "#FFFFFF" }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14z"
        />
      </svg>
    </span>
  );
}
