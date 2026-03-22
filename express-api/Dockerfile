FROM node:20-alpine

WORKDIR /app

# Copier uniquement package.json pour profiter du cache Docker
COPY package.json package-lock.json* ./

RUN npm ci --omit=dev

# Copier le reste du code source
COPY src/ ./src/

# Créer les dossiers nécessaires
RUN mkdir -p uploads/temp data

# Peupler la base de données avec les données de démonstration
RUN node src/db/seed.js || true

EXPOSE 3000

CMD ["node", "src/app.js"]
