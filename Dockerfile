# docker build -t pepmartinez/flaks:1.0.1 .
# docker push pepmartinez/flaks:1.0.1 .

FROM node:10.16.3-buster-slim

RUN apt-get update && \
    apt-get install -y build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production
RUN npm install pm2 -g

COPY . .

EXPOSE 8080
CMD ["pm2-runtime", "-i", "1", "index.js"]
