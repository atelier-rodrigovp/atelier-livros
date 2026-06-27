# Reaplica os patches de skill (worker/skill-patches/<skill>/) sobre ~/.claude/skills/.
# Faz backup do que existir antes de sobrescrever. Rodar depois de um reinstall de skills.
# ASCII puro de proposito: PowerShell 5.1 le .ps1 sem BOM como ANSI e quebra com acentos.
$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$dst  = Join-Path $HOME '.claude\skills'
if (-not (Test-Path $dst)) { throw "pasta de skills nao encontrada: $dst" }

# Backup FORA da pasta de skills: um backup dentro dela viraria uma skill fantasma
# (mesmo name: no frontmatter), confundindo o loader.
$stamp   = Get-Date -Format 'yyyyMMddHHmmss'
$bakRoot = Join-Path $HOME ".claude\skill-backups\$stamp"

Get-ChildItem -Path $base -Directory | ForEach-Object {
  $skill  = $_.Name
  $target = Join-Path $dst $skill
  if (Test-Path $target) {
    New-Item -ItemType Directory -Path $bakRoot -Force | Out-Null
    Copy-Item $target (Join-Path $bakRoot $skill) -Recurse -Force
    Write-Host "backup:     $bakRoot\$skill"
  } else {
    New-Item -ItemType Directory -Path $target -Force | Out-Null
  }
  Copy-Item (Join-Path $_.FullName '*') $target -Recurse -Force
  Write-Host "reaplicado: $skill -> $target"
}
Write-Host "OK - patches reaplicados."
