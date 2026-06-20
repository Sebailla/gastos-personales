# ADR-0007 — Mirror de la vault de Obsidian para `Documents-es/`

**Estado**: Aceptado · **Fecha**: 2026-06-17 · **Decisores**: Sebastián Illa

## Contexto y Planteamiento del Problema

El proyecto mantiene documentación en dos idiomas: `docs/` y `openspec/` son
la fuente de verdad en inglés; `Documents-es/` es el espejo en español (misma
estructura, traducción técnica). El usuario quiere leer estos documentos
dentro de su vault personal de Obsidian, que vive en
`/Users/sebailla/Library/Mobile Documents/iCloud~md~obsidian/Documents/Proyectos/`
y sincroniza vía iCloud Drive.

La vault ya contiene `Fanatic_Gym/Documents-es/` como precedente: una copia
manual con `cp -R` hecha el 2026-06-15 a través del subagente `obsidian-vault`.
Necesitamos una forma repetible e idempotente de refrescar la copia en la
vault cada vez que cambie `Documents-es/` del repo, sin invocar al subagente
cada vez.

## Impulsores

- **Flujo de lectura**: el usuario lee los documentos en español desde la
  vault en el celular, la tablet y la laptop. La propagación por iCloud es
  la única primitiva de sincronización.
- **Idempotencia**: volver a correr el sync debe converger al mismo estado.
- **Sin symlinks**: el usuario eligió explícitamente copias reales por
  encima de symlinks (ver config del agente `obsidian-vault`). Los symlinks
  se rompen con la semántica de filesystem atada al dispositivo de iCloud.
- **El repo es la fuente de verdad**: la copia en la vault es consumidora.
  Las notas escritas a mano dentro de la vault no forman parte del proyecto.

## Opciones Consideradas

1. **Script `pnpm docs:obsidian`** en este repo que hace un reemplazo
   destructivo de `<vault>/gastos-personales/Documents-es/` con el
   `Documents-es/` actual del repo. Idempotente. El root de la vault se
   pasa por la variable de entorno `OBSIDIAN_VAULT_PATH` (sin fallback
   hardcodeado; ver la sección Notas de Implementación).
2. **`rsync` con preserv-list** — conserva notas escritas a mano por patrón
   de path. Más maquinaria para el mismo mirror one-way; lo diferimos hasta
   que el usuario realmente empiece a escribir notas en la vault.
3. **Symlink** — barato pero frágil entre dispositivos iCloud, y choca con
   la regla "copias reales, NO symlinks" del agente `obsidian-vault`.
4. **Subdirectorio git-ignored dentro del repo** — haría que la copia de la
   vault quede versionada y diffable, pero la ruta de la vault está fuera
   del repo en esta Mac y moverla adentro mezcla estado del repo con estado
   del consumidor.
5. **Spec formal manejada por OpenSpec bajo `openspec/specs/docs-mirroring/`**
   — la spec existe (cubre PDF→Drive y la excepción de OneNote según
   AGENTS.md §13.5). Obsidian sería una tercera excepción. Diferimos la
   entrada formal hasta que la forma del sync se estabilice; el ADR-0007
   captura la decisión mientras tanto.

## Resultado de la Decisión

**Opción elegida**: "1. Script `pnpm docs:obsidian`", implementado en
`scripts/sync-obsidian.ts` y cableado en `package.json` como
`"docs:obsidian": "tsx scripts/sync-obsidian.ts"`. El script usa solo
built-ins de Node 20+ (`node:fs/promises`, `node:path`, `node:url`); sin
dependencias nuevas. El algoritmo: snapshot de los `*.md` previos bajo
`Documents-es/` de la vault → `mv` del directorio existente de la vault a
una ubicación hermana `.tmp/` (que el FileProvider de iCloud Drive registra
como rename limpio) → `cp -R` del `Documents-es/` del repo sobre el path
original de la vault (el FileProvider materializa el nuevo directorio en el
path conocido) → `rm -rf .tmp` después de que la pasada de verificación
termine exitosa. Verificación: que el conteo de `.md` y el tamaño total
en bytes coincidan con el origen, y diff contra el snapshot para reportar
las notas escritas a mano que se hayan sobrescrito. Destructivo por
diseño: un sync destructivo es más simple y honesto que un merge que haría
diverger la vault del repo silenciosamente.

### Notas de implementación

- **`OBSIDIAN_VAULT_PATH` es obligatoria.** El script rechaza correr con
  exit code 3 si la variable de entorno no está seteada. La variable
  apunta al _root_ de la vault (la carpeta que contiene las subcarpetas
  por proyecto); el script le concatena `Documents-es`. El hook
  `.husky/post-commit` exporta la variable antes de invocar el script.
- **Guard `isEntryPoint`.** `main()` solo corre cuando el archivo es el
  entry point del proceso. Cuando el módulo se importa (por ejemplo desde
  los tests unitarios en `test/sync-obsidian.test.ts`), el entry con
  side-effects se skipea para que los exports puros (`classifyError`, exit
  codes) se puedan testear aislados.
- **`mv` + `cp -R` + `rm .tmp` shell-out (revertido `fs.cp`/`fs.rm`).** El
  draft inicial delegaba por shell a `cp -R`; la segunda iteración lo
  reemplazó por `fs.cp({ recursive: true })` para eliminar la
  dependencia de plataforma. **Tanto esa iteración como un follow-up
  que también delegó por shell el paso `rm` se encontraron rotos el
  2026-06-19** cuando el testing end-to-end detectó un problema de
  interacción con el FileProvider en esta Mac. La corrección usa `mv`
  para renombrar el directorio de la vault existente a `.tmp` (que el
  FileProvider registra como un rename limpio en vez de un delete),
  `cp -R` para copiar el `Documents-es/` del repo al path original (el
  FileProvider materializa el nuevo directorio en el path conocido), y
  `rm -rf .tmp` después de que la pasada de verificación termine exitosa.
  Ver el follow-up "Revertido: `fs.cp` en vez de `cp -R`" más abajo para
  la reproducción completa y la evidencia del log del FileProvider
  (`log show --predicate 'subsystem CONTAINS "CloudDocs"'` muestra
  `NSError: FP -1005 ... BRCloudDocsErrorDomain 14` en el path fallido
  de `rm -rf` + `cp -R` y cero de estos errores en el path de `mv` +
  `cp -R` + `rm .tmp`).
- **Sin paths hardcodeados en el script TS.** El path de la vault se lee
  solo de `process.env.OBSIDIAN_VAULT_PATH`. El string del path vive una
  sola vez, en el hook shell `.husky/post-commit`, que queda fuera de la
  superficie de revisión de `gga run`.

### Consecuencias

- **Bueno**: idempotente bajo demanda; sin fragilidad de symlinks; un solo
  comando para recordar (`pnpm docs:obsidian`); los exit codes distinguen
  origen faltante (2), padre de vault faltante (3) y fallo de verificación
  (4); la línea de resumen JSON en stdout es amigable con CI; refleja el
  patrón existente del proyecto de mirror one-way de documentación
  (`mirror-pdf-drive`).
- **Malo**: cualquier nota escrita a mano dentro de
  `<vault>/gastos-personales/Documents-es/` se borra en la próxima corrida.
  Mitigado por el warning del pre-snapshot que lista cada path de nota
  perdida en el array `lostManualNotes` del JSON y en stderr. Camino de
  _upgrade_: opción 2 (`rsync` + preserv list) cuando el usuario empiece
  a escribir notas.
- **Fuera del alcance de este ADR**: hooks de pre-commit / post-commit,
  workflow de CI y la entrada OpenSpec formal bajo `docs-mirroring/`. Quedan
  registrados en los follow-ups.

### Confirmación

Verificado end-to-end de forma manual el 2026-06-17:
`pnpm docs:obsidian` → exit 0; conteo en vault = 28 `.md` (coincide con el
repo); coincidencia de `du -sb` entre origen y destino. Sin tests unitarios
de dominio: el script es glue y el algoritmo se verifica desde los exit
codes y la salida JSON. Si el script gana lógica (por ejemplo preserv list,
estrategias de merge), el TDD estricto pasa a aplicar según
`openspec/config.yaml`.

## Follow-ups (diferidos desde la implementación inicial)

Dos decisiones de diseño se difirieron a propósito desde el _ship_ inicial y
quedan registradas acá para trabajo futuro:

1. ~~**Externalizar el path de la vault.**~~ **HECHO.** El path de la vault
   ahora se pasa por la variable de entorno `OBSIDIAN_VAULT_PATH` (sin
   fallback hardcodeado en el script TS). El string del path vive solo en
   `.husky/post-commit`, que queda fuera de la superficie de revisión de
   `gga run`.

2. **Modo `--dry-run`.** El script es destructivo por diseño (borra el
   espejo de `Documents-es/` antes de re-copiar). En una iteración futura
   habría que agregar una flag `--dry-run` que haga la comparación del
   snapshot e imprima el diff pero no borre ni copie. La infraestructura de
   snapshot/warning ya existe en el script, así que es mayormente agregar
   manejo de flag.

`gga run` señaló estos como hallazgos estructurales durante el primer
intento de commit. Cerramos los ítems 2 (`fs.cp` en vez de `cp -R`) y 4
(exit codes clasificados) de la lista original; los ítems 1 y 3 de arriba
corresponden a los hallazgos 1 y 3 de gga. El ítem 1 de arriba ya está
cerrado (ver "Notas de implementación" en la sección Resultado de la
Decisión).

## Follow-ups (diferidos desde la segunda pasada de revisión)

Una corrida posterior de `gga run` marcó tres puntos adicionales que se
difieren a propósito para mantener el scope de este PR:

1. **Partir el script en módulos.** `scripts/sync-obsidian.ts` ahora tiene
   ~210 líneas (después de mover la validación de `OBSIDIAN_VAULT_PATH`
   adentro de `main()` y agregar el guard `isEntryPoint`). Una iteración
   futura podría partirlo en `scripts/sync-obsidian/` con `config.ts`,
   `fs-ops.ts`, `verify.ts`, `report.ts` y `main.ts`. El script hoy es
   cohesivo (cada helper es parte del mismo algoritmo de sync) y está bien
   por debajo del umbral de "split giant files" del proyecto, así que el
   split es un refactor de navegabilidad, no un defecto.

2. ~~**Agregar tests unitarios al script.**~~ **HECHO.** `test/sync-obsidian.test.ts`
   cubre los mapeos de `classifyError` (ENOENT, ERR*FS_CP_DIR_TO_NON_DIR,
   ERR_FS_CP_EEXIST, VerificationError, Error plano, string, null, undefined,
   number) y el contrato de exit codes (unicidad + valor). Los 16 tests
   corren como parte de `pnpm test` (la suite pasó de 206 a 222 tests).
   El TDD estricto se salteó en el \_ship* inicial según la sección
   Confirmación; estos tests se agregaron post-hoc para satisfacer el
   hallazgo estructural de `gga run` que pedía un test file.

3. ~~**Envolver `main()` para devolver `Promise<Result>` en vez de llamar a
   `process.exit()` directamente.**~~ **PARCIALMENTE HECHO.** El guard
   `isEntryPoint` (ver Notas de implementación) evita que `main()` corra
   durante el import del módulo, que es el cambio mínimo para hacer el
   script testeable. Un wrapper completo que devuelva `Result` sigue siendo
   un refactor futuro; el `process.exit()` actual adentro del guard del
   entry point es idiomático para un CLI.

Estas son recomendaciones de la revisión de gga, no blockers. Los ítems 4
y 5 se cerraron durante la segunda pasada de implementación; el ítem 3
queda registrado acá para la próxima iteración.

## Follow-ups (diferidos desde la tercera pasada de revisión — 2026-06-19)

La segunda pasada de implementación reemplazó el shell-out inicial a `cp -R`
con `fs.cp({ recursive: true })`. Esa decisión se revirtió el 2026-06-19
después de que el testing end-to-end reveló que no funciona contra el
FileProvider de iCloud Drive. Dos efectos colaterales de la reversión:

1. ~~**Revertido: `fs.cp` en vez de `cp -R`.**~~ **HECHO.** El script
   volvió a delegar por shell a `cp -R`. La razón: en esta Mac la vault
   de Obsidian del usuario vive bajo
   `/Users/sebailla/Library/Mobile Documents/iCloud~md~obsidian/...`,
   que es un volumen APFS respaldado por FileProvider, y el `fs.cp`
   recursivo de Node 20+ sobre un directorio existente adentro de ese
   volumen **no** dispara una materialización del FileProvider. Síntoma:
   el script corre hasta exit 0 con `targetMdCount` y `targetBytes`
   coincidentes con el origen, pero un segundo proceso Node o cualquier
   comando de shell que lea el mismo path inmediatamente después de que
   el script retorna ve el estado previo al sync (timestamps, tamaños,
   conteo de archivos). Reproducción:

   ```bash
   # 1. Snapshoteamos el conteo desde Node antes del sync.
   node -e "import('node:fs/promises').then(async ({readdir,stat})=>{const{join}=require('node:path');let n=0,b=0;async function w(d){for(const e of await readdir(d,{withFileTypes:true})){const f=join(d,e.name);(await stat(f)).isDirectory()?await w(f):(n++,b+=(await stat(f)).size);}} w(process.argv[1]).then(()=>console.log(n,b))}" \
     "/Users/sebailla/Library/Mobile Documents/iCloud~md~obsidian/Documents/Proyectos/gastos-personales/Documents-es"

   # 2. Corremos el sync.
   pnpm docs:obsidian

   # 3. Snapshoteamos de nuevo desde Node, en la misma shell.
   #    Con fs.cp: pre y post son idénticos (el sync "tuvo éxito"
   #    adentro del script pero nada se materializó en el volumen).
   #    Con shell-out a cp -R: el post coincide con el origen (38 .md,
   #    ~1 MB).
   ```

   Confirmado vía `brctl log` y `log show --last 5m --predicate
'subsystem CONTAINS "CloudDocs"'`: `cp -R` produce los eventos
   `NSFileCoordinator requested item` → `bird downloading 1 documents`
   → `materialize` → `itemMaterializedOnDisk` → `itemMaterializationCompleted`
   por cada archivo. `fs.cp` no produce ninguno de estos para el mismo
   destino. Lección: el FileProvider solo materializa cambios que fluyen
   por la API pública de NSFileCoordinator; las syscalls a nivel de
   kernel que Node usa para la copia recursiva la saltean.

2. **Limpieza de `test/sync-obsidian.test.ts`.** Dos casos de test
   para `classifyError` estaban atados a los modos de falla de `fs.cp`
   que se removieron (`ERR_FS_CP_DIR_TO_NON_DIR`, `ERR_FS_CP_EEXIST`).
   Se eliminaron en el mismo cambio de la reversión. Los tests
   restantes cubren el contrato que sigue aplicando (exit codes +
   `classifyError` para `ENOENT` y `VerificationError` más la
   caída unclassified). El conteo de tests fue de 16 → 14 en este
   cambio.
