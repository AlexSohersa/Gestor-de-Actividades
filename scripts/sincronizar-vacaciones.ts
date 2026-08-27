/**
 * RECONSTRUYE los saldos de vacaciones desde la hoja OFICIAL.
 *
 *   npx tsx --env-file=.env.local scripts/sincronizar-vacaciones.ts            (simulacro)
 *   npx tsx --env-file=.env.local scripts/sincronizar-vacaciones.ts --aplicar
 *
 * La fuente de verdad es `BASES DE DATOS!DH:EF` de cualquier gestor personal:
 * es la misma tabla en todos los libros y la que alimenta el panel que la
 * gente ve hoy. Trae, por persona: días liberados, tomados, vencidos, los dos
 * próximos vencimientos y las tres liberaciones siguientes.
 *
 * Antes esto salía de `public.VacationBlock`, la tabla del portal antiguo.
 * Además de no ser la fuente oficial, esa tabla NO EXISTE en producción: los
 * bloques llegaron incompletos y a alguien con 13 días disponibles la
 * herramienta le mostraba 9.
 *
 * Se traduce a bloques así:
 *   - Un bloque VIVO por cada vencimiento anunciado, con los días que quedan.
 *   - Un bloque FUTURO por cada liberación, con su fecha.
 *   - `usados` guarda los días tomados, para poder enseñar "10 de 12".
 *
 * Es idempotente: reemplaza los bloques de cada persona por los de la hoja.
 * Solo toca a quien aparece en la tabla con datos numéricos.
 */

import { sql, servidor } from "./lib/neon-http";

const APLICAR = process.argv.includes("--aplicar");

/** Cualquier gestor sirve: la tabla DH:EF es la misma en todos. */
const LIBRO = "11dqQd0-vgX7M51uocClzZR7-uMTgQllHWmqHvq5c_pw";
const RANGO = "BASES DE DATOS!DH4:EF60";

/** Un día de la hoja (D/M/AAAA) como AAAA-MM-DD. */
function fecha(t: unknown): string | null {
  const m = String(t ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Un número de la hoja; "N/A" y vacío cuentan como ausencia de dato. */
function num(t: unknown): number | null {
  const v = String(t ?? "").trim();
  if (!v || v.toUpperCase() === "N/A") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const norm = (t: unknown) =>
  String(t ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

async function leerHoja() {
  const { google } = await import("googleapis");
  const [{ g }] = await sql<{ g: string }>(
    `select google_refresco g from core.persona
      where google_refresco is not null limit 1`,
  );
  const auth = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  auth.setCredentials({ refresh_token: g });
  const s = google.sheets({ version: "v4", auth });
  const r = await s.spreadsheets.values.get({
    spreadsheetId: LIBRO,
    range: RANGO,
    valueRenderOption: "FORMATTED_VALUE",
  });
  return (r.data.values ?? []).filter((x) => String(x[0] ?? "").trim());
}

async function main() {
  console.log("\n╭──────────────────────────────────────────────╮");
  console.log("│  Vacaciones desde la hoja OFICIAL            │");
  console.log("╰──────────────────────────────────────────────╯");
  console.log(`  Servidor: ${servidor}`);
  console.log(`  Modo: ${APLICAR ? "\x1b[31mAPLICAR\x1b[0m" : "simulacro"}\n`);

  const filas = await leerHoja();
  console.log(`  ${filas.length} personas en la tabla oficial`);

  // El padrón, para emparejar por nombre corto.
  const padron = await sql<{ id: string; nombre: string; corto: string | null }>(
    `select id, nombre, nombre_usuario corto from core.persona`,
  );
  const porNombre = new Map<string, string>();
  for (const p of padron) {
    porNombre.set(norm(p.corto ?? p.nombre), p.id);
    porNombre.set(norm(p.nombre), p.id);
  }

  const plan: {
    personaId: string;
    nombre: string;
    liberados: number;
    tomados: number;
    disponibles: number;
    bloques: {
      dias: number;
      usados: number;
      vence: string | null;
      libera: string | null;
    }[];
  }[] = [];

  const sinPareja: string[] = [];
  const sinDatos: string[] = [];
  const sinFecha: string[] = [];

  for (const f of filas) {
    const nombre = String(f[0]).trim();
    const personaId = porNombre.get(norm(nombre));
    if (!personaId) {
      sinPareja.push(nombre);
      continue;
    }

    const liberados = num(f[6]);
    const tomados = num(f[7]);
    const disponibles = num(f[9]);

    // "N/A" = esa persona todavía no cumple para vacaciones. No se inventa.
    if (liberados === null || disponibles === null) {
      sinDatos.push(nombre);
      continue;
    }

    /*
     * Cifras imposibles: la hoja se equivoca cuando falta la fecha de arranque.
     *
     * Sin ella calcula "126 años de antigüedad" y otorga 429 días. Son seis
     * personas dadas de alta hace poco. Copiar eso les daría un saldo que no
     * existe y que alguien podría llegar a pedir, así que se dejan fuera y se
     * informa: el arreglo es poner su fecha de ingreso en la hoja.
     */
    if (liberados > 100) {
      sinFecha.push(`${nombre} (${liberados} días)`);
      continue;
    }

    const bloques: {
      dias: number;
      usados: number;
      vence: string | null;
      libera: string | null;
    }[] = [];

    /*
     * Los VIVOS: lo que ya se puede tomar, repartido por vencimiento.
     *
     * La hoja anuncia hasta dos: "próximo vencimiento" y "siguiente". Los días
     * que van en cada uno son los que quedan, no los del periodo entero.
     */
    const venc1 = fecha(f[11]);
    const dias1 = num(f[13]) ?? 0;
    const venc2 = fecha(f[15]);
    const dias2 = num(f[17]) ?? 0;

    if (venc1 && dias1 > 0) {
      bloques.push({ dias: dias1, usados: 0, vence: venc1, libera: null });
    }
    if (venc2 && dias2 > 0) {
      bloques.push({ dias: dias2, usados: 0, vence: venc2, libera: null });
    }

    /*
     * Si los vencimientos no cubren lo disponible, va un bloque sin fecha con
     * la diferencia: lo que importa es que la suma cuadre con la hoja.
     */
    const enVivos = bloques.reduce((n, b) => n + b.dias, 0);
    if (enVivos < disponibles) {
      bloques.push({
        dias: disponibles - enVivos,
        usados: 0,
        vence: venc2 ?? venc1,
        libera: null,
      });
    }

    // Los FUTUROS: otorgados pero aún no disponibles.
    for (const [fi, di] of [
      [f[19], f[20]],
      [f[21], f[22]],
      [f[23], f[24]],
    ] as const) {
      const cuando = fecha(fi);
      const cuantos = num(di);
      if (cuando && cuantos && cuantos > 0) {
        bloques.push({
          dias: cuantos,
          usados: 0,
          vence: null,
          libera: cuando,
        });
      }
    }

    plan.push({
      personaId,
      nombre,
      liberados,
      tomados: tomados ?? 0,
      disponibles,
      bloques,
    });
  }

  console.log(`  ${plan.length} con datos · ${sinDatos.length} sin vacaciones aún`);
  if (sinFecha.length) {
    console.log(
      `  [33m![0m ${sinFecha.length} con cifras imposibles (falta su fecha de ingreso en la hoja):`,
    );
    sinFecha.forEach((n) => console.log(`      ${n}`));
  }
  if (sinPareja.length) {
    console.log(`  \x1b[33m!\x1b[0m ${sinPareja.length} sin pareja en el padrón: ${sinPareja.join(", ")}`);
  }

  console.log("\n  NOMBRE                    DISP  TOM  bloques");
  for (const p of plan) {
    const suma = p.bloques
      .filter((b) => !b.libera)
      .reduce((n, b) => n + b.dias, 0);
    const marca = suma === p.disponibles ? " " : "\x1b[33m!\x1b[0m";
    console.log(
      `  ${marca} ${p.nombre.padEnd(24)} ${String(p.disponibles).padStart(4)} ${String(p.tomados).padStart(4)}  ${p.bloques.length}`,
    );
  }

  if (!APLICAR) {
    console.log("\n  \x1b[33m!\x1b[0m SIMULACRO: no se escribió nada.\n");
    return;
  }

  console.log("");
  for (const p of plan) {
    // Se reemplazan los suyos: la hoja manda.
    await sql(`delete from actividad.saldo_vacaciones where persona_id = $1`, [
      p.personaId,
    ]);

    /*
     * Los días TOMADOS van en el primer bloque vivo.
     *
     * `dias` ya trae lo que QUEDA, así que `usados` no se resta otra vez: sirve
     * para que la pantalla pueda decir "10 de 12" —lo disponible sobre lo
     * liberado— en vez de "10 de 10".
     */
    let porApuntar = p.tomados;

    for (const [i, b] of p.bloques.entries()) {
      if (!b.libera && porApuntar > 0) {
        b.usados = porApuntar;
        porApuntar = 0;
      }
      await sql(
        `insert into actividad.saldo_vacaciones
           (id, persona_id, periodo, dias, usados, corte, liberado_en, vence_en)
         values ($1,$2,$3,$4,$5,NULL,$6,$7)`,
        [
          `${p.personaId}-vac-${i}`,
          p.personaId,
          i + 1,
          b.dias,
          b.usados,
          b.libera,
          b.vence,
        ],
      );
    }
    console.log(`  \x1b[32m✓\x1b[0m ${p.nombre}: ${p.bloques.length} bloque(s)`);
  }

  const [{ n }] = await sql<{ n: number }>(
    `select count(*)::int n from actividad.saldo_vacaciones`,
  );
  console.log(`\n  ${n} bloques en total\n`);
}

main().catch((e) => {
  console.error("\n  \x1b[31m✗\x1b[0m", e instanceof Error ? e.message : e, "\n");
  process.exitCode = 1;
});
