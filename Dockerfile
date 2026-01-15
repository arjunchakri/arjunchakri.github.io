# Use a lightweight Nginx image to serve the static content
FROM nginx:alpine

# Copy the static files from the repository to the Nginx public folder
COPY . /usr/share/nginx/html

# Expose port 80 to allow incoming traffic
EXPOSE 80

# Start Nginx when the container launches
CMD ["nginx", "-g", "daemon off;"]