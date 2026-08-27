import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LoginClient from "./login-client";

export default async function LoginPage() {
  // Quien ya tiene sesión no debería volver a ver esta pantalla; el SSO por
  // cookie compartida hace que llegue aquí ya autenticado desde el portal.
  const sesion = await auth();
  if (sesion?.user) redirect("/actividad");

  return (
    <main className="min-h-screen" style={{ background: "var(--soh-bg-base)" }}>
      <Suspense fallback={<Esqueleto />}>
        <LoginClient />
      </Suspense>
    </main>
  );
}

function Esqueleto() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm animate-pulse space-y-4">
        <div
          className="h-16 w-16 rounded-2xl mx-auto"
          style={{ background: "var(--soh-bg-elevated)" }}
        />
        <div
          className="h-7 rounded-lg w-2/3 mx-auto"
          style={{ background: "var(--soh-bg-elevated)" }}
        />
        <div
          className="h-12 rounded-xl mt-8"
          style={{ background: "var(--soh-bg-card)" }}
        />
      </div>
    </div>
  );
}
