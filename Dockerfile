FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG RESPONSEABLE_DEPLOYMENT_ID
ENV RESPONSEABLE_DEPLOYMENT_ID=$RESPONSEABLE_DEPLOYMENT_ID
RUN ./scripts/xmpp/install-converse.sh && npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts/migrate.mjs /app/scripts/bootstrap-admin.mjs ./scripts/
USER node
EXPOSE 3000
CMD ["node", "server.js"]
