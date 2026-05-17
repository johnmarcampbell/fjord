# syntax=docker/dockerfile:1.7

############################
# Stage 1: build
############################
FROM node:22-slim AS build
WORKDIR /app

# better-sqlite3 needs a toolchain to build its native module.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN --mount=type=cache,target=/root/.npm npm install

COPY shared ./shared
COPY backend ./backend
COPY frontend ./frontend

RUN npm run build -w shared \
    && npm run build -w frontend \
    && npm run build -w backend

############################
# Stage 2: runtime
############################
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    KANBAN_HOST=0.0.0.0 \
    KANBAN_PORT=3000 \
    KANBAN_DB_PATH=/data/kanban.db \
    KANBAN_STATIC_DIR=/app/frontend/dist

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared ./shared
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/migrations ./backend/migrations
COPY --from=build /app/backend/demo ./backend/demo
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/frontend/dist ./frontend/dist

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "backend/dist/index.js"]
