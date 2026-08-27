/**
 * Quién tiene permitido entrar, antes siquiera de mirar el padrón.
 *
 * Funciones puras y testeables sin base de datos. El criterio es el mismo que
 * aplican el portal y las demás herramientas, para que esta no sea ni más
 * permisiva ni más restrictiva que ellas.
 */

const DOMINIO_OMISION = "gruposohersa.com";

function dominioPermitido(): string {
  return (process.env.ALLOWED_DOMAIN ?? DOMINIO_OMISION).toLowerCase();
}

function listaDeVariable(nombre: string): string[] {
  return (process.env[nombre] ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export function extraerDominio(correo: string): string {
  return correo.toLowerCase().split("@")[1] ?? "";
}

/**
 * Cualquiera del dominio corporativo, más los correos externos listados
 * explícitamente en ALLOWED_EMAILS.
 *
 * Pasar este filtro no basta para entrar: después hay que estar en el padrón
 * (core.persona). Ver el callback signIn.
 */
export function esCorreoPermitido(correo: string): boolean {
  const normalizado = correo.trim().toLowerCase();
  if (!normalizado.includes("@")) return false;
  if (extraerDominio(normalizado) === dominioPermitido()) return true;
  return listaDeVariable("ALLOWED_EMAILS").includes(normalizado);
}
