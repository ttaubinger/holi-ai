$ErrorActionPreference = 'Stop'

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "      Stopping Holi-H(ai) Cluster        " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host "`nBringing down all containers, volumes, and orphaned services..." -ForegroundColor Yellow
docker compose down -v --remove-orphans

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "✅ Cluster stopped and cleaned up!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
