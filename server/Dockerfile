FROM node:22-trixie-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 4000
CMD ["npm", "start"]
