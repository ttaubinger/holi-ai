$ErrorActionPreference = 'Stop'

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "      Holi-AI Mobile App Builder      " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script will statically package the Next.js frontend into a native Capacitor bundle." -ForegroundColor Yellow

$feDir = Join-Path $PSScriptRoot "holi-ai-fe"
$envPath = Join-Path $feDir ".env.production"

# Check if .env.production exists and has NEXT_PUBLIC_API_URL
$apiUrl = ""
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    if ($envContent -match "(?m)^NEXT_PUBLIC_API_URL=(.*)$") {
        $apiUrl = $matches[1]
    }
}

if ([string]::IsNullOrWhiteSpace($apiUrl) -or $apiUrl -eq "/api") {
    Write-Host "`nNo live backend URL detected in .env.production." -ForegroundColor Yellow
    $apiUrl = Read-Host "Please enter your live Backend API URL (e.g., https://your-backend.onrender.com/api)"
} else {
    Write-Host "`nLive backend URL detected: $apiUrl" -ForegroundColor Green
    $changeUrl = Read-Host "Do you want to change this URL? (y/n)"
    if ($changeUrl -match "^[yY]") {
        $apiUrl = Read-Host "Please enter your new Backend API URL (e.g., https://your-backend.onrender.com/api)"
    }
}

# Ensure API URL has /api at the end, if it's missing but not empty
if (-not $apiUrl.EndsWith("/api")) {
    $apiUrl = $apiUrl.TrimEnd('/') + "/api"
    Write-Host "Auto-formatted URL to: $apiUrl" -ForegroundColor DarkGray
}

$envContent = ""
if (Test-Path $envPath) { $envContent = Get-Content $envPath -Raw }

function Set-EnvVar ($content, $key, $val) {
    if ($content -match "(?m)^${key}=.*$") {
        return $content -replace "(?m)^${key}=.*$", "${key}=${val}"
    } else {
        if ($content -eq "") {
            return "${key}=${val}"
        }
        return $content + "`n${key}=${val}"
    }
}

$envContent = Set-EnvVar $envContent "NEXT_PUBLIC_API_URL" $apiUrl
$envContent = Set-EnvVar $envContent "NEXT_PUBLIC_LOCAL_DB" "false"

Set-Content -Path $envPath -Value $envContent -NoNewline
Write-Host "[+] Saved variables to holi-ai-fe/.env.production!" -ForegroundColor Green

Write-Host "`nRunning mobile build process..." -ForegroundColor Cyan

Push-Location $feDir
try {
    Write-Host "Installing dependencies..." -ForegroundColor DarkGray
    npm install
    
    Write-Host "`nPackaging the application..." -ForegroundColor DarkGray
    npm run build:mobile
    
    Write-Host "`n=========================================" -ForegroundColor Cyan
    Write-Host "✅ Native Web Assets synced successfully!" -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Cyan
} finally {
    Pop-Location
}
