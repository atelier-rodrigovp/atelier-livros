@echo off
rem Wrapper do worker (SPEC-01): mantem o worker SEMPRE de pe.
rem - auto-restart se o processo sair (crash, exit por bug, etc.), com backoff;
rem - anti-duplicata: se ja ha um worker (index.ts) rodando (ex.: npm start manual),
rem   o wrapper vira supervisor silencioso e so assume quando aquele morrer.
rem Executado pela Scheduled Task 'AtelierWorker' no logon do usuario (NUNCA SYSTEM
rem - o login Max/OAuth do claude vive na sessao do usuario).
cd /d "%~dp0.."

:loop
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'index\.ts' }) { exit 1 }; exit 0"
if errorlevel 1 (
  rem ja existe worker rodando - espera e re-verifica (supervisor)
  ping -n 61 127.0.0.1 >nul
  goto loop
)

node --import tsx "src\index.ts" >> "worker.log" 2>&1
echo [wrapper] worker saiu rc=%errorlevel% - reiniciando em 15s...>> "worker.log"
ping -n 16 127.0.0.1 >nul
goto loop
