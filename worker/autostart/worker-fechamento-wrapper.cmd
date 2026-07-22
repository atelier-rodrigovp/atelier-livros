@echo off
rem Wrapper do worker do FECHAMENTO V2 (worktree ATELIER-LIVROS-V2-FECHAMENTO).
rem Mesmo desenho do worker-wrapper.cmd da producao (SPEC-01): mantem o worker
rem de pe com auto-restart e anti-duplicata; roda via Scheduled Task
rem 'AtelierWorkerFechamento' na sessao do usuario (login Max/OAuth do claude).
rem Log unificado com o acompanhamento do fechamento: atelier-work\worker-fechamento.log
cd /d "%~dp0.."
set ANTHROPIC_API_KEY=
set PYTHONUTF8=1

:loop
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'index\.ts' }) { exit 1 }; exit 0"
if errorlevel 1 (
  rem ja existe worker rodando - espera e re-verifica (supervisor)
  ping -n 61 127.0.0.1 >nul
  goto loop
)

node --import tsx "src\index.ts" >> "C:\Users\Rodrigo Paiva\atelier-work\worker-fechamento.log" 2>&1
echo [wrapper-fechamento] worker saiu rc=%errorlevel% - reiniciando em 15s...>> "C:\Users\Rodrigo Paiva\atelier-work\worker-fechamento.log"
ping -n 16 127.0.0.1 >nul
goto loop
