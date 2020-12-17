# docker build -t pepmartinez/flaks:1.0.5 .
# docker push pepmartinez/flaks:1.0.5

FROM node:14.15.2-buster-slim as builder

RUN apt-get update && \
    apt-get install -y build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production


# final image
FROM node:14.15.2-buster-slim

WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules
RUN npm install pm2 -g

COPY . .

EXPOSE 8080
CMD ["pm2-runtime", "-i", "1", "index.js"]
