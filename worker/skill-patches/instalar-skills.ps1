# Reaplica os patches de skill (worker/skill-patches/<skill>/) sobre ~/.claude/skills/.
# Faz backup do que existir antes de sobrescrever. Rodar depois de um reinstall de skills.
$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$dst  = Join-Path $HOME '.claude\skills'
if (-not (Test-Path $dst)) { throw "pasta de skills não encontrada: $dst" }

$stamp = Get-Date -Format 'yyyyMMddHHmmss'
Get-ChildItem -Path $base -Directory | ForEach-Object {
  $skill  = $_.Name
  $target = Join-Path $dst $skill
  if (Test-Path $target) {
    $bak = "$target.bak-$stamp"
    Copy-Item $target $bak -Recurse -Force
    Write-Host "backup:     $bak"
  } else {
    New-Item -ItemType Directory -Path $target -Force | Out-Null
  }
  Copy-Item (Join-Path $_.FullName '*') $target -Recurse -Force
  Write-Host "reaplicado: $skill -> $target"
}
Write-Host "OK — patches reaplicados."
