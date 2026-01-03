# AgentPlaybooks Seed Script (PowerShell wrapper)
# 
# Usage:
#   .\scripts\seed-data.ps1
#   .\scripts\seed-data.ps1 -SkipMigrations
#   .\scripts\seed-data.ps1 -DryRun
#
# Required environment variables (or will prompt):
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
#   GITHUB_TOKEN (optional, for higher rate limits)

param(
    [switch]$SkipMigrations,
    [switch]$DryRun,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
AgentPlaybooks Seed Script
==========================

This script seeds the database with:
- Sample skills from awesome-cursorrules GitHub repo
- Sample MCP servers from official modelcontextprotocol/servers

Parameters:
  -SkipMigrations  Skip running database migrations
  -DryRun          Show what would be done without making changes
  -Help            Show this help message

Environment Variables:
  SUPABASE_URL               Your Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY  Service role key (admin access)
  GITHUB_TOKEN               Optional: GitHub token for higher rate limits

Example:
  $env:SUPABASE_URL = "https://xxx.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
  .\scripts\seed-data.ps1
"@
    exit 0
}

Write-Host "🚀 AgentPlaybooks Seed Script" -ForegroundColor Cyan
Write-Host "=" * 50

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is required but not found in PATH" -ForegroundColor Red
    exit 1
}

# Check environment variables
if (-not $env:SUPABASE_URL) {
    $env:SUPABASE_URL = Read-Host "Enter SUPABASE_URL"
}

if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
    $secure = Read-Host "Enter SUPABASE_SERVICE_ROLE_KEY" -AsSecureString
    $env:SUPABASE_SERVICE_ROLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No changes will be made" -ForegroundColor Yellow
}

# Change to project root
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot

try {
    # Install dependencies if needed
    if (-not (Test-Path "node_modules")) {
        Write-Host "`n📦 Installing dependencies..." -ForegroundColor Yellow
        npm install
    }

    # Install ts-node if not present
    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        Write-Host "❌ npx not found" -ForegroundColor Red
        exit 1
    }

    # Run migrations unless skipped
    if (-not $SkipMigrations) {
        Write-Host "`n📊 Running migrations..." -ForegroundColor Yellow
        # Note: In production, use supabase CLI for migrations
        Write-Host "   (Migrations should be applied via Supabase CLI)" -ForegroundColor Gray
    }

    # Run the seed script
    Write-Host "`n🌱 Running seed script..." -ForegroundColor Yellow
    
    if ($DryRun) {
        $env:DRY_RUN = "true"
    }
    
    npx tsx scripts/seed-data.ts
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Seed script failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    
    Write-Host "`n✅ Seed completed successfully!" -ForegroundColor Green

} finally {
    Pop-Location
}


