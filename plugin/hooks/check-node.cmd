: << 'BATCH'
@echo off
rem SessionStart check. It can't use Node.js, because Node.js is what it checks.
rem This one file is a batch file and a shell script. The hook runs it with
rem ". <file>": sh and Git Bash source it and skip this block as a heredoc, and
rem PowerShell runs it through cmd.exe, so execution policy doesn't apply.
rem Keep it LF-only (.gitattributes) and free of batch labels.
rem Minimum version: keep both halves in step with the launcher in
rem mcp/coursecode-mcp.mjs (tests/lib/plugin-manifests.test.js checks this).
setlocal
set "MAJOR=0"
set "MINOR=0"
set "FOUND=no Node.js"
for /f "tokens=1,2 delims=v." %%a in ('node --version 2^>nul') do (
    set "MAJOR=%%a"
    set "MINOR=%%b"
    set "FOUND=Node.js %%a.%%b"
)
if %MAJOR% GTR 22 exit /b 0
if %MAJOR% EQU 22 if %MINOR% GEQ 15 exit /b 0
echo CourseCode: the tools can't start because they need Node.js 22.15 or later and this computer has %FOUND%. Use the coursecode:setup skill before any CourseCode work; it asks before installing anything.
exit /b 0
BATCH

version=$(node --version 2>/dev/null) || version=
version=${version#v}
major=${version%%.*}
minor=${version#*.}
minor=${minor%%.*}
case "$major$minor" in
    '' | *[!0-9]*) major=0 minor=0 found='no Node.js' ;;
    *) found="Node.js $major.$minor" ;;
esac
if [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 15 ]; }; then exit 0; fi
echo "CourseCode: the tools can't start because they need Node.js 22.15 or later and this computer has $found. Use the coursecode:setup skill before any CourseCode work; it asks before installing anything."
exit 0
