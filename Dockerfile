# Use an official Node.js runtime as the base image
FROM node:18

# Set the working directory in the container to /app
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./
COPY yarn.lock ./

# Install any needed packages specified in package.json
RUN npm install -g yarn

# Install any needed packages specified in package.json
RUN yarn

# Copy the rest of your app's source code to /app
COPY . .

# Build the app
RUN yarn build

# Define the command to run your app using CMD which defines your runtime
CMD ["yarn", "start"]
