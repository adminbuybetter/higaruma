FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=build /app/dist ./dist

CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
