$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
  Write-Host "Migrando FrikiVault a la edicion Spark sin Blaze..." -ForegroundColor Cyan

  if (Test-Path (Join-Path $Root "functions")) {
    Remove-Item (Join-Path $Root "functions") -Recurse -Force
    Write-Host "Eliminada carpeta functions." -ForegroundColor Green
  }
  if (Test-Path (Join-Path $Root "storage.rules")) {
    Remove-Item (Join-Path $Root "storage.rules") -Force
    Write-Host "Eliminadas reglas de Cloud Storage." -ForegroundColor Green
  }

  $envPath = Join-Path $Root ".env.local"
  if (Test-Path $envPath) {
    $text = Get-Content $envPath -Raw
    $lines = $text -split "`r?`n" | Where-Object { $_ -notmatch '^VITE_FIREBASE_STORAGE_BUCKET=' -and $_ -notmatch '^VITE_AI_MODEL=' -and $_ -notmatch '^VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=' -and $_ -notmatch '^VITE_APPCHECK_DEBUG=' }
    $newText = ($lines -join "`r`n").TrimEnd() + "`r`nVITE_AI_MODEL=gemini-3.5-flash-lite`r`nVITE_RECAPTCHA_ENTERPRISE_SITE_KEY=`r`nVITE_APPCHECK_DEBUG=false`r`n"
    Set-Content -Encoding UTF8 $envPath $newText
    Write-Host ".env.local actualizado sin borrar tu configuracion Firebase." -ForegroundColor Green
  } else {
    Write-Host "No hay .env.local. Ejecuta .\scripts\CONFIGURAR-FIREBASE.ps1" -ForegroundColor Yellow
  }

  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

  Write-Host "" 
  Write-Host "LISTO: esta copia ya no usa Functions, Storage ni Secret Manager." -ForegroundColor Green
  Write-Host "Ahora configura AI Logic + App Check y despues ejecuta .\scripts\DESPLEGAR.ps1" -ForegroundColor Cyan
}
finally {
  Pop-Location
}
