FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY public ./public
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
