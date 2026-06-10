FROM node:22-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY . .

EXPOSE 4000
CMD ["npm", "start"]
