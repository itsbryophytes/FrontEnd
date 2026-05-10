# -------- Build Stage --------
FROM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# -------- Production Stage --------
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

RUN npm install -g pnpm

COPY --from=builder /app ./

EXPOSE 3000

CMD ["pnpm", "start"]
