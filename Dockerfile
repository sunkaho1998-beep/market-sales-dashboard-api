FROM node:22-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS backend
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/src ./src
COPY --from=frontend-build /build/frontend/dist ./frontend/dist
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm","start"]
