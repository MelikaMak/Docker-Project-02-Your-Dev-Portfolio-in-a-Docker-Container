# ============================================================
# Stage 1: deps
# Install the npm packages. Dev and build both start from here.
# ============================================================
FROM node:24-alpine AS deps
WORKDIR /app

# Copy ONLY the package files first. Docker caches each step,
# so "npm ci" only runs again when these two files change,
# not every time you edit your code.
COPY package.json package-lock.json ./
RUN npm ci


# ============================================================
# Stage 2: dev
# For development: runs the Vite dev server with hot reload.
# Used by "docker compose up dev".
# ============================================================
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]


# ============================================================
# Stage 3: build
# Turns the React code into plain HTML, CSS and JS in /app/dist.
# ============================================================
FROM deps AS build
COPY . .
RUN npm run build


# ============================================================
# Stage 4: prod (the final image)
# A fresh, small Nginx image. We take ONLY the dist folder from
# the build stage. Node.js and node_modules are left behind.
# ============================================================
FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
