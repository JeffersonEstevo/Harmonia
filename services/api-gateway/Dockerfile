FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/eslint-config ./packages/eslint-config
COPY services/api-gateway ./services/api-gateway
RUN npm install --workspace=@harmonia/api-gateway --include-workspace-root

WORKDIR /app/services/api-gateway
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/services/api-gateway/dist ./dist
COPY --from=build /app/services/api-gateway/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "dist/index.js"]
