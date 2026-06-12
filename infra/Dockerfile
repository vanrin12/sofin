# Single image for the whole monorepo; compose overrides the entrypoint per app.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build          # prisma generate (all schemas) + nx run-many -t build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/apps ./apps
COPY --from=build /app/package.json ./
# default; compose sets a concrete `command:` per service
CMD ["node", "dist/apps/gateway/main.js"]
