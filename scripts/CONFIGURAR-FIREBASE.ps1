param(
  [string]$ProjectId = "frikivault-alvarioto-2026"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root

try {
  Write-Host "=== FrikiVault Spark / configuracion Firebase ===" -ForegroundColor Cyan
  Write-Host "SIN Cloud Functions, SIN Cloud Storage, SIN Secret Manager, SIN Blaze obligatorio." -ForegroundColor Green
  Write-Host "Project root: $Root" -ForegroundColor DarkGray

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is required." }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm was not found." }
  if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Firebase CLI..." -ForegroundColor Yellow
    npm install -g firebase-tools
    if ($LASTEXITCODE -ne 0) { throw "Firebase CLI could not be installed." }
  }

  firebase login
  if ($LASTEXITCODE -ne 0) { throw "Firebase login failed." }

  $projectList = (& firebase projects:list 2>&1 | Out-String)
  if ($projectList -notmatch [regex]::Escape($ProjectId)) {
    Write-Host "Creating Firebase project $ProjectId..." -ForegroundColor Yellow
    firebase projects:create $ProjectId --display-name "FrikiVault"
    if ($LASTEXITCODE -ne 0) { throw "Could not create Firebase project $ProjectId." }
  } else {
    Write-Host "Project already exists. Reusing it." -ForegroundColor Green
  }

  @"
{
  "projects": {
    "default": "$ProjectId"
  }
}
"@ | Set-Content -Encoding UTF8 (Join-Path $Root ".firebaserc")

  $appsOutput = (& firebase apps:list web --project $ProjectId 2>&1 | Out-String)
  $appMatch = [regex]::Match($appsOutput, '1:\d+:web:[A-Za-z0-9]+')
  if (-not $appMatch.Success) {
    firebase apps:create web "FrikiVault Web" --project $ProjectId
    if ($LASTEXITCODE -ne 0) { throw "Could not register Firebase Web app." }
    $appsOutput = (& firebase apps:list web --project $ProjectId 2>&1 | Out-String)
    $appMatch = [regex]::Match($appsOutput, '1:\d+:web:[A-Za-z0-9]+')
  }
  if (-not $appMatch.Success) { throw "Could not determine Firebase Web App ID." }
  $appId = $appMatch.Value

  $configFile = Join-Path $Root "firebase-web-config.json"
  firebase apps:sdkconfig web $appId -o $configFile --project $ProjectId
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $configFile)) { throw "Could not download Firebase Web configuration." }
  $config = Get-Content $configFile -Raw | ConvertFrom-Json

  $existingRecaptcha = ""
  $envPath = Join-Path $Root ".env.local"
  if (Test-Path $envPath) {
    $m = [regex]::Match((Get-Content $envPath -Raw), '(?m)^VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=(.*)$')
    if ($m.Success) { $existingRecaptcha = $m.Groups[1].Value.Trim() }
  }

  @"
VITE_FIREBASE_API_KEY=$($config.apiKey)
VITE_FIREBASE_AUTH_DOMAIN=$($config.authDomain)
VITE_FIREBASE_PROJECT_ID=$($config.projectId)
VITE_FIREBASE_MESSAGING_SENDER_ID=$($config.messagingSenderId)
VITE_FIREBASE_APP_ID=$($config.appId)
VITE_AI_MODEL=gemini-3.5-flash-lite
VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=$existingRecaptcha
VITE_APPCHECK_DEBUG=false
VITE_DEMO_MODE=false
"@ | Set-Content -Encoding UTF8 $envPath
  Remove-Item $configFile -Force -ErrorAction SilentlyContinue
  Write-Host ".env.local created in project root." -ForegroundColor Green

  Write-Host "Checking Firestore..." -ForegroundColor Yellow
  $dbOutput = (& firebase firestore:databases:list --project $ProjectId 2>&1 | Out-String)
  if ($dbOutput -match '\(default\)') {
    Write-Host "Firestore default database already exists." -ForegroundColor Green
  } else {
    Write-Host "Firestore is not detected yet. Create it in the Firebase console:" -ForegroundColor Yellow
    Write-Host "Bases de datos y almacenamiento > Firestore > Crear base de datos" -ForegroundColor White
    Write-Host "Standard / (default) / europe-west1 / Production mode" -ForegroundColor Cyan
  }

  Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

  Write-Host "" 
  Write-Host "PASOS MANUALES RESTANTES - TODOS COMPATIBLES CON SPARK" -ForegroundColor Yellow
  Write-Host "1) Authentication > Comenzar > Google > Activar." -ForegroundColor White
  Write-Host "2) Servicios de IA > Logica de IA > Comenzar > Gemini Developer API > NIVEL GRATUITO." -ForegroundColor White
  Write-Host "3) En el asistente de AI Logic configura App Check/reCAPTCHA Enterprise para la app web." -ForegroundColor White
  Write-Host "4) Copia el Key ID publico de reCAPTCHA Enterprise a VITE_RECAPTCHA_ENTERPRISE_SITE_KEY en .env.local." -ForegroundColor White
  Write-Host "5) NO actives Cloud Storage, Functions, Secret Manager ni Blaze." -ForegroundColor Green
  Write-Host "" 
  Write-Host "Cuando termines: .\scripts\DESPLEGAR.ps1" -ForegroundColor Cyan
  Start-Process "https://console.firebase.google.com/project/$ProjectId/overview"
}
finally {
  Pop-Location
}
