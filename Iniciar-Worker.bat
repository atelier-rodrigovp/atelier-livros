@echo off
chcp 65001 >nul
title Atelier — Worker
cd /d "%~dp0worker"

if not exist node_modules (
  echo Instalando dependencias ^(so na primeira vez^)...
  call npm install
  echo.
)

echo ============================================================
echo   WORKER DO ATELIER LIGADO
echo   Deixe esta janela aberta enquanto estiver produzindo.
echo   Para DESLIGAR o worker: feche esta janela.
echo ============================================================
echo.

call npm run dev

echo.
echo O worker parou. Pressione uma tecla para fechar.
pause >nul
