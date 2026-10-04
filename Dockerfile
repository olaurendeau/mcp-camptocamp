# Base image: node:22-alpine, pinned by the digest of its multi-arch index (amd64 + arm64).
# The tag stays in front of the digest for readability; Docker resolves only the digest.

# Stage 1: Build
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runtime

LABEL io.modelcontextprotocol.server.name="io.github.olaurendeau/mcp-camptocamp"

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

# Files stay root-owned and read-only for the server: it only reads package.json and dist/, and talks over stdio
USER node

CMD ["node", "dist/index.js"]
