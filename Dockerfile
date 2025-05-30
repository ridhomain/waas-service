FROM node:lts-alpine3.21

LABEL maintainer="Ahmad Ridho <ahmad.ridho@gmail.com>"

# Set timezone and install minimal packages
RUN apk add --no-cache git libc6-compat tzdata

# Set workdir
WORKDIR /app

# Enable corepack + install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files separately for caching
COPY package.json pnpm-lock.yaml ./

# Install deps (only once, for build + runtime)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# Set timezone
ENV TZ=Asia/Jakarta

# Expose default Fastify port
EXPOSE 3000

# Start the app
CMD ["node", "dist/server.js"]