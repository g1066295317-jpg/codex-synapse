param([switch]$Demo,[switch]$ReadOnly,[switch]$Foreground)
$ErrorActionPreference = 'Stop'
$packageRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:ProgramFiles 'nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw '请先安装 Node.js 22 或更高版本。' }
if ([version](& $nodePath -p 'process.versions.node') -lt [version]'22.0.0') { throw '此版本需要 Node.js 22 或更高版本。' }
$installedPackage = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
if (-not $installedPackage) { throw '未找到本机 Codex 桌面客户端。' }
$appExe = Join-Path $installedPackage.InstallLocation 'app\ChatGPT.exe'
if (-not (Test-Path -LiteralPath $appExe)) { throw '当前客户端结构与本版启动器不兼容。' }
$cliCommand = Get-Command codex.exe -ErrorAction SilentlyContinue
$cliPath = if ($cliCommand) { $cliCommand.Source } else { $null }
if (-not $cliPath) {
    $cliRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
    if (Test-Path -LiteralPath $cliRoot) { $cliPath = Get-ChildItem -LiteralPath $cliRoot -Filter codex.exe -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName }
}
if (-not $Demo -and -not $cliPath) { throw '未找到 Codex 会话服务。请先正常启动一次 Codex。' }
$runtimePath = Join-Path $packageRoot ('data\' + $(if ($Demo) {'demo'} else {'local'}))
New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
$configPath = Join-Path $runtimePath 'launch.json'
$codexStatePath = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex' }
@{ executable=$appExe; codexBin=$cliPath; codexHome=$codexStatePath; profile=(Join-Path $runtimePath 'client-profile'); dataDirectory=(Join-Path $runtimePath 'canvas'); demo=[bool]$Demo; readOnly=[bool]$ReadOnly; clientPackageVersion=$installedPackage.Version.ToString() } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8
$controllerPath = Join-Path $packageRoot 'dist\controller.mjs'
if (-not (Test-Path -LiteralPath $controllerPath)) { throw '未找到已构建的运行文件，请先执行 npm run build:native。' }
if ($Foreground) { & $nodePath $controllerPath $configPath; exit $LASTEXITCODE }
# Only this helper is hidden; Codex itself opens as a normal interactive window.
$arguments = '"' + $controllerPath + '" "' + $configPath + '"'
Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $packageRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimePath 'controller.stdout.log') -RedirectStandardError (Join-Path $runtimePath 'controller.stderr.log') | Out-Null
