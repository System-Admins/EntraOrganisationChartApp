#!/usr/bin/env pwsh
# Usage: scripts/setup-azure.ps1 [-Name orgchart] [-Location westeurope] [-ResourceGroup rg-<name>] [-LocalDev]
#Requires -Version 7.2
[CmdletBinding()]
param(
  [string] $Name = 'orgchart',
  [string] $Location = 'westeurope',
  [string] $ResourceGroup = "rg-$Name",
  [switch] $LocalDev
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$GraphApi = '00000003-0000-0000-c000-000000000000'
$UserReadAllDelegated = 'a154be20-db9c-4678-8ab7-66f6cc099a59'
$PresenceReadAllDelegated = '9c7a330d-35b3-4aa1-963d-cb2b9f927841'
$CalendarsReadBasicDelegated = '662d75ba-a364-42ad-adee-f5f880ea4878'

# A failing native command doesn't stop the script, so each az call checks its exit code.
function Invoke-Az {
  $output = & az @args
  if ($LASTEXITCODE -ne 0) { throw "az $($args[0..1] -join ' ') failed with exit code $LASTEXITCODE." }
  $output
}

Write-Host "Creating resource group $ResourceGroup and Static Web App $Name in $Location..."
Invoke-Az group create --name $ResourceGroup --location $Location --output none
$siteHost = Invoke-Az staticwebapp create --name $Name --resource-group $ResourceGroup --location $Location `
  --sku Free --query defaultHostname --output tsv

Write-Host "Creating app registration $Name..."
$clientId = Invoke-Az ad app create --display-name $Name --sign-in-audience AzureADMyOrg --query appId --output tsv
$objectId = Invoke-Az ad app show --id $clientId --query id --output tsv
$tenantId = Invoke-Az account show --query tenantId --output tsv

# localhost only on request: a server on a user's port 5173 could otherwise receive that user's tokens.
$redirectUris = @("https://$siteHost/redirect.html", "brk-multihub://$siteHost")
if ($LocalDev) { $redirectUris += 'http://localhost:5173/redirect.html' }

# The Azure CLI has no switch for the SPA platform, so it is set through Microsoft Graph, from a file as az.cmd mangles quotes.
$body = New-TemporaryFile
try {
  @{ spa = @{ redirectUris = $redirectUris } } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $body.FullName
  Invoke-Az rest --method PATCH `
    --uri "https://graph.microsoft.com/v1.0/applications/$objectId" `
    --headers 'Content-Type=application/json' `
    --body "@$($body.FullName)"
} finally {
  Remove-Item -LiteralPath $body.FullName
}

Invoke-Az ad sp create --id $clientId --output none
az ad app permission add --id $clientId --api $GraphApi `
  --api-permissions "$UserReadAllDelegated=Scope" "$PresenceReadAllDelegated=Scope" "$CalendarsReadBasicDelegated=Scope" `
  --output none 2>$null
if ($LASTEXITCODE -ne 0) { throw "az ad app permission add failed with exit code $LASTEXITCODE." }

Write-Host 'Granting admin consent (retrying while the new service principal propagates)...'
foreach ($attempt in 1..6) {
  az ad app permission admin-consent --id $clientId 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { break }
  if ($attempt -eq 6) {
    Write-Warning "Admin consent failed. Grant it in Entra ID > App registrations > $Name > API permissions."
  } else {
    Start-Sleep -Seconds 10
  }
}

Write-Host @"

Done. Put these values in public/config.json:

  "dataSource": "graph",
  "auth": { "tenantId": "$tenantId", "clientId": "$clientId" },

Then deploy. The token is fetched when you deploy, so it never lands in this output or a log:

  `$env:SWA_CLI_DEPLOYMENT_TOKEN = az staticwebapp secrets list --name '$Name' --resource-group '$ResourceGroup' --query properties.apiKey --output tsv
  npm run deploy

The chart will be at https://$siteHost/
Teams package:  npm run package:teams -- --host $siteHost
"@
