FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV npm_config_cache=/tmp/.npm

RUN npm run build

FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server

RUN chmod -R a+r /app/public /app/dist
RUN mkdir -p /app/local-data && chown -R node:node /app/local-data
USER node
CMD ["npm", "run", "start"]
