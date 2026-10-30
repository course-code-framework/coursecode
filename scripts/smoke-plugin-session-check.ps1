# Runs the plugin's SessionStart check the way Claude Code does on Windows:
# through Git Bash, or through PowerShell when Git Bash isn't installed.
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\plugin')).Path -replace '\\', '/'
$hooks = Get-Content "$root/hooks/hooks.json" -Raw | ConvertFrom-Json
$hook = $hooks.hooks.SessionStart[0].hooks[0].command.Replace('${CLAUDE_PLUGIN_ROOT}', $root)

$shells = @(
    @{ Name = 'Git Bash'; Path = (Join-Path $env:ProgramFiles 'Git\bin\bash.exe'); Arguments = @('-c', $hook); FakeNode = 'node'; FakeBody = "#!/bin/sh`necho v22.14.9`n" },
    @{ Name = 'Windows PowerShell'; Path = (Get-Command powershell.exe).Source; Arguments = @('-NoProfile', '-Command', $hook); FakeNode = 'node.cmd'; FakeBody = "@echo v22.14.9`r`n" },
    @{ Name = 'PowerShell 7'; Path = (Get-Command pwsh.exe).Source; Arguments = @('-NoProfile', '-Command', $hook); FakeNode = 'node.cmd'; FakeBody = "@echo v22.14.9`r`n" }
)

$systemPath = Join-Path $env:SystemRoot 'System32'
$originalPath = $env:PATH
$failures = 0

function Assert-Hook($shell, $label, $path, $expected) {
    $env:PATH = $path
    try {
        $arguments = $shell.Arguments
        $output = (& $shell.Path @arguments 2>&1 | Out-String).Trim()
        $exitCode = $LASTEXITCODE
    } finally {
        $env:PATH = $originalPath
    }

    $passed = $exitCode -eq 0 -and $(if ($expected) { $output.Contains($expected) -and $output.Contains('coursecode:setup skill') } else { $output -eq '' })
    Write-Host "$(if ($passed) { 'PASS' } else { 'FAIL' }) $($shell.Name), ${label}: exit $exitCode, output: $output"
    if (-not $passed) { $script:failures++ }
}

foreach ($shell in $shells) {
    $fakeDir = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
    New-Item -ItemType Directory -Path $fakeDir | Out-Null
    [IO.File]::WriteAllText((Join-Path $fakeDir $shell.FakeNode), $shell.FakeBody)

    Assert-Hook $shell 'supported Node.js' $originalPath $null
    Assert-Hook $shell 'old Node.js' "$fakeDir;$systemPath" 'this computer has Node.js 22.14.'
    Assert-Hook $shell 'missing Node.js' $systemPath 'this computer has no Node.js.'

    Remove-Item -Recurse -Force $fakeDir
}

if ($failures -gt 0) {
    throw "$failures session check case(s) failed."
}
