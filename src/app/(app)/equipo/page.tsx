import { exigirAdmin } from "@/modules/identidad/infrastructure/wiring";
import { db } from "@/lib/db/client";
import { HERRAMIENTA } from "@/modules/identidad/domain/persona.entity";
import { EquipoScreen } from "@/components/gestor/EquipoScreen";

export const revalidate = 0;

/**
 * Permisos del gestor: quién aprueba a quién y qué ve cada persona.
 *
 * No usa `exigirSeccion`: esta pantalla no se oculta por sección sino por
 * administración. Quien no administre no tiene nada que hacer aquí.
 */
export default async function EquipoPage() {
  const persona = await exigirAdmin();

  const filas = await db.persona.findMany({
    where: { tipo: { not: "SISTEMA" } },
    select: {
      id: true,
      nombre: true,
      activo: true,
      esAdmin: true,
      foto: true,
      coordinadorId: true,
      correos: { where: { principal: true }, select: { correo: true }, take: 1 },
      roles: {
        where: { herramientaClave: HERRAMIENTA },
        select: { rolClave: true, seccionesOcultas: true },
        take: 1,
      },
    },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });

  return (
    <EquipoScreen
      miembros={filas.map((f) => ({
        // La pantalla llama `email` a la clave de cada persona porque en el
        // portal lo era. Aquí se manda el id de core.persona, que es la
        // identidad real; las acciones lo reciben con ese mismo nombre.
        email: f.id,
        correo: f.correos[0]?.correo ?? null,
        userName: f.nombre,
        // Quien no tenga papel asignado en esta herramienta entra como
        // colaborador: es el mínimo razonable, y no se le niega el acceso
        // porque falte una fila en core.persona_rol.
        role: f.roles[0]?.rolClave ?? "COLABORADOR",
        approverEmail: f.coordinadorId,
        active: f.activo,
        isAdmin: f.esAdmin,
        hiddenSections: f.roles[0]?.seccionesOcultas ?? [],
        photo: f.foto,
      }))}
      yo={persona.id}
    />
  );
}
