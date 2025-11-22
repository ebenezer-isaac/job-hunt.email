# PowerShell script to remediate Cloud Run logging issues
# Based on the forensic analysis of telemetry cessation

$ErrorActionPreference = "Stop"

function Get-GcloudProject {
    $project = gcloud config get-value project 2>$null
    if (-not $project) {
        Write-Host "❌ No default project set in gcloud." -ForegroundColor Red
        $project = Read-Host "Please enter your Google Cloud Project ID"
    }
    return $project
}

function Remediate-ServiceAgent {
    param ($ProjectId)
    Write-Host "`n🔍 Checking Cloud Run Service Agent permissions..." -ForegroundColor Cyan

    # Get the project number
    $projectNumber = gcloud projects describe $ProjectId --format='value(projectNumber)'
    if (-not $projectNumber) {
        Write-Error "Could not retrieve project number."
    }

    $serviceAgentEmail = "service-$projectNumber@serverless-robot-prod.iam.gserviceaccount.com"
    Write-Host "   Target Identity: $serviceAgentEmail"

    # We blindly add the binding because checking it reliably requires parsing complex JSON and handling inheritance.
    # Adding it is idempotent.
    Write-Host "   🛠  Restoring roles/run.serviceAgent..." -ForegroundColor Yellow
    
    try {
        gcloud projects add-iam-policy-binding $ProjectId `
            --member="serviceAccount:$serviceAgentEmail" `
            --role="roles/run.serviceAgent" `
            --condition=None `
            --quiet
        Write-Host "   ✅ Service Agent permissions restored." -ForegroundColor Green
    }
    catch {
        Write-Host "   ❌ Failed to update IAM policy. Ensure you have 'resourcemanager.projects.setIamPolicy' permission." -ForegroundColor Red
        Write-Host $_
    }
}

function Check-LogSink {
    param ($ProjectId)
    Write-Host "`n🔍 Checking _Default Log Sink..." -ForegroundColor Cyan
    
    try {
        $sink = gcloud logging sinks describe _Default --project=$ProjectId --format="json" | ConvertFrom-Json
        if ($sink.disabled) {
            Write-Host "   ⚠️  The _Default sink is DISABLED." -ForegroundColor Red
        } else {
            Write-Host "   ✅ The _Default sink is ENABLED." -ForegroundColor Green
        }
        
        if ($sink.exclusions) {
            Write-Host "   ⚠️  Exclusions found on _Default sink:" -ForegroundColor Yellow
            foreach ($ex in $sink.exclusions) {
                Write-Host "      - $($ex.name): $($ex.filter)"
            }
        } else {
            Write-Host "   ✅ No exclusions on _Default sink." -ForegroundColor Green
        }
    }
    catch {
        Write-Host "   ❌ Failed to describe log sink." -ForegroundColor Red
        Write-Host $_
    }
}

function Main {
    Write-Host "🚑 Cloud Run Logging Remediation Tool" -ForegroundColor Magenta
    $projectId = Get-GcloudProject
    Write-Host "Target Project: $projectId"

    Remediate-ServiceAgent -ProjectId $projectId
    Check-LogSink -ProjectId $projectId

    Write-Host "`n✅ Remediation steps completed." -ForegroundColor Green
    Write-Host "If logs are still missing, please check VPC Service Controls (VPC-SC) in the Google Cloud Console."
    Write-Host "Audit Logs Query: protoPayload.status.details.violations.type=`"VPC_SERVICE_CONTROLS`""
}

Main
