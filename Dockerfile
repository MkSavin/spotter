FROM node:16-alpine
WORKDIR /home/node/app
COPY package.json .
RUN npm i
COPY . .
RUN npm run compile
EXPOSE 4000
CMD ["npm", "run", "start"]
