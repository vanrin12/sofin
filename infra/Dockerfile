# Single image for the whole monorepo; compose overrides the entrypoint per app.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # prisma generate (all schemas) + nest build (all apps)

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/apps ./apps
COPY --from=build /app/package.json ./
# default; compose sets a concrete `command:` per service
CMD ["node", "dist/apps/gateway/src/main.js"]
