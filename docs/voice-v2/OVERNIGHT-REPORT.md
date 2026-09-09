# PANCHITA — OVERNIGHT MASTER REPORT
**Noche del 2026-09-09 · 02:00–03:10 PDT aprox.**

**Producción NO se modificó.** `index.html` byte a byte igual a `b01eb18`.
`voice-v2.html` publicado **sin tocar** (Luis lo va a probar; cambiarlo sin avisar sería peor que el bug).
Ningún objeto de n8n creado, modificado, activado ni ejecutado. **Coste: $0.**

---

## Cola de aprobación de la mañana (lo único que necesita a Luis)

Cuatro decisiones, ordenadas por valor. Ninguna cuesta dinero.

### A1 — Publicar la corrección del reconocedor obsoleto · RIESGO BAJO
- **QUÉ:** sustituir `voice-v2.html` publicado por `voice-v2/next/voice-v2.html` (11 líneas, 3 guardas de identidad).
- **POR QUÉ:** bug real encontrado esta noche. El `onend` tardío de un reconocedor ya reemplazado
  llamaba `start()` sobre el activo → `InvalidStateError` y rotación innecesaria **justo al reactivar
  tras un mute**. Cae exactamente en la PRUEBA 5 del guion del teléfono.
- **SISTEMAS:** solo la página de prueba aislada. `index.html` no se toca.
- **CAMBIO EXACTO:** `git checkout main && cp voice-v2/next/voice-v2.html voice-v2.html && commit && push`
- **ROLLBACK:** revertir un commit de un archivo.
- **BENEFICIO:** la prueba 5 deja de fallar por un defecto conocido.
- **AUTORIZACIÓN:** "publica la corrección de voz".
- **NOTA HONESTA:** si prefieres probar primero lo que ya tienes y ver el bug con tus ojos, también
  es razonable. El bug se autorrepara (rota reconocedores), no cuelga la app.

### A2 — Instalar Gate 0B en el Gateway de producción · RIESGO MEDIO
- **QUÉ:** 1 tabla + 3 nodos nuevos, más el arreglo del problema 1.
- **POR QUÉ:** es el **único** bloqueo que queda para conversación de voz sostenida. Hoy te corta a los ~2,7 min.
- **SISTEMAS:** Gateway de producción `KNuR7CRz7PwDznck` (activo).
- **CAMBIO EXACTO:** ver `docs/voice-v2/GATE0B-DEPLOYMENT-PACKAGE.md` §2.
- **ROLLBACK:** borrar 3 nodos, o restaurar `versionId cc08e356-ea76-4458-92fd-cba48e462d3f`.
- **AUTORIZACIÓN:** "instala Gate 0B".
- **RECOMENDACIÓN: prueba el teléfono ANTES.** Puede cambiar los números del presupuesto.

### A3 — Cerrar la brecha latente de autorización en Central · RIESGO BAJO
- **QUÉ:** que `Classify Routing Outcome` también exija contexto de confianza cuando
  `authorization_requirement === 'trusted_context_required'`, no solo en `WRITE_SENSITIVE`/`CRITICAL`.
- **POR QUÉ:** verificado esta noche — esa condición **nunca se cumple** hoy; es código inalcanzable.
  Central calcula el requisito para `truck_repair` y `mission_control` y luego **no lo comprueba nunca**.
- **IMPACTO HOY:** bajo (esos módulos no tienen implementación real todavía).
- **IMPACTO MAÑANA:** el día que se implemente un módulo READ_SENSITIVE, la puerta ya estaría abierta.
- **AUTORIZACIÓN:** "arregla la puerta de Central".

### A4 — Decidir el problema de concurrencia · RIESGO MEDIO (de coste)
- **QUÉ:** aceptar el desbordamiento medido, o implementar conteo por inserción.
- **DATO MEDIDO:** con concurrencia 4, el desbordamiento es **4,0x**. Con concurrencia N, ≈ N.
- **LO QUE NO ROMPE:** autenticación, aislamiento de tenant y vinculación de sesión **aguantan** bajo la
  carrera. Es riesgo de **gasto**, no de acceso.
- **AUTORIZACIÓN:** "acepta el riesgo" o "implementa el conteo por inserción".

---

## 1–7 · Trabajo, verificación y pruebas

**Construido esta noche (aislado, no desplegado):**

| Archivo | Qué es |
| --- | --- |
| `voice-v2/test/harness.js` | DOM, SpeechRecognition, speechSynthesis, fetch y reloj virtuales |
| `voice-v2/test/test-voice-machine.js` | 51 pruebas de la **máquina de estados real** |
| `voice-v2/test/test-intent-classifier.js` | 22 pruebas ES/EN/mixto + escalada |
| `voice-v2/budget/test-concurrency.js` | medición del problema #4 |
| `voice-v2/next/voice-v2.html` | candidato con la corrección |
| `docs/voice-v2/GATE0B-DEPLOYMENT-PACKAGE.md` | paquete de despliegue completo |
| `voice-v2/run-all-tests.sh` | lanza todo |

**Resultados reales (no fabricados):**

| Suite | Resultado |
| --- | --- |
| Pre-flight del cliente | **65 / 0** PASS |
| Máquina de estados — **publicado** | **50 / 1** — 1 FALLO REAL |
| Máquina de estados — **candidato** | **51 / 0** PASS |
| Presupuesto Gate 0B | **37 / 0** PASS |
| Clasificador de intención | **22 / 0** PASS |
| Concurrencia | informativa: desbordamiento 4,0x |

**NO PROBADO:** el teléfono físico. Nadie ha ejecutado Voice v2 en el Android de Luis.

---

## 8–10 · Bugs y seguridad

**Bug encontrado y corregido (en candidato):** `onend` de reconocedor obsoleto → `InvalidStateError`.

**Hallazgos de seguridad verificados esta noche:**

1. **Puerta de autorización inalcanzable en Central** — MEDIO/latente. Ver A3.
2. **Webhook público de Central sin autenticar** — `panchita-central-entry-TEST-ISOLATED`, sin CORS y
   sin límite de peticiones, alcanza Brave Search y Claude Sonnet 5 (créditos reales). Cualquiera que
   sepa la URL puede gastar. *Central está marcado como ISOLATED/TEST pero el webhook está vivo.*
3. **No autenticados recorren 7 operaciones de tabla** antes de ser denegados (problema 1).
4. **Limitador sin filtro de tenant** (problema 2).
5. **Concurrencia desborda el límite de gasto 4x** (problema 4) — no rompe acceso.

**Secretos:** no se encontró ninguno en el repositorio. `voice-v2.html` y `index.html` no contienen
claves; el único endpoint es el Gateway, que ya era público. Las credenciales de n8n viven en el
almacén de credenciales, que es lo correcto.

---

## 11–21 · Estado por componente

| Componente | Estado | Evidencia |
| --- | --- | --- |
| **Panchita Personal** | **VERIFIED LIVE** | `index.html` = `b01eb18`, desplegado |
| **Voice v2 (gratis)** | **BUILT + TESTED INTERNALLY** | 51/0 en el candidato; **teléfono NO probado** |
| **Prueba física** | **BLOCKED** — pendiente de Luis | — |
| **Gate 0B** | **PREPARED / NOT DEPLOYED** | 37/0 offline; paquete listo |
| **Gateway** | **VERIFIED LIVE**, sin modificar | 47 nodos, `versionId cc08e356…` |
| **Central** | **PARTIAL** | frontera de confianza y anti-replay por nonce reales y bien hechas; puerta de autorización inalcanzable; módulos `truck_repair`/`mission_control` sin implementación |
| **Guardian** | **BUILT / NOT DEPLOYED** — solo Nivel 0 | 5 nodos, trigger manual, **inactivo**, sin capacidad de reparación. L1–L3 = **PROPOSED** |
| **Prompt Engineer** | **PARTIAL** | existe en Central y en el Gateway; clasificador probado 22/0 |
| **Builder** | **PROPOSED** | no existe implementación |
| **Observabilidad** | **PARTIAL** | tablas de auditoría reales; Guardian las lee pero está inactivo |
| **Suite de regresión** | **BUILT** | 175 aserciones automatizadas, offline, $0 |

**Deuda técnica encontrada:**
- El clasificador de intención está **duplicado palabra por palabra** en dos nodos de Central
  (`Build Normalized Request` y `…(Internal Trusted Path)`). Tercera copia en la prueba. Tres sitios que divergen.
- `Decide Identity` define `SESHION_MINUTES = 5` sin usar (código muerto; el valor real es 360 en `Issue Session`).
- Contrato del Gateway acoplado por posición de nodo, no por interfaz.

---

## 22–30 · Cierre

- **22. Producción modificada:** ninguna.
- **23. Costes:** $0. Nada comprado, Realtime de pago no habilitado.
- **24. Bloqueos:** prueba física del teléfono; aprobación para Gate 0B; aprobación para A1/A3.
- **26. Top 3 mañana:** (1) probar el teléfono, (2) publicar A1, (3) instalar Gate 0B si la prueba va bien.
- **27. NO tocar todavía:** Realtime de pago, ShopMonkey, pagos, GHL, permisos de negocio, Guardian L1+,
  Builder, y los módulos lejanos (Marketplace, Capital, Coin, University, Real Estate).
- **28. Mayor cuello de botella:** **la prueba física del teléfono.** Todo lo demás está preparado y
  esperando ese dato. No se puede simular.
- **29. Mejor siguiente hito:** una conversación de voz de 15 minutos, real, en el Android de Luis,
  sin cortes y sin que lo saque al login.
- **30. Valoración global:** cimiento **sólido y honesto**. Personal es real y funciona. Gateway es real
  y está endurecido. Central tiene arquitectura seria a medias con una brecha latente identificada.
  Guardian es un esqueleto honesto. Voice v2 está construido y probado internamente pero **sin validar
  en hardware**. El riesgo principal no es técnico: es confundir "probado internamente" con "funciona
  en el teléfono". Este reporte mantiene esa distinción.
