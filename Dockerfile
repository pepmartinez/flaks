# docker build -t pepmartinez/flaks:1.1.11 .
# docker push pepmartinez/flaks:1.1.11

FROM node:20-slim as builder

RUN apt-get update && \
    apt-get install -y build-essential python3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production


# final image
FROM node:20-slim

WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules
RUN npm install pm2 -g

COPY . .

EXPOSE 8080
CMD ["pm2-runtime", "-i", "1", "index.js"]
