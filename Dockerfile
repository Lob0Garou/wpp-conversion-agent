FROM node:20-alpine

WORKDIR /app

# Copiar package files e instalar deps
COPY package.json package-lock.json ./
RUN npm ci

# Copiar prisma schema e gerar client
COPY prisma ./prisma
RUN npx prisma generate

# Copiar resto do código
COPY . .

# Expor porta e rodar
EXPOSE 3000

# Em dev: roda migrations + dev server
CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]
