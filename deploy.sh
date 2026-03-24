#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

SERVICE_NAME="taluithai-backend"
REGION="asia-southeast1" # Singapore region for low latency to Thailand

echo "🚀 Deploying $SERVICE_NAME to Google Cloud Run in $REGION..."

# Make sure you have authenticated using: 
# gcloud auth login
# gcloud config set project YOUR_PROJECT_ID

gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,PORT=8000" \
  --platform managed

echo "✅ Deployment complete!"
echo "Don't forget to set up your environment variables/secrets in the GCP Cloud Run console!"
