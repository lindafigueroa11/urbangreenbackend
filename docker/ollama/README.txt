Ollama en Render (resumen)
=========================

1) En Render, crea un nuevo "Web Service" con Docker.
   - Dockerfile path: docker/ollama/Dockerfile
   - Raíz del repositorio como directorio de build (contexto = raíz del backend).

2) Variables opcionales en ese servicio:
   - OLLAMA_START_MODEL  (por defecto en start.sh: llama3.2:3b)
   - OLLAMA_HOST         (por defecto 0.0.0.0:11434)

3) Tras el deploy, anota la URL pública (https://TU-SERVICIO.onrender.com).

4) En el servicio Node (API Urban Green), configura:
   - PLANT_INSIGHTS_PROVIDER=ollama
   - OLLAMA_BASE_URL=https://TU-SERVICIO.onrender.com
   - OLLAMA_MODEL=llama3.2:3b   (mismo modelo que descargaste con pull)

5) Seguridad: Ollama expuesto en internet permite a cualquiera usar tu GPU/RAM.
   Valora Render Private Networking o un proxy con autenticación.

6) Plan: los modelos necesitan RAM; en plan gratuito puede ir lento o fallar por memoria.
   Prueba modelos pequeños (p. ej. llama3.2:3b, phi3:mini).
