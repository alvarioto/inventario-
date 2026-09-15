param([string]$SecretFile = ".env.server")
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Path = Join-Path $Root $SecretFile
Push-Location $Root
try {
  Write-Host "=== Configuración privada de FrikiVault ===" -ForegroundColor Cyan
  Write-Host "La clave solo se guarda en .env.server, excluido de Git." -ForegroundColor Yellow
  $deepseek = Read-Host "Clave API de DeepSeek (deja vacío para conservar la actual)" -AsSecureString
  $brave = Read-Host "Clave opcional de Brave Search (deja vacío si no la tienes)" -AsSecureString
  $ebayId = Read-Host "eBay Client ID opcional (deja vacío si no lo tienes)"
  $ebaySecret = Read-Host "eBay Client Secret opcional" -AsSecureString
  function Read-Secret($value) { if (-not $value) { return "" }; $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($value); try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) } }
  $lines = @(
    "DEEPSEEK_API_KEY=$(Read-Secret $deepseek)",
    "DEEPSEEK_MODEL=deepseek-flash",
    "BRAVE_SEARCH_API_KEY=$(Read-Secret $brave)",
    "EBAY_CLIENT_ID=$ebayId",
    "EBAY_CLIENT_SECRET=$(Read-Secret $ebaySecret)",
    "HOST=127.0.0.1",
    "PORT=4173"
  )
  if (Test-Path $Path) {
    $old = Get-Content $Path -Raw
    foreach ($key in @('DEEPSEEK_API_KEY','BRAVE_SEARCH_API_KEY','EBAY_CLIENT_SECRET')) {
      if ($lines -match "^$key=$") {
        $m=[regex]::Match($old,"(?m)^$key=(.*)$"); if ($m.Success) { $lines = $lines -replace "^$key=$", "$key=$($m.Groups[1].Value)" }
      }
    }
  }
  $lines | Set-Content -Encoding UTF8 $Path
  Write-Host "Guardado: $Path" -ForegroundColor Green
  Write-Host "Ejecuta ABRIR-FRIKIVAULT.cmd para iniciar la app." -ForegroundColor Cyan
} finally { Pop-Location }
