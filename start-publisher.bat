@echo off
cd /d "%~dp0"

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$conn = Get-NetTCPConnection -LocalPort 8791 -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $conn) { Start-Process -WindowStyle Hidden -FilePath node -ArgumentList 'tools/publisher-sync-server.mjs' -WorkingDirectory '%CD%' }"
npx.cmd -y wrangler pages dev . --port 8788
