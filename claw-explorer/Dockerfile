FROM node:20-alpine

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install

COPY . .
RUN yarn build

RUN npm install -g serve

EXPOSE 8080

CMD ["serve", "dist", "-l", "8080"]
