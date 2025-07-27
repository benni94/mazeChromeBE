# Use official node image (Linux)
FROM node:18

# Set working directory
WORKDIR /app

# Copy only package files to install dependencies first (leverages Docker cache)
COPY package.json package-lock.json ./

# Install dependencies, rebuild native modules for Linux here
RUN npm install

# Rebuild sqlite3 native module explicitly
RUN npm rebuild sqlite3 --build-from-source

# Then copy the rest of your app source code
COPY . .

# Run the app
CMD ["node", "server.js"]
