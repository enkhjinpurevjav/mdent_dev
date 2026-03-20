FROM node:20-alpine AS build
WORKDIR /app

# Optional but helpful for debugging visibility
RUN node -v && npm -v

# Install deps from lockfile (deterministic)
COPY package*.json ./
RUN npm ci

# Copy the rest
COPY . .

# Build-time variables (must be passed as docker build args via compose)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PORTAL_URL
ARG NEXT_PUBLIC_CAPTCHA_KEY
ARG NEXT_PUBLIC_BOOKING_FLOW_VERSION

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_PORTAL_URL=$NEXT_PUBLIC_PORTAL_URL \
    NEXT_PUBLIC_CAPTCHA_KEY=$NEXT_PUBLIC_CAPTCHA_KEY \
    NEXT_PUBLIC_BOOKING_FLOW_VERSION=$NEXT_PUBLIC_BOOKING_FLOW_VERSION

RUN mkdir -p public

# Run build (this is where it fails)
RUN npm run build


FROM node:20-alpine AS run
WORKDIR /app

RUN apk add --no-cache curl
ENV NODE_ENV=production

# Install only production deps from lockfile
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built app
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["npm","start"]
