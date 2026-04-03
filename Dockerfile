# ── Build stage ──
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src/config ./src/config
# Prisma 7 loads prisma.config.ts, which requires DATABASE_URL; generate does not connect.
ARG DATABASE_URL="postgresql://prisma:prisma@127.0.0.1:5432/prisma"
ENV DATABASE_URL=$DATABASE_URL
RUN npx prisma generate

COPY . .
RUN npm run build

# ── Production stage ──
FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

USER nestjs

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
