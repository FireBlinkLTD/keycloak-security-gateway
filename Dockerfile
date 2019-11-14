FROM node:lts-alpine as build

WORKDIR /build
COPY package.json package.json
COPY yarn.lock yarn.lock
RUN yarn 

COPY . .
RUN yarn build 
RUN yarn install --prod

FROM node:lts-alpine

WORKDIR /app

COPY --from=build /build/node_modules node_modules
COPY --from=build /build/dist dist
COPY --from=build /build/config config
COPY --from=build /build/package.json .

CMD ["yarn", "start"]

