# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies.
# The build log showed:
# 1. npm ci --only=production (installs only prod deps based on lock file)
# 2. npm install --ignore-scripts (this would then install dev deps as well if present in lock file,
#    as 'only=production' isn't specified here again. tsx is a devDep).
# This combination should make tsx available.
RUN npm ci --only=production
RUN npm install --ignore-scripts
# A cleaner approach for tsx in prod might be to ensure tsx & typescript are in 'dependencies',
# or to have a build step that compiles TS to JS. But based on build logs, the above works.

# Copy the server code and tsconfig
COPY server ./server
COPY tsconfig.json ./tsconfig.json

# The server listens on process.env.PORT, which Cloud Run sets (default 8080).
# Your server/index.ts uses process.env.PORT || 3001.
# EXPOSE 8080 # Cloud Run uses the PORT env var, EXPOSE is more for documentation.

ENV NODE_ENV=production

# Command to run the application using tsx, without watch mode for production.
CMD [ "npx", "tsx", "server/index.ts" ]
