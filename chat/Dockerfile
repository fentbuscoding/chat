# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies, including devDependencies like typescript and tsx
# npm ci is generally recommended for CI/CD for faster, more reliable builds
RUN npm ci

# Copy the rest of your application code
# This assumes your server code is in a 'server' directory and tsconfig.json is in the root
COPY server ./server
COPY tsconfig.json ./tsconfig.json
# If your server/index.ts imports anything from a top-level 'src' or other directories,
# ensure they are copied as well, or use 'COPY . .' if appropriate.
# For example, if server code depends on lib/utils.ts from src:
# COPY src/lib ./src/lib

# Make port 3001 available (though Cloud Run will use $PORT)
# The server/index.ts listens on process.env.PORT || 3001
EXPOSE 3001

# Set the environment to production
ENV NODE_ENV=production

# Define the command to run your app using tsx
# npx will use the tsx installed in node_modules by 'npm ci' if available,
# or fetch it.
CMD [ "npx", "tsx", "server/index.ts" ]
