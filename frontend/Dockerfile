FROM node:20-alpine AS build
WORKDIR /app

# Pin npm (prevents surprises if base image npm changes)
RUN npm i -g npm@10.9.2

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PORTAL_URL
ARG NEXT_PUBLIC_CAPTCHA_KEY
ARG NEXT_PUBLIC_BOOKING_FLOW_VERSION

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_PORTAL_URL=$NEXT_PUBLIC_PORTAL_URL \
    NEXT_PUBLIC_CAPTCHA_KEY=$NEXT_PUBLIC_CAPTCHA_KEY \
    NEXT_PUBLIC_BOOKING_FLOW_VERSION=$NEXT_PUBLIC_BOOKING_FLOW_VERSION

RUN mkdir -p public
RUN npm run build


FROM node:20-alpine AS run
WORKDIR /app

RUN apk add --no-cache curl
RUN npm i -g npm@10.9.2

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["npm","start"]
