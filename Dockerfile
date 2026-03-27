# Stage 1: Build client
FROM node:20-alpine AS builder

WORKDIR /app

# Install client dependencies
COPY client/package*.json client/
RUN cd client && npm install

# Copy shared
COPY shared/ shared/

# Copy client source and build
COPY client/src/ client/src/
COPY client/index.html client/
COPY client/vite.config.js client/
RUN cd client && npm run build

# Stage 2: Run server
FROM node:20-alpine

WORKDIR /app

# Install server dependencies
COPY server/package*.json server/
RUN cd server && npm install

# Copy server source and shared
COPY server/ server/
COPY shared/ shared/

# Copy built client from builder stage
COPY --from=builder /app/client/dist/ client/dist/

EXPOSE 3001

CMD ["node", "server/index.js"]
