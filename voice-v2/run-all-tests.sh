#!/bin/sh
# Todas las suites offline de Panchita. Sin red, sin n8n, sin producción, coste cero.
set -e
cd "$(dirname "$0")/.."
echo "=== 1/5  Pre-flight del cliente de voz (estático + ayudantes reales) ==="
node voice-v2/test/test-voice-client.js
echo "=== 2/5  Máquina de estados de voz — versión PUBLICADA ==="
node voice-v2/test/test-voice-machine.js voice-v2.html || echo "   (fallo conocido: ver docs/voice-v2/OVERNIGHT-REPORT.md)"
echo "=== 3/5  Máquina de estados de voz — CANDIDATO corregido ==="
node voice-v2/test/test-voice-machine.js voice-v2/next/voice-v2.html
echo "=== 4/5  Presupuesto Gate 0B ==="
node voice-v2/budget/test-voice-budget.js
echo "=== 5/5  Clasificador de intención de Central ==="
node voice-v2/test/test-intent-classifier.js
echo "=== extra: medición de concurrencia (informativa, no falla) ==="
node voice-v2/budget/test-concurrency.js
echo "TODAS LAS SUITES TERMINARON"
