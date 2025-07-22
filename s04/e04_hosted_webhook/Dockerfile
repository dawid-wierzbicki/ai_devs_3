FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Install TypeScript compiler
RUN npm install -g typescript

# Copy source code
COPY . .

# Copy environment file if it exists
COPY .env* ./

# Build the TypeScript file
RUN npm run build:hosted-webhook

# Expose port
EXPOSE 3000

# Set environment variable for port
ENV PORT=3000

# Start the webhook server
CMD ["npm", "run", "start:hosted-webhook"] 