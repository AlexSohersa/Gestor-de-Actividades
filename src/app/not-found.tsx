import Link from "next/link";
import { GestorLogo } from "@/components/brand/GestorLogo";

/**
 * Página para direcciones que no existen.
 *
 * Con la marca puesta, y no el error pelado de Next: quien llega aquí suele
 * haber escrito mal la dirección o seguido un enlace viejo, y merece una salida
 * a algún sitio útil.
 */
export default function NoEncontrado() {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--soh-bg-base)" }}
    >
      <div className="text-center max-w-sm">
        <GestorLogo size={56} giro="none" />

        <p
          className="mt-6 text-5xl font-bold tabular-nums"
          style={{ color: "var(--soh-accent)" }}
        >
          404
        </p>
        <h1
          className="mt-2 text-lg font-semibold"
          style={{ color: "var(--soh-text-primary)" }}
        >
          Esta página no existe
        </h1>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--soh-text-secondary)" }}
        >
          Puede que el enlace esté mal escrito o que apunte a una sección que ya
          se movió.
        </p>

        <Link
          href="/actividad"
          className="inline-block mt-6 px-5 py-2.5 rounded-xl text-sm font-medium soh-btn-accent"
        >
          Ir a mi actividad
        </Link>
      </div>
    </main>
  );
}
