# Gate 0B — Paquete de despliegue (PREPARADO / NO DESPLEGADO)

**Estado: PREPARED / NOT DEPLOYED.** Nada instalado. El Gateway de producción
`KNuR7CRz7PwDznck` sigue **sin modificar y activo**. Ningún objeto de n8n creado ni cambiado.

Este documento cierra los cuatro problemas conocidos con un veredicto verificado cada uno, y deja
listo el procedimiento exacto de despliegue, snapshot, rollback y smoke tests para cuando Luis lo apruebe.

---

## 1. Veredicto sobre los cuatro problemas conocidos

| # | Problema | Veredicto | ¿Bloquea el despliegue? |
| --- | --- | --- | --- |
| 1 | Peticiones no autenticadas recorren demasiada cadena | **DEBE ARREGLARSE** | **SÍ** |
| 2 | Búsqueda del limitador no filtrada por tenant | **DEBERÍA ARREGLARSE** a la vez | No, pero es una línea |
| 3 | Straddle de ventana fija | **NO bloquea** | No — comportamiento heredado del carril de texto |
| 4 | Read-modify-write no atómico | **RIESGO ACEPTADO y medido** | No — pero hay que decidirlo con los ojos abiertos |

---

### Problema 1 — No autenticados recorren la cadena · **DEBE ARREGLARSE**

**Verificado en el grafo del workflow:** ambas ramas del nodo `Verified?` convergen en
`Get Owner Permissions`. Una petición **sin credenciales válidas** ejecuta hoy:

```
Get Existing Session · Get Verification State · Get Candidate Credential   (3 lecturas)
Update Verification State                                                  (1 escritura)
Get Owner Permissions · Get Rate Limit State                               (2 lecturas)
Update Rate Limit State                                                    (1 escritura)
```

7 operaciones de tabla antes de denegar. Además, `Update Rate Limit State` hace upsert con
`identity_id` nulo, creando una fila basura.

**Por qué bloquea Gate 0B:** Gate 0B añade **2 operaciones más** (leer y escribir el presupuesto de
voz). Sin este arreglo, el despliegue empeora una amplificación que ya existe: una petición barata del
atacante cuesta 9 operaciones de base de datos y cuota de ejecución de n8n.

**Arreglo (solo cableado, sin tocar lógica):** insertar un `IF` inmediatamente después de
`Update Verification State` que mande las peticiones no verificadas directo a `Build Denied Response`,
saltándose permisos, límite y presupuesto.

```
Update Verification State → Verified?
    rama TRUE  → Issue Session → Record Session → Get Owner Permissions → …
    rama FALSE → Build Denied Response        ← NUEVO (hoy va a Get Owner Permissions)
```

`Build Denied Response` lee de `Decide Authorization & Rate Limit`, así que además hay que
construir la respuesta denegada desde `Decide Identity`. Es un cambio pequeño pero **no trivial**:
requiere un nodo nuevo `Build Unauthenticated Denial` que produzca el mismo contrato público
(`status: denied`, `error.detail: 'identity_' + motivo`) para que el cliente no note diferencia.

**El módulo de presupuesto ya hace lo correcto** (`decide()` devuelve `unauthenticated` antes de tocar
nada), pero eso solo protege el presupuesto: el ahorro de operaciones tiene que venir del cableado.

---

### Problema 2 — Limitador no filtrado por tenant · **DEBERÍA ARREGLARSE**

**Verificado:** `Get Rate Limit State` filtra únicamente por `identity_id`. Hoy el tenant está
fijado en el servidor (`jl-truck-repair-test`), así que **no hay impacto actual**. Pasa a ser real en
cuanto exista un segundo tenant con `identity_id` que colisione.

**Arreglo:** añadir una condición `tenant_id` al filtro y a la clave del upsert. Una línea en cada nodo.

**El módulo de Gate 0B ya está protegido**: liga la fila a `identity_id` + `tenant_id` y devuelve
`principal_mismatch` si no coinciden (probado, ver suite).

---

### Problema 3 — Straddle de ventana fija · **NO BLOQUEA**

**Verificado:** la ventana es fija, no deslizante. Al vencer, la rama pone `count = 1` y reinicia
`window_start`. Se pueden colar hasta ~20 peticiones a caballo del límite.

**Por qué no bloquea:** el carril de voz usa *token bucket*, que es inmune por diseño. El carril de
texto conserva la semántica exacta de producción **a propósito**, porque Luis pidió preservar el
comportamiento actual. Arreglarlo cambiaría producción sin que nadie lo haya pedido.

**Recomendación:** dejarlo, documentado. Si algún día se quiere, el `token bucket` ya está escrito y
solo habría que apuntarlo al carril de texto.

---

### Problema 4 — Read-modify-write no atómico · **RIESGO ACEPTADO (medido)**

Medido con `node voice-v2/budget/test-concurrency.js`:

```
CONCURRENTE: 5 peticiones permitidas, turns_used registrado = 1  → 4 incrementos perdidos
40 rondas de 4 concurrentes: 60 llegaron a Central, 15 contabilizados → desbordamiento 4.0x
```

Es decir: **el desbordamiento escala con la concurrencia.** Con concurrencia N, el presupuesto se
consume aproximadamente N veces más despacio de lo que debería.

**Lo importante — qué NO rompe.** Bajo la misma carrera, verificado en la misma prueba:

| | |
| --- | --- |
| ¿Pasa un no autenticado? | **NO** |
| ¿Cruza el tenant? | **NO** |
| ¿Sirve un `voice_session_id` robado sin su sesión? | **NO** |

El limitador es un **control de coste y abuso, no una frontera de autorización**. Ganar la carrera
desborda el gasto; no da acceso a ningún dato. Identidad, permisos, tenant y sesión se comprueban
antes y no se ven afectados.

**No lo introduce Gate 0B.** El limitador que ya está en producción usa exactamente el mismo patrón
`leer → calcular → escribir`, así que hereda la misma debilidad hoy.

**Contexto real:** un solo dueño, un solo teléfono. La concurrencia efectiva es ~1, y el debounce de
700 ms la reduce más. El escenario explotable requiere un actor hostil **con una sesión válida robada**
— que ya tendría acceso de lectura a Panchita de todos modos. Lo que ganaría es gasto, no datos.

#### Arreglo disponible si Luis lo quiere: conteo por inserción (append-only)

Las tablas de n8n no ofrecen incremento atómico ni escritura condicional verificables desde aquí, pero
**sí ofrecen inserción**, y las inserciones no compiten entre sí:

```
en vez de:  leer contador → sumar 1 → escribir contador     (se pierden incrementos)
hacer:      INSERT una fila por petición → COUNT filas en la ventana
```

Con esto, N peticiones concurrentes insertan N filas: **no se pierde ninguna**. El exceso queda
limitado al número de peticiones de ese instante y **se autocorrige** — la siguiente petición ya ve el
conteo real y deniega. Requiere una tabla `panchita_voice_events` y un paso de poda.

Coste: más filas y una lectura de conteo por petición. **PROPUESTO, no implementado.**

---

## 2. Paquete de despliegue

### 2.1 Objetos a crear

| Objeto | Tipo | Contenido |
| --- | --- | --- |
| `panchita_voice_budget` | tabla de datos | `identity_id`, `tenant_id`, `state_json`, `updated_at` |
| `Get Voice Budget Row` | nodo dataTable (get) | filtro: `identity_id` **y** `tenant_id` |
| `Decide Voice Budget` | nodo Code | `voice-v2/budget/n8n-code-node.js` tal cual |
| `Update Voice Budget Row` | nodo dataTable (upsert) | clave: `identity_id` + `tenant_id` |
| `Build Unauthenticated Denial` | nodo Code | arreglo del problema 1 |

### 2.2 Cableado

```
ANTES:  Get Rate Limit State → Decide Authorization & Rate Limit
                             → Update Rate Limit State → Authorized?

DESPUÉS: Get Rate Limit State → Decide Authorization & Rate Limit
                              → Get Voice Budget Row      (NUEVO)
                              → Decide Voice Budget       (NUEVO)
                              → Update Voice Budget Row   (NUEVO)
                              → Update Rate Limit State   (sin cambios)
                              → Authorized?               (sin cambios)

Y ADEMÁS:  Verified? rama FALSE → Build Unauthenticated Denial → Respond   (problema 1)
```

Además hay que ampliar `Normalize & Validate Request` para dejar pasar `voice_session_id` e `is_retry`.

### 2.3 Propiedad que hace esto seguro

```js
authorized_final = authorized_upstream AND budget_allows
```

**El nodo nuevo solo puede estrechar una decisión, nunca ampliarla.** Verificado en el propio código
(`n8n-code-node.js`, línea `var finalAuthorized = (authz.authorized === true) && out.verdict.allow;`).
Identidad, permisos, tenant, sesión y auditoría siguen aguas arriba y no se tocan.

### 2.4 Snapshot antes de desplegar

n8n versiona los workflows: **anota el `versionId` actual antes de cualquier cambio.**

```
versionId del Gateway hoy: cc08e356-ea76-4458-92fd-cba48e462d3f
```

Ese es el punto de restauración. Registrar también: workflow `KNuR7CRz7PwDznck`, activo, 47 nodos.

### 2.5 Rollback

| Escenario | Acción | Tiempo |
| --- | --- | --- |
| El presupuesto deniega de más | Borrar los 3 nodos nuevos y volver a conectar `Decide Authorization → Update Rate Limit State` | minutos |
| Rollback total | Restaurar la versión `cc08e356-…` | minutos |
| Emergencia | Poner `turns_max` muy alto en las filas de presupuesto: el carril de voz deja de estorbar sin tocar el grafo | segundos |

El carril de texto no cambia en ninguno de los escenarios.

### 2.6 Smoke tests tras desplegar (en este orden)

1. **Texto sin cambios** — 1 mensaje escrito → responde normal. *Si falla, rollback inmediato.*
2. **Texto sigue limitado a 10/5min** — comportamiento idéntico al de hoy.
3. **Voz sin `voice_session_id`** → debe caer al carril de texto, no al de voz.
4. **Login normal** → sesión emitida, sin regresión.
5. **No autenticado** → denegado, y con el arreglo 1 debe denegarse **antes** de tocar permisos.
6. **Conversación de voz sostenida 15 min** → sin denegaciones.
7. **`voice_session_id` inventado** → `voice_session_mismatch`.
8. **Sesión expirada** → `identity_session_expired`, cierre de sesión correcto.

Los puntos 6–8 ya están cubiertos de forma offline por la suite (37/37); estos smoke tests confirman
que el **cableado** en n8n se comporta igual que el algoritmo probado.

---

## 3. Qué falta antes de desplegar

1. **Aprobación explícita de Luis** para editar el Gateway de producción. *(bloqueante)*
2. **La prueba física del teléfono** — puede cambiar los números del presupuesto.
3. Decidir el problema 4: aceptar el riesgo de coste, o implementar el conteo por inserción.

Ninguno cuesta dinero.
