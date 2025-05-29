
# Stage 1: Build Stage - Install all dependencies (including dev) and transpile TypeScript
FROM node:20-slim AS builder
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install all dependencies, including devDependencies needed for tsx and typescript
RUN npm ci

# Copy the rest of the application source code
COPY . .

# Transpile TypeScript to JavaScript (optional, but good for production)
# If your server/index.ts can be run directly by node after tsx --build, this might not be strictly needed
# However, tsx in CMD might re-transpile on each start. Pre-compiling is better.
# This assumes your tsconfig.json outputs to a 'dist' folder. Adjust if different.
# RUN npx tsx --build server/index.ts --outDir dist/server

# For simplicity if tsx handles runtime transpilation well enough for your server
# and you want to avoid explicit build steps for tsx, this stage can be simpler.
# The key is that the 'runner' stage below should only have production dependencies.

# If you don't have a separate build step for TS->JS in your scripts,
# tsx will handle it at runtime, but we need tsx and typescript in the final image
# if that's the case for the CMD.
# Let's stick to the simpler approach where tsx is in the final image for now.

# Stage 2: Production Stage - Copy only necessary files and production dependencies
FROM node:20-slim AS runner
WORKDIR /usr/src/app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy package.json and package-lock.json
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy the server code and tsconfig (needed if tsx compiles at runtime)
COPY --from=builder /usr/src/app/server ./server
COPY --from=builder /usr/src/app/tsconfig.json ./tsconfig.json
# If you had other necessary files from the builder stage (e.g., transpiled JS in a dist folder), copy them here.
# COPY --from=builder /usr/src/app/dist ./dist

# Expose the port the app runs on (Cloud Run will set PORT env var, typically 8080)
# Your server/index.ts listens on process.env.PORT || 3001
EXPOSE 8080

# Command to run the application using tsx
# tsx will transpile TypeScript on the fly.
# For a more optimized production image, you'd transpile to JS in the builder stage
# and run with `node dist/server/index.js` here.
# However, given tsx is already in your dev workflow, this is a simpler setup.
CMD [ "npx", "tsx", "server/index.ts" ]
