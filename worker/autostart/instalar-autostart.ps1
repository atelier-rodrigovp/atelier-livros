# Instala/atualiza a Scheduled Task 'AtelierWorker' (SPEC-01).
# - Gatilho: logon do usuario ATUAL (nunca SYSTEM — o login Max/OAuth do claude
#   vive na sessao do usuario; ver PROMPT-CODE-WORKER-AUTOSTART.md).
# - Acao: worker-wrapper.cmd (loop com auto-restart + anti-duplicata).
# - Idempotente (re-rodar atualiza a task). Sem segredos (o worker le worker/.env).
$ErrorActionPreference = 'Stop'

$wrapper = Join-Path $PSScriptRoot 'worker-wrapper.cmd'
$workdir = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path $wrapper)) { throw "wrapper nao encontrado: $wrapper" }

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$wrapper`"" -WorkingDirectory $workdir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
# Sem limite de execucao (daemon); restart da PROPRIA task como cinto extra
# (o wrapper ja reergue o node; isto cobre a morte do wrapper em si).
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName 'AtelierWorker' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Task 'AtelierWorker' instalada/atualizada: logon de $env:USERNAME, wrapper com auto-restart."
Write-Host "Para subir agora sem logoff: Start-ScheduledTask -TaskName 'AtelierWorker'"
