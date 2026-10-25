$ErrorActionPreference = 'Stop'
$packageRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path -LiteralPath $compiler)) { throw '需要 Windows .NET Framework 4.x C# 编译器。' }
$source = Join-Path $packageRoot 'CodexSynapseLauncher.cs'
$output = Join-Path $packageRoot 'CodexSynapseLauncher.exe'
& $compiler /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll /reference:System.Runtime.Serialization.dll "/out:$output" $source
if ($LASTEXITCODE -ne 0) { throw '启动器编译失败。' }
Write-Host "已构建：$output"

