# BUILD
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# RUNTIME
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

USER node
EXPOSE 8000
CMD ["node", "dist/index.js"]