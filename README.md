# Gestor de Actividad — SOHERSA

Registro de horas, ausencias, tickets de mantenimiento, permisos del gestor y
estatus de proyectos. Sale del Digital Core para ser una herramienta propia.

## Arrancar

```bash
npm install
npm run dev          # http://localhost:3005
```

Los puertos de la plataforma: portal 3000, Deal Engine 3001, Record Hub 3002,
Evaluación 360 3003, Knowledge Grid 3004, **Gestor 3005**.

## Las cinco secciones

| Ruta | Qué hace |
|------|----------|
| `/actividad` | Registro de horas por semana, tablero del histórico |
| `/ausencias` | Vacaciones, permisos e incapacidades, con saldo y aprobación |
| `/tickets`   | Mantenimiento interno de software y hardware |
| `/proyectos` | Radar de horas: cotizadas contra registradas |
| `/equipo`    | Papeles, quién aprueba a quién y qué secciones ve cada quien |

## Arquitectura

La misma del Deal Engine: tres capas por módulo, con las dependencias hacia
adentro.

```
src/modules/<modulo>/
  domain/           lógica PURA. No conoce Prisma, ni Next, ni la base.
  application/      casos de uso + ports (interfaces que la infra implementa).
  infrastructure/   la única capa que toca Prisma. wiring.ts lo cablea todo.
```

**Regla de dependencias:** `infrastructure → application → domain`. El dominio
no importa nada de fuera; la aplicación importa dominio y sus ports; la
infraestructura conoce Prisma. Las páginas y Server Actions importan SOLO
`infrastructure/wiring.ts`, nunca un repositorio ni un port.

Módulos: `identidad`, `actividad`, `ausencias`, `tickets`, `proyectos`.

## La base de datos

Una sola base en Neon, dividida en schemas de PostgreSQL:

| Schema | Dueño | Esta herramienta |
|--------|-------|------------------|
| `core` | compartido | **lee** personas, proyectos, clientes, roles |
| `actividad` | nuestro | lee y escribe |
| `deal`, `hub`, `eval`, `grid`, `public` | otras | no se tocan |

`core` es dueño de personas, proyectos y clientes. Esta herramienta los
REFERENCIA por clave foránea; nunca guarda su propia copia. Por eso no existe
ningún modelo `TeamMember` ni tabla de proyectos.

### Cómo se identifica a una persona

**No por su correo.** Cuatro personas entran con su Gmail en una herramienta y
con el correo de empresa en otra. El padrón es `core.persona` (53 personas) más
`core.persona_correo` (55 correos, uno principal por persona):

```ts
where: { correos: { some: { correo: email.toLowerCase() } } }
```

`persona_id` es obligatorio en las tablas de `actividad` y **no lo rellena
ningún disparador**: la aplicación lo resuelve antes de insertar.

### Zona horaria

La conexión pide `timezone=America/Mexico_City`. Se guarda el instante exacto y
se muestra en hora de México. Hay dos clases de dato que no se tratan igual —
día de calendario (`date`) e instante (`timestamptz`); ver `src/lib/fechas`.

Para el día de hoy se usa `hoyEnMexico()`, no `new Date().toISOString()`: eso
último da el día de UTC, y a las 7 de la tarde en Guadalajara ya es mañana.

## Traer los datos de las hojas

Los datos históricos y actuales viven en el gestor de spreadsheets
(«SOH-SI-BD_BASES DE DATOS»). El mapa de columnas está en
[docs/MAPA-HOJAS.md](docs/MAPA-HOJAS.md).

```bash
# 1. Autorizar Google una vez (deja un refresh_token en .env.local)
npx tsx --env-file=.env.local scripts/autorizar-google.ts

# 2. Simulacro: dice qué haría, sin escribir nada
npm run ingesta:hojas

# 3. Aplicar de verdad
npm run ingesta:hojas -- --aplicar

# ...y contra producción
npm run ingesta:hojas -- --aplicar --produccion
```

La ingesta **no inventa personas ni proyectos** (lo que no esté en `core` se
reporta y se queda fuera), **no borra nada** y es idempotente: la clave de cada
fila se deriva de su contenido, así que correrla dos veces no duplica.

### Saldos de vacaciones

```bash
npx tsx --env-file=.env.local scripts/migrar-saldos-vacaciones.ts            # simulacro
npx tsx --env-file=.env.local scripts/migrar-saldos-vacaciones.ts --aplicar
```

Lleva `public.VacationBlock` a `actividad.saldo_vacaciones` resolviendo el
correo contra el padrón. No toca `public`.

## Comprobar antes de dar nada por terminado

```bash
npm run verificar                 # local
npm run verificar -- --produccion
```

Comprueba que ninguna hora quede sin persona ni sin proyecto, que las cifras
cuadren con la referencia y que `core.v_sin_enlazar` no haya crecido.

## Entrar a la aplicación

Login con Google, restringido a `@gruposohersa.com` más lo que liste
`ALLOWED_EMAILS`. Además hay que estar en `core.persona`: quien no esté en el
padrón no entra, porque sus horas no tendrían a quién apuntar.

La sesión se comparte con el portal y Deal Engine (mismo `AUTH_SECRET`, mismo
prefijo de cookie `authjs.`), así que entrar en una es entrar en todas.

Para revisar pantallas sin pasar por Google, en desarrollo:

```
DEV_CORREO_SIMULADO=a.orozco@gruposohersa.com
```

Solo funciona fuera de producción. Coméntala para usar el login real.
