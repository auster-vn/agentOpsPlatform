FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the embedding model so container startup is fast
# Set SKIP_MODEL_DOWNLOAD=true at build time to skip (e.g. in CI with no outbound network)
ARG SKIP_MODEL_DOWNLOAD=false
RUN if [ "$SKIP_MODEL_DOWNLOAD" != "true" ]; then \
      python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"; \
    fi

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
