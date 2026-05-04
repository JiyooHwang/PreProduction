FROM python:3.11-slim

# FFmpeg + 기본 빌드 도구
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# shotbreakdown 코어 라이브러리 먼저 설치
COPY shotbreakdown ./shotbreakdown
COPY pyproject.toml ./pyproject.toml
RUN pip install --no-cache-dir -e .

# 백엔드 의존성
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# 백엔드 앱
COPY backend/app ./backend/app

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/backend

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "/app/backend"]
