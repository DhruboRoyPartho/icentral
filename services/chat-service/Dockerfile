# Use a lightweight Node.js image
FROM node:22-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy manifest files and install dependencies
COPY package*.json ./
# Fallback to HTTP registry only if HTTPS install fails in this environment.
RUN npm install --no-audit --no-fund || npm install --no-audit --no-fund || npm install --no-audit --no-fund --registry=http://registry.npmjs.org

# Copy the rest of the source code
COPY . .

# Start the server (assuming your entry file is index.js)
CMD ["node", "index.js"]
