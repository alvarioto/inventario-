param(
  [string]$Repo = "alvarioto/frikivault"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
  Write-Host "=== FrikiVault / GitHub ===" -ForegroundColor Cyan

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git was not found. Install Git for Windows and retry."
  }

  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
      Write-Host "Installing GitHub CLI..." -ForegroundColor Yellow
      winget install --id GitHub.cli --exact --accept-source-agreements --accept-package-agreements
      $env:Path += ";$env:ProgramFiles\GitHub CLI"
    }
  }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) was not found. Install it and retry."
  }

  & gh auth status *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Opening GitHub login..." -ForegroundColor Yellow
    & gh auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) { throw "GitHub login failed." }
  }

  if (-not (Test-Path (Join-Path $Root ".git"))) {
    & git init -b main
    if ($LASTEXITCODE -ne 0) { throw "git init failed." }
  }

  & git add .
  & git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    & git commit -m "Initial FrikiVault Firebase app"
    if ($LASTEXITCODE -ne 0) {
      throw "Git commit failed. Configure git user.name and user.email, then retry."
    }
  }

  & gh repo view $Repo *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Repository $Repo already exists. Pushing changes..." -ForegroundColor Yellow
    $remote = (& git remote get-url origin 2>$null)
    if (-not $remote) { & git remote add origin "https://github.com/$Repo.git" }
    & git push -u origin main
  } else {
    Write-Host "Creating private repository $Repo..." -ForegroundColor Yellow
    & gh repo create $Repo --private --source $Root --remote origin --push --description "Mobile collectibles inventory with Firebase and visual AI"
  }

  if ($LASTEXITCODE -ne 0) { throw "GitHub returned an error while creating/pushing the repository." }
  Write-Host "Ready: https://github.com/$Repo" -ForegroundColor Green
}
finally {
  Pop-Location
}
