@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
rem ============================================================
rem  Wrapper do worker (SPEC-01) - v2
rem  Mantem o worker de pe, mas SEM esconder falha permanente.
rem
rem  Mudancas em relacao a v1:
rem   - backoff exponencial de verdade: 15s -> 30s -> 60s -> 120s -> 300s (teto)
rem   - disjuntor: apos MAXFAILS falhas consecutivas o wrapper PARA e
rem     grava worker.STOPPED, em vez de reiniciar para sempre
rem   - rotacao de log: acima de MAXLOGMB o worker.log vira worker.log.1
rem   - anti-duplicata preciso: casa index.ts E o caminho deste projeto,
rem     entao um index.ts de outro projeto nao engana mais o supervisor.
rem     Para isso o worker E LANCADO COM CAMINHO ABSOLUTO - com caminho
rem     relativo a raiz nao aparece na linha de comando e a checagem cega.
rem     Por isso a checagem e FAIL-CLOSED: so e "de outro projeto" quando a
rem     linha traz um index.ts com caminho ABSOLUTO que nao e o nosso. Se o
rem     index.ts vier relativo, nao da para atribuir a ninguem e o worker e
rem     assumido como NOSSO. Sem essa saida o supervisor nao enxergava o
rem     worker da v1 (`node --import tsx "src\index.ts"`) nem um `npm start`
rem     a mao, e subia um SEGUNDO worker na mesma fila de jobs. Dois workers
rem     claimando job e pior do que um supervisor conservador demais.
rem     O teste e no ARGUMENTO, nao na linha toda: o proprio node.exe vem com
rem     caminho absoluto ("C:\Program Files\nodejs\node.exe") e mascarava um
rem     argumento relativo.
rem   - chcp 65001: a codepage do console. Os avisos deste wrapper sao todos
rem     sem acento, e a saida do node vai redirecionada para arquivo (onde a
rem     codepage do console nao manda), entao isto e higiene, nao conserto.
rem
rem  Executado pela Scheduled Task 'AtelierWorker' no logon do usuario
rem  (NUNCA SYSTEM - o login Max/OAuth do claude vive na sessao do usuario).
rem ============================================================

cd /d "%~dp0.."
set "ROOT=%CD%"
set "LOG=%ROOT%\worker.log"
set "MAXLOGMB=10"
set "MAXFAILS=10"
set "FAILS=0"
set "WAIT=15"

rem ---------- disjuntor ja aberto? respeita e sai ----------
rem A task reergue o wrapper quando ele morre (RestartCount), entao o disjuntor
rem precisa sobreviver a esse restart. Sai com 0 de proposito: 0 = "terminou",
rem e a task NAO reagenda. Quem apaga worker.STOPPED e quem consertou a causa.
if exist "%ROOT%\worker.STOPPED" (
  echo [wrapper] worker.STOPPED presente em %DATE% %TIME% - disjuntor aberto, nao vou subir.>> "%LOG%"
  echo [wrapper] Conserte a causa, apague worker.STOPPED e rode: schtasks /run /tn AtelierWorker>> "%LOG%"
  endlocal
  exit /b 0
)

:loop

rem ---------- ja existe worker DESTE projeto rodando? ----------
powershell -NoProfile -Command "$r=$env:ROOT; if (-not $r) { exit 1 }; $r=$r.ToLower(); foreach ($p in (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -EA 0)) { $c=$p.CommandLine; if (-not $c) { continue }; $c=$c.ToLower(); if (-not $c.Contains('index.ts')) { continue }; if ($c.Contains($r) -or -not ($c -match '[a-z]:[\\/]\S*index\.ts')) { exit 1 } }; exit 0"
if errorlevel 1 (
  rem instancia manual no ar - vira supervisor silencioso e zera o contador
  set "FAILS=0"
  set "WAIT=15"
  ping -n 61 127.0.0.1 >nul
  goto loop
)

rem ---------- rotacao de log ----------
rem So aqui: neste ponto nenhum worker segura o arquivo. Se rodasse na volta do
rem supervisor, o move falharia calado (arquivo em uso) e o aviso sairia mentindo.
set "LOGSIZE=0"
for %%F in ("%LOG%") do set "LOGSIZE=%%~zF"
if not defined LOGSIZE set "LOGSIZE=0"
set /a LOGMB=!LOGSIZE! / 1048576
if !LOGMB! GEQ %MAXLOGMB% (
  rem move /y ja sobrescreve o .1 - apagar antes destruiria o backup se o move falhasse
  move /y "%LOG%" "%LOG%.1" >nul 2>&1
  if not errorlevel 1 echo [wrapper] log rotacionado em %DATE% %TIME% ^(anterior: worker.log.1^)>> "%LOG%"
)

rem ---------- sobe o worker (bloqueia ate ele sair) ----------
rem Caminho ABSOLUTO de proposito: e o que faz a raiz aparecer na linha de
rem comando do processo e a checagem anti-duplicata acima enxergar este worker.
echo [wrapper] iniciando worker em %DATE% %TIME%>> "%LOG%"
node --import tsx "%ROOT%\src\index.ts" >> "%LOG%" 2>&1
set "RC=!errorlevel!"

if "!RC!"=="0" (
  echo [wrapper] worker encerrou limpo rc=0 - reiniciando em 15s...>> "%LOG%"
  set "FAILS=0"
  set "WAIT=15"
) else (
  set /a FAILS=!FAILS! + 1
  echo [wrapper] worker saiu rc=!RC! - falha consecutiva !FAILS!/%MAXFAILS% - proxima tentativa em !WAIT!s...>> "%LOG%"
)

rem ---------- disjuntor ----------
if !FAILS! GEQ %MAXFAILS% (
  echo.>> "%LOG%"
  echo [wrapper] ============================================>> "%LOG%"
  echo [wrapper] DISJUNTOR ABERTO em %DATE% %TIME%>> "%LOG%"
  echo [wrapper] %MAXFAILS% falhas consecutivas. Ultimo rc=!RC!.>> "%LOG%"
  echo [wrapper] Wrapper PARADO de proposito - a causa e permanente.>> "%LOG%"
  echo [wrapper] Corrija e rode: schtasks /run /tn AtelierWorker>> "%LOG%"
  echo [wrapper] ============================================>> "%LOG%"
  > "%ROOT%\worker.STOPPED" echo Disjuntor aberto em %DATE% %TIME% apos %MAXFAILS% falhas consecutivas. Ultimo rc=!RC!. Veja worker.log.
  endlocal
  exit /b 1
)

rem ---------- espera com backoff exponencial ----------
set /a PAUSA=!WAIT! + 1
ping -n !PAUSA! 127.0.0.1 >nul
set /a WAIT=!WAIT! * 2
if !WAIT! GTR 300 set "WAIT=300"
goto loop
