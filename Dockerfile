# Image of the Home Assistant add-on. The interface must be compiled first
# (npm run build): the image only copies files, so it builds for any
# architecture without emulation.
FROM node:24-alpine

ARG BUILD_VERSION=dev
ARG BUILD_ARCH=amd64
LABEL io.hass.type="addon" \
      io.hass.version="${BUILD_VERSION}" \
      io.hass.arch="${BUILD_ARCH}" \
      org.opencontainers.image.source="https://github.com/tmarignier/garde-manger"

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/garde-manger.db

WORKDIR /app
COPY package.json ./
COPY server server
COPY shared shared
COPY public public
# Fails when the interface has not been compiled.
COPY public/js/client/app.js public/js/client/app.js

EXPOSE 3000
CMD ["node", "server/index.ts"]
