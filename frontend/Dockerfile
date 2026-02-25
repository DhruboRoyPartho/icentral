# Use a lightweight Node.js image
FROM node:22-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy the rest of the source code
COPY . .

# Expose Vite's default port
EXPOSE 5173

# Start Vite and expose it to the Docker network (--host is required for Docker)
CMD ["npm", "run", "dev", "--", "--host"]