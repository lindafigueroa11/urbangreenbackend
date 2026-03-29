# Servicio Ollama para Render (Web Service con Docker).
# Crea un segundo servicio en Render con Dockerfile en esta ruta y expón el puerto 11434.
# Tras el deploy, usa la URL pública como OLLAMA_BASE_URL en la API Node (ej. https://tu-ollama.onrender.com).
#
# Seguridad: la API de Ollama no debe quedar abierta sin control en producción.
# Opciones: Render Private Networking entre servicios, o proxy con auth delante de Ollama.

FROM ollama/ollama:latest

ENV OLLAMA_HOST=0.0.0.0:11434

# Contexto de build: raíz del repo UrbanGreenBackend
COPY docker/ollama/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 11434

CMD ["/start.sh"]
