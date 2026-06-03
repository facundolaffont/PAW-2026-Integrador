FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "src/app.js"]
