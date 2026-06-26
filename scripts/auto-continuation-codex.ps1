# TI-84 auto-continuation supervisor - Codex edition.
#
# Fired by the TI84-AutoContinuation scheduled task. One fire = one Codex tick:
#   1. Reap stale lock / skip if a live tick is running.
#   2. Back up CONTINUATION_PROMPT_CODEX.md (sole inter-session state).
#   3. Pipe the tick prompt into `codex exec` (hard timeout, tree-kill).
#   4. Run the golden regression DETERMINISTICALLY here in the wrapper.
#   5. Commit + push ONLY on golden PASS; revert tracked changes on FAIL.
#
# The wrapper owns verification and git because Codex's dominant failure mode
# is exit-0-but-broken output (sessions 604-614 evidence). The model is never
# trusted to grade its own work.
#
# Smoke test:  powershell -File scripts\auto-continuation-codex.ps1 `
#                -PromptFile .auto-continuation-codex-smoketest.md -SkipGit

param(
    [string]$PromptFile = '',
    [switch]$SkipGit,
    [int]$TimeoutMinutes = 40,
    # Per-invocation override; global config.toml stays at "low" so the
    # OLD_APP 15-min loop keeps its cheap-tick economics. Research ticks
    # here get gpt-5.5 at xhigh (quota is otherwise underused).
    [string]$ReasoningEffort = 'xhigh'
)

$ErrorActionPreference = 'Continue'

$ProjectDir = 'C:\Users\rober\Downloads\Projects\school\ti84-transpile'
if ($PromptFile -eq '') { $PromptFile = Join-Path $ProjectDir '.auto-continuation-codex-prompt.md' }
if (-not (Test-Path $PromptFile)) { Write-Output "FATAL: prompt file missing: $PromptFile"; exit 2 }

$LogDir        = Join-Path $ProjectDir 'logs'
$BackupDir     = Join-Path $LogDir 'handoff-backups'
$LockFile      = Join-Path $ProjectDir '.ti84_codex_loop.lock'
$HandoffFile   = Join-Path $ProjectDir 'CONTINUATION_PROMPT_CODEX.md'
$Stamp         = Get-Date -Format 'yyyyMMdd-HHmm'
$LogFile       = Join-Path $LogDir "auto-codex-session-$Stamp.log"
$LastMsgFile   = Join-Path $LogDir "auto-codex-lastmsg-$Stamp.txt"
$SupervisorLog = Join-Path $LogDir 'codex-supervisor.log'

foreach ($dir in @($LogDir, $BackupDir)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
}

function Write-Log($message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $message"
    Add-Content -Path $SupervisorLog -Value $line
    Write-Output $line
}

# --- 1. Lock: skip live ticks, reap stale ones (dead pid or over-age) -------
if (Test-Path $LockFile) {
    $stale = $false
    $lockPid = 0
    try {
        $lock = Get-Content $LockFile -Raw | ConvertFrom-Json
        $lockPid = [int]$lock.pid
        $ageMin = ((Get-Date) - [datetime]$lock.created).TotalMinutes
        $alive = $null -ne (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)
        if (-not $alive) {
            $stale = $true
            Write-Log "reaping stale lock: pid $lockPid is dead (age $([math]::Round($ageMin)) min)"
        }
        elseif ($ageMin -gt ($TimeoutMinutes + 20)) {
            $stale = $true
            Write-Log "reaping hung tick: pid $lockPid alive but lock is $([math]::Round($ageMin)) min old - killing tree"
            & taskkill /PID $lockPid /T /F 2>$null
        }
    }
    catch {
        $stale = $true
        Write-Log "reaping unparseable lock: $_"
    }
    if (-not $stale) {
        Write-Log "skip: live tick in progress (pid $lockPid)"
        exit 0
    }
    Remove-Item $LockFile -Force
}

$lockJson = @{ pid = $PID; created = (Get-Date -Format 'o'); worker = 'codex-supervisor' } | ConvertTo-Json -Compress
Set-Content -Path $LockFile -Value $lockJson -Encoding ASCII
Write-Log "tick start: prompt=$(Split-Path $PromptFile -Leaf) timeout=${TimeoutMinutes}m skipGit=$SkipGit"

try {
    # --- 2. Back up the handoff file (keep last 20) -------------------------
    Copy-Item $HandoffFile (Join-Path $BackupDir "CONTINUATION_$Stamp.md") -Force
    Get-ChildItem $BackupDir -Filter 'CONTINUATION_*.md' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip 20 |
        Remove-Item -Force -ErrorAction SilentlyContinue

    # --- 3. Run Codex with a hard timeout ------------------------------------
    # --dangerously-bypass-approvals-and-sandbox, NOT --full-auto: the sandboxed
    # mode hits "Windows sandbox spawn error" on this machine (sessions 613-614);
    # the bypass flag is the mode the OLD_APP loop runs successfully.
    $codexCmd = (Get-Command codex.cmd -ErrorAction Stop).Source
    $q = '"'
    $cmdLine = $q + $codexCmd + $q + ' exec --cd ' + $q + $ProjectDir + $q +
        ' --dangerously-bypass-approvals-and-sandbox --color never' +
        ' -c model_reasoning_effort=' + $q + $ReasoningEffort + $q +
        ' --output-last-message ' + $q + $LastMsgFile + $q +
        ' - < ' + $q + $PromptFile + $q + ' > ' + $q + $LogFile + $q + ' 2>&1'
    $runnerCmd = Join-Path $env:TEMP "ti84-codex-run-$Stamp.cmd"
    Set-Content -Path $runnerCmd -Value ("@echo off`r`n" + $cmdLine) -Encoding ASCII

    $proc = Start-Process -FilePath $env:ComSpec -ArgumentList '/d', '/c', ($q + $runnerCmd + $q) -PassThru -WindowStyle Hidden
    $finished = $proc.WaitForExit($TimeoutMinutes * 60 * 1000)
    if ($finished) {
        $proc.WaitForExit()   # flush ExitCode
        $codexExit = $proc.ExitCode
        Write-Log "codex finished: exit=$codexExit log=$(Split-Path $LogFile -Leaf)"
    }
    else {
        & taskkill /PID $proc.Id /T /F 2>$null
        $codexExit = 124
        Write-Log "codex TIMEOUT after $TimeoutMinutes min - process tree killed"
    }
    Remove-Item $runnerCmd -Force -ErrorAction SilentlyContinue

    # --- 4. Golden regression gate (wrapper-owned, never model-owned) --------
    $goldenLog = Join-Path $env:TEMP "ti84-golden-$Stamp.log"
    $goldenCmd = 'node scripts\run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase99d-home-verify.mjs > "' + $goldenLog + '" 2>&1'
    $gproc = Start-Process -FilePath $env:ComSpec `
        -ArgumentList '/d', '/c', $goldenCmd `
        -WorkingDirectory $ProjectDir -PassThru -WindowStyle Hidden
    $gFinished = $gproc.WaitForExit(300000)
    if ($gFinished) { $gproc.WaitForExit() } else { & taskkill /PID $gproc.Id /T /F 2>$null }
    $goldenPass = ($gFinished -and $gproc.ExitCode -eq 0)
    $goldenTail = (Get-Content $goldenLog -Tail 3 -ErrorAction SilentlyContinue) -join ' | '
    Write-Log "golden regression: pass=$goldenPass ($goldenTail)"
    Remove-Item $goldenLog -Force -ErrorAction SilentlyContinue

    # --- 4b. Browser-shell gate: the golden probe does NOT exercise
    # browser-shell.html, so if a tick edited the live demo, run its own
    # regression and fold the result into the commit gate.
    $browserPass = $true
    Set-Location $ProjectDir
    $shellChanged = & git status --porcelain -- TI-84_Plus_CE/browser-shell.html
    if ($shellChanged) {
        $browserLog = Join-Path $env:TEMP "ti84-browser-$Stamp.log"
        $browserCmd = 'node scripts\run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-browser-shell-replay-verify.mjs > "' + $browserLog + '" 2>&1'
        $bproc = Start-Process -FilePath $env:ComSpec `
            -ArgumentList '/d', '/c', $browserCmd `
            -WorkingDirectory $ProjectDir -PassThru -WindowStyle Hidden
        $bFinished = $bproc.WaitForExit(300000)
        if ($bFinished) { $bproc.WaitForExit() } else { & taskkill /PID $bproc.Id /T /F 2>$null }
        $browserPass = ($bFinished -and $bproc.ExitCode -eq 0)
        $browserTail = (Get-Content $browserLog -Tail 2 -ErrorAction SilentlyContinue) -join ' | '
        Write-Log "browser-shell regression: pass=$browserPass (shell edited this tick) ($browserTail)"
        Remove-Item $browserLog -Force -ErrorAction SilentlyContinue
    }

    # --- 5. Git: commit on PASS, revert on FAIL ------------------------------
    if ($SkipGit) {
        Write-Log 'skipGit: leaving worktree untouched, no commit/revert'
    }
    elseif ($goldenPass -and $browserPass) {
        Set-Location $ProjectDir
        & git add -A 2>$null
        $staged = & git diff --cached --name-only
        if ($staged) {
            $msgFile = Join-Path $env:TEMP "ti84-codex-msg-$Stamp.txt"
            $summary = ''
            if (Test-Path $LastMsgFile) {
                $summary = ((Get-Content $LastMsgFile -Raw) -replace '\r?\n', ' ').Trim()
                if ($summary.Length -gt 400) { $summary = $summary.Substring(0, 400) + '...' }
            }
            $msg = "feat: codex auto-session $Stamp (golden regression PASS)`n`n$summary`n`nCommitted by auto-continuation-codex.ps1 (wrapper-verified 26/26 gate)."
            # WriteAllText = UTF-8 without BOM; Set-Content -Encoding UTF8 writes a
            # BOM that git keeps in the commit subject (mojibake on GitHub).
            [System.IO.File]::WriteAllText($msgFile, $msg)
            & git commit -F $msgFile 2>&1 | ForEach-Object { Write-Log "git: $_" }
            Remove-Item $msgFile -Force -ErrorAction SilentlyContinue
            & git push origin master 2>&1 | ForEach-Object { Write-Log "git push: $_" }

            # Refresh the GitNexus code-intelligence index in the background.
            # Non-blocking + lock-guarded (see scripts/gitnexus-refresh.mjs); a
            # no-op on most ticks since the churn is excluded probes/reports.
            try {
                & node (Join-Path $ProjectDir 'scripts\gitnexus-refresh.mjs') --now 2>&1 |
                    ForEach-Object { Write-Log "gitnexus: $_" }
                Write-Log 'gitnexus: background index refresh requested'
            }
            catch { Write-Log "gitnexus: refresh launch failed: $_" }
        }
        else {
            Write-Log 'git: no changes to commit'
        }
    }
    else {
        Write-Log "REGRESSION GATE FAILED (golden=$goldenPass browser=$browserPass) - reverting tracked changes, NO commit"
        Set-Location $ProjectDir
        & git checkout -- . 2>&1 | ForEach-Object { Write-Log "git revert: $_" }
    }
}
finally {
    Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
    # Rotate per-tick logs: keep the most recent 150 of each kind.
    foreach ($pattern in @('auto-codex-session-*.log', 'auto-codex-lastmsg-*.txt')) {
        Get-ChildItem $LogDir -Filter $pattern |
            Sort-Object LastWriteTime -Descending |
            Select-Object -Skip 150 |
            Remove-Item -Force -ErrorAction SilentlyContinue
    }
    Write-Log 'tick end'
}
