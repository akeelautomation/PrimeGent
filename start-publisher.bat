@echo off
cd /d "%~dp0"

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = '%CD%';" ^
  "$envFile = Join-Path $root '.env.local';" ^
  "if (Test-Path $envFile) {" ^
  "  Get-Content $envFile | ForEach-Object {" ^
  "    if ($_ -match '^\s*(#|$)') { return };" ^
  "    $parts = $_.Split('=', 2);" ^
  "    if ($parts.Length -eq 2) { [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1], 'Process') }" ^
  "  }" ^
  "};" ^
  "$conn = Get-NetTCPConnection -LocalPort 8791 -ErrorAction SilentlyContinue | Select-Object -First 1;" ^
  "if (-not $conn) { Start-Process -WindowStyle Hidden -FilePath node -ArgumentList 'tools/publisher-sync-server.mjs' -WorkingDirectory $root };" ^
  "& npx.cmd -y wrangler pages dev . --port 8788"
