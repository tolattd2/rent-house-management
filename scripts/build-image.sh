#!/usr/bin/env bash
# Builds the production Docker image for the Synology NAS and saves it to a tarball.
# Run from the repo root:  ./scripts/build-image.sh
# Prerequisites: Docker with buildx. NAS is Intel Celeron J4025 -> linux/amd64.
set -euo pipefail

IMAGE="happyhome-app:latest"
PLATFORM="linux/amd64"
OUT="happyhome-app.tar"

echo "==> Building $IMAGE for $PLATFORM ..."
docker buildx build --platform "$PLATFORM" -t "$IMAGE" --load .

echo "==> Saving image to $OUT ..."
docker save -o "$OUT" "$IMAGE"

echo "==> Done: $OUT ($(du -h "$OUT" | cut -f1))"
echo
echo "Next steps:"
echo "  1. Copy $OUT to the NAS."
echo "  2. On the NAS:  docker load -i $OUT"
echo "  3. docker compose --env-file .env.production up -d"
