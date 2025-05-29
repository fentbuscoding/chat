# Dockerfile for the Socket.IO server (server/index.ts)
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

# Install all dependencies, including devDependencies needed for tsx and typescript
# npm ci is generally recommended for CI/CD as it uses package-lock.json strictly
RUN npm ci

# Bundle app source by copying all files from the build context.
# .dockerignore will control what gets copied.
COPY . .

# Your server in server/index.ts listens on process.env.PORT || 3001.
# Google Cloud Run sets the PORT environment variable (typically to 8080).
# EXPOSE is documentation for humans and for Docker to map ports if run locally,
# but Cloud Run uses the PORT env var to route traffic.
EXPOSE 8080

# Set environment to production
ENV NODE_ENV=production

# Start the server using tsx
# npx ensures that tsx (if installed locally in node_modules/.bin) is found
CMD [ "npx", "tsx", "server/index.ts" ]
