FROM node:10.16.0-jessie-slim

RUN apt-get update
RUN apt-get install -y build-essential

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 8080
CMD [ "node", "index.js" ]
