# Restores TI84-AutoContinuation to the fresh-week default interval (PT2H)
# and re-anchors the fire grid to ~now, so the first fresh-week session
# starts shortly after the weekly budget reset.
#
# Registered as the one-shot task TI84-RestoreInterval (self-deletes after
# running). See the schedule notes in CONTINUATION_PROMPT_CODEX.md.
#
# Use schtasks /change only for /enable & /disable — interval changes via
# schtasks /change /ri hang on a run-as password prompt; the PowerShell
# ScheduledTasks API below works at normal integrity with no prompt.

$ErrorActionPreference = 'Stop'

$logFile = Join-Path $PSScriptRoot '..\logs\restore-auto-interval.log'

function Write-Log($message) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $logFile -Value "[$stamp] $message"
}

try {
    $task = Get-ScheduledTask -TaskName 'TI84-AutoContinuation'

    # Re-anchoring StartBoundary matters: the repetition grid runs from it,
    # so a stale anchor can leave a multi-hour gap before the first fire.
    $anchor = (Get-Date).AddMinutes(5).ToString('yyyy-MM-ddTHH:mm:00')
    $task.Triggers[0].Repetition.Interval = 'PT2H'
    $task.Triggers[0].StartBoundary = $anchor

    Set-ScheduledTask -InputObject $task | Out-Null
    Write-Log "Restored TI84-AutoContinuation to PT2H, StartBoundary $anchor"
}
catch {
    Write-Log "FAILED: $_"
    throw
}
finally {
    # One-shot cleanup: remove the trigger task that launched this script.
    try {
        Unregister-ScheduledTask -TaskName 'TI84-RestoreInterval' -Confirm:$false
        Write-Log 'Unregistered one-shot task TI84-RestoreInterval'
    }
    catch {
        Write-Log "Cleanup skipped: $_"
    }
}
