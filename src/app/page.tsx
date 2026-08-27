import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * La raíz no tiene pantalla propia: el Gestor entra directo al trabajo.
 *
 * Con sesión, a la actividad de la semana, que es a lo que viene la gente. Sin
 * ella, al login. Antes esta ruta no existía y quien escribía la dirección a
 * secas se encontraba un 404.
 */
export default async function RaizPage() {
  const sesion = await auth();

  // El atajo de desarrollo no pasa por la cookie de sesión, así que aquí
  // también hay que reconocerlo o la raíz mandaría al login en local.
  const enDesarrollo =
    process.env.NODE_ENV !== "production" && !!process.env.DEV_CORREO_SIMULADO;

  if (sesion?.user || enDesarrollo) redirect("/actividad");
  redirect("/login");
}
