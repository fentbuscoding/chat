# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or npm-shrinkwrap.json)
# These are copied first to leverage Docker cache for dependencies
COPY package*.json ./

# Install ALL dependencies (including devDependencies like tsx and typescript, as tsx needs them)
# npm ci installs based on package-lock.json and is recommended for CI/build environments
RUN npm ci

# Copy only the necessary source files for the server
# This assumes your server code is in the 'server' directory and tsx needs tsconfig.json
COPY ./server ./server
COPY tsconfig.json ./tsconfig.json

# The port your app will run on. Cloud Run sets the PORT env var (usually 8080).
# Your server/index.ts (process.env.PORT || 3001) will pick this up.
EXPOSE 8080

# Set the environment to production. This can affect how some Node.js libraries behave.
ENV NODE_ENV=production

# Command to run your application using tsx
# tsx will compile and run server/index.ts directly. No 'watch' needed for production.
CMD [ "npx", "tsx", "server/index.ts" ]
