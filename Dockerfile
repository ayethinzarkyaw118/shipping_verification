FROM node:22-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
RUN npm run build


FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY build_submission.py .
COPY demo_data ./demo_data
COPY render_app.py .
COPY --from=frontend-build /frontend/dist ./frontend/dist

ENV PORT=10000
EXPOSE 10000

CMD ["sh", "-c", "uvicorn render_app:app --host 0.0.0.0 --port $PORT"]
