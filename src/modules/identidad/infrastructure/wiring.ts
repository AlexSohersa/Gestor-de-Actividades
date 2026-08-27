// Módulo Identidad · INFRAESTRUCTURA · Composición (wiring).
//
// Punto único donde se conectan los casos de uso con sus implementaciones
// concretas. Las páginas y Server Actions importan ESTAS funciones ya
// cableadas, nunca el repositorio ni los ports.

import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaPersonaRepository } from "./persona.repository";
import {
  type Persona,
  type Seccion,
  veSeccion,
  veToda,
} from "../domain/persona.entity";
import type { CambioPermiso } from "../application/ports";

/**
 * La persona con la sesión abierta, o null.
 *
 * Va envuelto en `cache` de React: dentro de una misma petición, el layout, la
 * página y cada Server Action lo llaman por separado, y sin esto serían cuatro
 * viajes a la base para resolver el mismo correo.
 */
export const personaActual = cache(async (): Promise<Persona | null> => {
  // Atajo SOLO para desarrollo: permite abrir la aplicación como una persona
  // concreta sin pasar por Google, para poder revisar pantallas con datos
  // reales. La doble condición es deliberada — la variable por sí sola no basta
  // si alguien la copiara a producción por descuido.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_CORREO_SIMULADO
  ) {
    return prismaPersonaRepository.porCorreo(process.env.DEV_CORREO_SIMULADO);
  }

  const sesion = await auth();
  const correo = sesion?.user?.email;
  if (!correo) return null;
  return prismaPersonaRepository.porCorreo(correo);
});

/**
 * La persona con sesión, o corta la petición.
 *
 * Es lo que usan las Server Actions: si no hay sesión no hay nada que hacer, y
 * devolver null obligaría a comprobarlo en cada una de ellas.
 */
export async function exigirPersona(): Promise<Persona> {
  const persona = await personaActual();
  if (!persona) redirect("/login");
  if (!persona.activo) redirect("/login?error=inactiva");
  return persona;
}

/**
 * Exige además que la sección esté visible para esta persona.
 *
 * Ocultar el enlace del menú no impide escribir la dirección a mano, así que
 * cada página protegida llama a esto antes de consultar nada.
 */
export async function exigirSeccion(seccion: Seccion): Promise<Persona> {
  const persona = await exigirPersona();
  if (!veSeccion(persona, seccion)) redirect("/");
  return persona;
}

/// Exige permisos de administración (pantalla /equipo).
export async function exigirAdmin(): Promise<Persona> {
  const persona = await exigirPersona();
  if (!veToda(persona)) redirect("/");
  return persona;
}

export function listarEquipoWired() {
  return prismaPersonaRepository.listarEquipo();
}

export function listarAprobadoresWired() {
  return prismaPersonaRepository.listarAprobadores();
}

export function aCargoDeWired(coordinadorId: string) {
  return prismaPersonaRepository.aCargoDe(coordinadorId);
}

export function cambiarPermisoWired(
  personaId: string,
  cambio: CambioPermiso,
  hechoPor: string,
) {
  return prismaPersonaRepository.cambiarPermiso(personaId, cambio, hechoPor);
}

export function contarAdminsExceptoWired(personaId: string) {
  return prismaPersonaRepository.contarAdminsExcepto(personaId);
}

export function registrarVisitaWired(personaId: string) {
  return prismaPersonaRepository.registrarVisita(personaId);
}
