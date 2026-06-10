$ErrorActionPreference = 'Stop'

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "      Holi-AI Local Launcher          " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "The Local Database (Postgres+pgvector) securely stores your memory, routines, and models locally." -ForegroundColor Yellow
$useLocalDb = Read-Host "Do you want to run the local Postgres database? If 'n', you MUST provide cloud Supabase keys in the UI (y/n)"
if ($useLocalDb -match "^[yY]") {
    $localDbEnabled = "true"
} else {
    $localDbEnabled = "false"
}

Write-Host "`nNgrok exposes your local backend to the internet so Garmin can send background webhooks for testing." -ForegroundColor Yellow
$useNgrok = Read-Host "Do you want to configure and run Ngrok for Garmin testing? (y/n)"
if ($useNgrok -match "^[yY]") {
    $garminDisabled = "false"
    $token = Read-Host "Please paste your NGROK_AUTHTOKEN (get it from https://dashboard.ngrok.com/get-started/your-authtoken)"
} else {
    $garminDisabled = "true"
}

# Build profiles list
$profiles = @()
if ($localDbEnabled -eq "true") { $profiles += "localdb" }
if ($garminDisabled -eq "false") { $profiles += "ngrok" }
$composeProfiles = $profiles -join ","

# Update .env
$envPath = Join-Path $PSScriptRoot ".env"
$envContent = if (Test-Path $envPath) { Get-Content $envPath -Raw } else { "" }

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

$envContent = Set-EnvVar $envContent "LOCAL_DB_ENABLED" $localDbEnabled
$envContent = Set-EnvVar $envContent "GARMIN_DISABLED" $garminDisabled
$envContent = Set-EnvVar $envContent "COMPOSE_PROFILES" $composeProfiles
if ($garminDisabled -eq "false") {
    $envContent = Set-EnvVar $envContent "NGROK_AUTHTOKEN" $token
}

Set-Content -Path $envPath -Value $envContent -NoNewline
Write-Host "`n[+] Configuration saved to .env!" -ForegroundColor Green

Write-Host "`nStarting cluster with docker compose..." -ForegroundColor Cyan
docker compose up -d --build --remove-orphans

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "✅ Cluster is launching! Wait a moment, then open http://localhost:3000" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
