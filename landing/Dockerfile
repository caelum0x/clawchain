FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 8090

CMD ["npx", "serve", "dist", "-l", "8090"]
