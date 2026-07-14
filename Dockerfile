FROM node:22 AS frontend-build

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt
COPY notification_service.py ./
COPY --from=frontend-build /app/dist ./dist

ENV PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python", "notification_service.py"]
