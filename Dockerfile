# ---- Base Node ----
FROM node:20 AS base
WORKDIR /app
COPY package.json yarn.lock ./

# ---- Build ----
FROM base AS build
WORKDIR /app
COPY . .
RUN yarn install --frozen-lockfile
RUN yarn build

# ---- Node Modules ----
FROM base AS modules
WORKDIR /app
RUN yarn install --production --frozen-lockfile

# ---- Release ----
FROM base AS release
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=modules /app/node_modules ./node_modules

CMD ["yarn", "start"]
