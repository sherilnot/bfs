# BFS Projects — static site + enquiry API.
# The backend relies on the built-in node:sqlite module (Node 22.5+), so there
# is no native driver to compile and no build step. A single stage is enough.
FROM node:22-slim

ENV NODE_ENV=production

WORKDIR /app

# Install production dependencies first so this layer caches across code edits.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application code.
COPY server ./server
COPY assets ./assets
COPY images ./images
COPY index.html ./index.html

# The SQLite file lives here. Declaring a volume keeps enquiry data across
# container restarts and image rebuilds. Owned by the unprivileged node user.
RUN mkdir -p /app/data && chown -R node:node /app
VOLUME ["/app/data"]

# Run as the built-in non-root user shipped with the node image.
USER node

# Bind to all interfaces so the container is reachable, and keep the DB on the
# mounted volume. Override ADMIN_TOKEN / TRUST_PROXY at run time.
ENV PORT=3000 \
    HOST=0.0.0.0 \
    DB_PATH=/app/data/enquiries.db

EXPOSE 3000

# Liveness check hits the app's own health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/server.js"]
