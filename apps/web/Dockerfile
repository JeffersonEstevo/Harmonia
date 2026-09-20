# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app

# copia o monorepo o suficiente para resolver os workspaces
COPY package.json package-lock.json* ./
COPY packages/eslint-config ./packages/eslint-config
COPY apps/web ./apps/web
RUN npm install --workspace=@harmonia/web --include-workspace-root

WORKDIR /app/apps/web
RUN npm run build

# --- serve stage ---
FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
