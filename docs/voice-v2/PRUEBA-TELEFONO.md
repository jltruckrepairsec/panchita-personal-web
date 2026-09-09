# Prueba de teléfono — Panchita Voice v2 (gratis)
# Phone test — Panchita Voice v2 (free)

**Nada de esto está en producción.** `index.html` sigue exactamente igual (`b01eb18`).
Esta es una página aparte, en una rama sin fusionar. Si algo falla, tu Panchita normal no se ve afectada.

---

## Antes de empezar / Before you start

* Abre el enlace **directamente en Chrome** en el Android. No lo abras desde WhatsApp, Gmail ni otra app
  (esos navegadores internos rompen el micrófono — es el fallo que ya conocemos).
* Necesitas internet: el reconocimiento de voz de Chrome es un servicio en la nube de Google.
* Acepta el permiso de micrófono cuando Chrome lo pida (una sola vez por sesión).
* Sube el volumen y usa el **altavoz** — es el caso más difícil para el eco, y es justo lo que queremos probar.

**La interfaz es la misma que ya confirmaste.** Lo único nuevo es una barra pequeña que aparece
*solamente* mientras la voz está activa, con **Silenciar** y **Terminar voz**.

**Nuevo:** toca el micrófono **una sola vez** para empezar toda una conversación. Ya no hay que tocarlo
en cada turno.

Hay un enlace **diagnóstico** debajo de la barra de escribir. Tócalo para ver contadores
(turnos, duplicados, ecos, reinicios, errores). **Ábrelo al final de cada prueba y anota los números.**

---

## Las 10 pruebas / The 10 tests

### PRUEBA 1 — Conversación de varios turnos con un solo toque
Toca el micrófono una vez. Haz 4 o 5 preguntas seguidas, esperando la respuesta de Panchita entre cada una.
**No vuelvas a tocar el micrófono.**
✅ Esperado: cada pregunta se envía sola; el micrófono sigue activo (botón rojo pulsando).

### PRUEBA 2 — Pausa natural a mitad de la idea
Empieza una frase, **detente 3–5 segundos** como si estuvieras pensando, y termina la frase.
✅ Esperado: no te corta a mitad. Se envía la frase completa.
❗ Esta es **la prueba más importante**. El problema que ya arreglamos una vez fue exactamente un corte prematuro.

### PRUEBA 3 — Responder sin tocar nada
Deja que Panchita termine de hablar. Espera 2 segundos. Habla otra vez.
✅ Esperado: te escucha sin tocar el micrófono.

### PRUEBA 4 — Interrumpir a Panchita
Mientras Panchita está hablando, **habla encima de ella** con una pregunta nueva y clara.
✅ Esperado: deja de hablar y atiende tu pregunta nueva.
⚠️ Habrá **algo de retraso** (aproximadamente un ciclo de reconocimiento). Es a propósito: esperamos a
confirmar que eres tú y no ella misma. Dime si el retraso se siente aceptable o molesto.

### PRUEBA 5 — Silenciar y volver
Toca **Silenciar**. Habla algo (no debe pasar nada). Espera ~20 segundos. Toca **Reactivar** y sigue hablando.
✅ Esperado: mientras está silenciado no se envía nada, y **el indicador de micrófono de Android se apaga**.
La conversación sigue viva al reactivar.

### PRUEBA 6 — Terminar voz y confirmar el modo normal
Toca **Terminar voz**. Después escribe un mensaje con el teclado y envíalo.
✅ Esperado: la voz se apaga, la barra desaparece, y el chat de texto funciona igual que siempre.
**No te debe sacar de la sesión.**

### PRUEBA 7 — Perder y recuperar conexión
Con la voz activa, activa **modo avión** ~15 segundos, luego desactívalo y sigue hablando.
✅ Esperado: avisa que necesita internet, y se recupera solo al volver la conexión.

### PRUEBA 8 — Español, inglés y mezclado
Di algo en español, algo en inglés, y una frase mezclada ("necesito un *quote* para el *brake job*").
✅ Esperado: dime qué tan bien entendió cada caso. **Es la prueba que más espero que falle** — el
reconocimiento está fijado en un idioma a la vez.

### PRUEBA 9 — Sin eco / que no se escuche a sí misma
Con el **altavoz al máximo**, deja que Panchita dé una respuesta larga y **no digas nada**.
✅ Esperado: no se responde a sí misma, no aparecen mensajes tuyos falsos.
Abre **diagnóstico** y dime el número de "echoes suppressed".

### PRUEBA 10 — El límite actual
Conversa seguido durante **unos 5 minutos**.
✅ Esperado: alrededor de los **2–3 minutos** aparecerá "Límite de mensajes alcanzado".
**Esto es normal y esperado** — es el límite de 10 mensajes por 5 minutos que todavía no está cambiado.
Lo importante: **NO te debe sacar a la pantalla de login** (ese era el bug). Debe seguir tu sesión activa.

---

## Qué reportar / What to report

Por cada prueba: **funcionó / no funcionó / raro**, y una frase de qué pasó.

Y en especial:

1. **Prueba 2** — ¿te cortó al pausar? ¿Cuántos segundos aguantó?
2. **Prueba 4** — ¿el retraso al interrumpir se sintió bien o molesto?
3. **Prueba 9** — número de "echoes suppressed" en diagnóstico, y si se auto-respondió alguna vez.
4. **Prueba 10** — ¿te sacó al login? (no debería) y ¿a qué minuto apareció el aviso?
5. **Prueba 8** — qué tan mal estuvo el español/inglés mezclado.
6. Los contadores finales de **diagnóstico** (turnos, duplicados, ecos, reinicios, errores).
7. ¿Se sintió como una conversación de verdad, o como pelear con la app?

---

## Lo que ya sabemos que NO va a estar perfecto

| Cosa | Estado |
| --- | --- |
| Corte de turno | Lo decide el motor de Chrome, no un temporizador fijo. Puede cortar antes de lo ideal. **Es el punto principal a evaluar.** |
| Interrumpir | Tiene retraso a propósito (seguridad contra eco) |
| Mezclar idiomas | El reconocimiento está fijado a un idioma; se espera que falle |
| Voz de Panchita | Voz del sistema Android, no de estudio |
| Límite a los ~2–3 min | Esperado; el arreglo (Gate 0B) está listo pero **no instalado** |
| Pantalla apagada | Al pasar a segundo plano se silencia a propósito |

Si algo falla feo, hay un enlace **"Volver al modo actual"** que te regresa a la Panchita de siempre.
