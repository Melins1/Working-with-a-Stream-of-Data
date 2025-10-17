FROM node:slim 

WORKDIR /app

# Optimazation technique, speeds up building due to caches
# Therefore two different copys
COPY package*.json .

RUN npm install

COPY . .

EXPOSE 3000

CMD [ "npm", "run", "dev" ]