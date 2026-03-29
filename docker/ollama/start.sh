#!/bin/sh
set -e
# Escucha en todas las interfaces (Render / contenedor)
export OLLAMA_HOST="${OLLAMA_HOST:-0.0.0.0:11434}"

ollama serve &
sleep 5
MODEL="${OLLAMA_START_MODEL:-llama3.2:3b}"
echo "Pulling model: $MODEL"
ollama pull "$MODEL" || true
wait
