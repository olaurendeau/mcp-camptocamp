# Base image: node:22-alpine, pinned by the digest of its multi-arch index (amd64 + arm64).
# The tag stays in front of the digest for readability; Docker resolves only the digest.

# Stage 1: Build
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS runtime

LABEL io.modelcontextprotocol.server.name="io.github.olaurendeau/mcp-camptocamp"

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

# HTTP mode (MCP_TRANSPORT=http) listens on all interfaces inside the container; publish the port on the host
# loopback (-p 127.0.0.1:3000:3000) behind a TLS reverse proxy. The default CMD stays stdio.
ENV MCP_HTTP_HOST=0.0.0.0
EXPOSE 3000

# Files stay root-owned and read-only for the server: it only reads package.json and dist/, and talks over stdio or HTTP
USER node

CMD ["node", "dist/index.js"]
