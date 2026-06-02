#!/bin/bash
# ============================================================
# AgentOps Platform - Quick Setup Script
# ============================================================
set -e

echo "🚀 Starting AgentOps Platform setup..."

# Fix permissions for create_dbs.sh
chmod +x ./scripts/create_dbs.sh

# Ensure .env exists
if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || true
fi

# Pull all images first
echo "📦 Pulling Docker images..."
docker compose pull --ignore-pull-failures

# Start infrastructure first
echo "🔧 Starting core infrastructure (Postgres, MinIO, Kafka)..."
docker compose up -d postgres minio zookeeper
sleep 10

docker compose up -d kafka
sleep 15

echo "⚙️ Setting up Kafka topics and MinIO buckets..."
docker compose up kafka-setup minio-setup
sleep 5

echo "🌊 Starting Spark cluster..."
docker compose up -d spark-master spark-worker
sleep 10

echo "🔬 Starting MLflow..."
docker compose up -d mlflow
sleep 15

echo "🌪 Starting Airflow..."
docker compose up -d airflow-init
sleep 30
docker compose up -d airflow-webserver airflow-scheduler

echo "🤖 Starting data generator..."
docker compose up -d generator

echo "⚡ Starting Spark Streaming job..."
docker compose up -d streaming-job

echo "🌐 Starting API..."
docker compose up -d api

echo "🎨 Starting Dashboard..."
docker compose up -d dashboard

echo ""
echo "============================================================"
echo "✅ AgentOps Platform is running!"
echo "============================================================"
echo ""
echo "📊 Dashboard:     http://localhost:3000"
echo "🔌 API Docs:      http://localhost:8000/docs"
echo "🧪 MLflow:        http://localhost:5000"
echo "🌪 Airflow:       http://localhost:8088  (admin/admin)"
echo "💾 MinIO:         http://localhost:9001   (minioadmin/minioadmin123)"
echo "⚡ Spark UI:      http://localhost:8080"
echo "🐘 PostgreSQL:    localhost:5432          (agentops/agentops)"
echo ""
echo "Data is being generated and streamed in real-time!"
echo "Open the dashboard to see live metrics. 🚀"
