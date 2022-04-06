FROM node:17.8.0-buster

EXPOSE 6000

ENV PORT 6000

COPY ./ ./

ENV DEPLOYMENTID=619b5e7b47cfb20be7195ab2a55dedec77dcd6d3af64447603cd8b6400584bc1

#RUN npm install
RUN npm install ./code ./code

CMD ["npm", "--prefix", "./code" , "run", "start"]