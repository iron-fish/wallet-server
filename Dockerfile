# Use an official Node.js runtime as the base image
FROM node:18

# Set the working directory in the container to /app
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install any needed packages specified in package.json
RUN npm install

# Copy the rest of your app's source code to /app
COPY . .

# Build the app
CMD ["npm", "run", "build"]

# Make port 50051 available to the outside 
EXPOSE 50051

# Define the command to run your app using CMD which defines your runtime
CMD ["npm", "run", "start"]
