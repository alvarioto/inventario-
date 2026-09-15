$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
  node scripts/COMPROBAR-CONFIG.mjs
  if ($LASTEXITCODE -ne 0) { throw "Falta configurar Firebase. No se ha publicado nada." }

  Write-Host "Building FrikiVault Spark..." -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }

  Write-Host "Deploying Hosting + Firestore rules/indexes (NO Functions, NO Storage)..." -ForegroundColor Cyan
  firebase deploy --only hosting,firestore:rules,firestore:indexes
  if ($LASTEXITCODE -ne 0) { throw "Firebase deploy failed." }
  Write-Host "FrikiVault deployed on Spark-compatible services." -ForegroundColor Green
}
finally {
  Pop-Location
}
