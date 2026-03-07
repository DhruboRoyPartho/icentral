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

# Expose Vite's default port
EXPOSE 5173

# Start Vite and expose it to the Docker network (--host is required for Docker)
CMD ["npm", "run", "dev", "--", "--host"]
