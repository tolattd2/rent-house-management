# Builds the production Docker image on your PC for the Synology NAS and saves it
# to a tarball you copy to the NAS. Run from the repo root in PowerShell:
#
#   .\scripts\build-image.ps1
#
# Prerequisites: Docker Desktop (with buildx) running on Windows.
# NAS CPU is Intel Celeron J4025 -> linux/amd64 (no emulation needed on an x86 PC).

$ErrorActionPreference = 'Stop'

$Image    = 'happyhome-app:latest'
$Platform = 'linux/amd64'        # Intel Celeron J4025 (x86-64)
$OutFile  = 'happyhome-app.tar'

Write-Host "==> Building $Image for $Platform ..." -ForegroundColor Cyan
docker buildx build --platform $Platform -t $Image --load .
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

Write-Host "==> Saving image to $OutFile ..." -ForegroundColor Cyan
docker save -o $OutFile $Image
if ($LASTEXITCODE -ne 0) { throw "docker save failed" }

$sizeMB = [math]::Round((Get-Item $OutFile).Length / 1MB, 1)
Write-Host "==> Done: $OutFile ($sizeMB MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Copy $OutFile to the NAS (File Station, scp, or a shared folder)."
Write-Host "  2. On the NAS:  docker load -i $OutFile"
Write-Host "  3. docker compose --env-file .env.production up -d"
