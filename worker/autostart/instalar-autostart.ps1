# Instala/atualiza a Scheduled Task 'AtelierWorker' (SPEC-01).
# - Gatilho: logon do usuario ATUAL (nunca SYSTEM - o login Max/OAuth do claude
#   vive na sessao do usuario; ver PROMPT-CODE-WORKER-AUTOSTART.md).
# - Acao: worker-hidden.vbs, que lanca worker-wrapper.cmd SEM janela visivel e
#   ESPERA por ele, devolvendo o codigo de saida do wrapper.
#   (v1 chamava cmd.exe /c direto, o que deixava um console preto aberto no logon.)
#   O "espera" nao e detalhe: sem ele o wscript saia na hora, a task terminava
#   com sucesso segundos depois do logon e o restart automatico da task nunca
#   podia agir - o vigia existia no papel e nao no mundo.
# - Idempotente (re-rodar atualiza a task). Sem segredos (o worker le worker/.env).
$ErrorActionPreference = 'Stop'

$wrapper = Join-Path $PSScriptRoot 'worker-wrapper.cmd'
$vbs     = Join-Path $PSScriptRoot 'worker-hidden.vbs'
$workdir = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path $wrapper)) { throw "wrapper nao encontrado: $wrapper" }

# Lancador invisivel: recria sempre, para o caminho nunca ficar defasado.
# 0 = janela oculta; True = espera o wrapper terminar (o vigia da task depende
# disso). Encoding Unicode = UTF-16 com BOM, que o Windows Script Host le sem
# depender de codepage: em ASCII o acento no caminho virava "?" e o autostart
# deixava de subir sem erro nenhum. 'Default' resolvia o acento no Windows
# PowerShell 5.1, mas foi REMOVIDO no PowerShell 6+ — sob `pwsh` (como o
# CLAUDE.md manda rodar os .ps1) a linha morria na validacao do parametro e o
# .vbs nem chegava a existir. 'Unicode' vale nas duas edicoes.
Set-Content -LiteralPath $vbs -Encoding Unicode -Value @(
  ('rc = CreateObject("WScript.Shell").Run("""' + $wrapper + '""", 0, True)'),
  'WScript.Quit rc'
)

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`"" -WorkingDirectory $workdir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
# Sem limite de execucao (daemon); restart da PROPRIA task como cinto extra
# (o wrapper ja reergue o node; isto cobre a morte do wrapper em si - so vale
# porque o .vbs espera e propaga o rc, senao a task terminaria de imediato).
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName 'AtelierWorker' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Task 'AtelierWorker' instalada/atualizada: logon de $env:USERNAME, sem janela visivel."
Write-Host "Para subir agora sem logoff: Start-ScheduledTask -TaskName 'AtelierWorker'"
