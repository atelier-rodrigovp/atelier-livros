# Remove a Scheduled Task 'AtelierWorker' (nao mata um worker ja em execucao —
# para isso, ver o runbook no HANDOFF.md). Idempotente.
try {
  Unregister-ScheduledTask -TaskName 'AtelierWorker' -Confirm:$false -ErrorAction Stop
  Write-Host "Task 'AtelierWorker' removida."
} catch {
  Write-Host "Task 'AtelierWorker' nao existe — nada a fazer."
}
