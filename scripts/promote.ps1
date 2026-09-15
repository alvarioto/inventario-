param([ValidateSet('staging','main')][string]$Target='staging')
$ErrorActionPreference='Stop'
$source = if ($Target -eq 'staging') { 'develop' } else { 'staging' }
Write-Host "Promoviendo $source -> $Target" -ForegroundColor Cyan
git fetch origin
git switch $Target
git pull --ff-only origin $Target
git merge --no-ff "origin/$source" -m "Promote $source to $Target"
git push origin $Target
Write-Host "Promoción completada. GitHub ejecutará las comprobaciones del entorno." -ForegroundColor Green
