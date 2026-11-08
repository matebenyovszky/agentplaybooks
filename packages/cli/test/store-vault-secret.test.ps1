# Offline tests. Fixture values only; no console input or network connections.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../skills/agentplaybooks/scripts/store-vault-secret.ps1"

$handler = New-VaultHttpHandler
if ($handler.AllowAutoRedirect -or $handler.UseCookies) { throw 'Unsafe HTTP defaults.' }
$handler.Dispose()
$terminalCheck = ${function:Test-VaultTerminal}

$fixtureReferences = @('System.Net.Http')
if ($PSVersionTable.PSVersion.Major -ge 6) { $fixtureReferences += 'System.Net.Primitives' }
Add-Type -ReferencedAssemblies $fixtureReferences -TypeDefinition @'
using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
public class VaultFixtureHandler : HttpMessageHandler {
    public static string Body, Auth, Url, Method;
    public static int Code = 201, Calls;
    public static bool Fail;
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) {
        Calls++;
        if (Fail) throw new Exception("fixture-auth-key fixture-sensitive-value");
        Body = request.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        Auth = request.Headers.Authorization.ToString();
        Url = request.RequestUri.ToString();
        Method = request.Method.Method;
        return Task.FromResult(new HttpResponseMessage((HttpStatusCode)Code));
    }
}
'@

function New-VaultHttpHandler { return [VaultFixtureHandler]::new() }
function Test-VaultTerminal { return $script:Interactive }
function Read-VaultConfirmation { return $script:Confirmation }
function Read-Host {
    param([string] $Prompt, [switch] $AsSecureString)
    if (-not $AsSecureString) { throw 'Credential input must use SecureString.' }
    $script:Prompts++
    if ($script:PlainInput) { return 'fixture-sensitive-value' }
    return $script:Inputs.Dequeue()
}

function Assert-VaultTest([bool] $Condition, [string] $Message) {
    if (-not $Condition) { throw $Message }
}

function Invoke-Fixture([object[]] $Extra = @(), [string] $Entry = '  fixture-sensitive-value  ', [string] $Repeat = '  fixture-sensitive-value  ') {
    $script:Inputs = [Collections.Generic.Queue[Security.SecureString]]::new()
    foreach ($value in @('fixture-auth-key', $Entry, $Repeat)) {
        $script:Inputs.Enqueue((ConvertTo-SecureString -String $value -AsPlainText -Force))
    }
    [VaultFixtureHandler]::Calls = 0
    $script:Prompts = 0
    $output = [IO.StringWriter]::new()
    $previousOut = [Console]::Out
    $previousError = [Console]::Error
    try {
        [Console]::SetOut($output)
        [Console]::SetError($output)
        $status = Invoke-VaultSecretEntry -Arguments (@('-Playbook', 'test-guid', '-Name', 'SERVICE_PASSWORD', '-Category', 'password') + $Extra)
        Assert-VaultTest (-not $output.ToString().Contains('fixture-auth-key')) 'Authentication value leaked.'
        Assert-VaultTest (-not $output.ToString().Contains('fixture-sensitive-value')) 'Secret value leaked.'
        return $status
    } finally {
        [Console]::SetOut($previousOut)
        [Console]::SetError($previousError)
        while ($script:Inputs.Count) { $script:Inputs.Dequeue().Dispose() }
        $output.Dispose()
    }
}

$script:Interactive = $true
$script:Confirmation = 'yes'
Assert-VaultTest ((Invoke-Fixture) -eq 0) 'Create failed.'
$body = [VaultFixtureHandler]::Body | ConvertFrom-Json
Assert-VaultTest ($body.value -ceq '  fixture-sensitive-value  ') 'Value was modified.'
Assert-VaultTest ($body.name -eq 'SERVICE_PASSWORD' -and $body.category -eq 'password') 'Metadata missing.'
Assert-VaultTest ($null -eq $body.allow_api_key_reveal) 'Unexpected reveal policy change.'
Assert-VaultTest ([VaultFixtureHandler]::Auth -eq 'Bearer fixture-auth-key') 'Authentication missing.'
Assert-VaultTest ([VaultFixtureHandler]::Method -eq 'POST') 'Create method incorrect.'
Assert-VaultTest ([VaultFixtureHandler]::Url -eq 'https://agentplaybooks.ai/api/playbooks/test-guid/secrets') 'Wrong destination.'
Assert-VaultTest ($script:Prompts -eq 3) 'Hidden input was not used for all values.'

$special = '  fixture-sensitive-value "quoted" \ ' + [char]0xe4 + '  '
Assert-VaultTest ((Invoke-Fixture -Entry $special -Repeat $special) -eq 0) 'Special-character upload failed.'
$body = [VaultFixtureHandler]::Body | ConvertFrom-Json
Assert-VaultTest ($body.value -ceq $special) 'JSON changed special characters.'
$script:PlainInput = $true
Assert-VaultTest ((Invoke-Fixture) -eq 1 -and [VaultFixtureHandler]::Calls -eq 0) 'Visible input fallback was accepted.'
$script:PlainInput = $false

Assert-VaultTest ((Invoke-Fixture -Extra @('-Rotate')) -eq 0) 'Rotation failed.'
$body = [VaultFixtureHandler]::Body | ConvertFrom-Json
Assert-VaultTest (@($body.PSObject.Properties).Count -eq 1) 'Rotation changed metadata.'
Assert-VaultTest ([VaultFixtureHandler]::Method -eq 'PUT' -and [VaultFixtureHandler]::Url.EndsWith('/SERVICE_PASSWORD')) 'Rotation destination incorrect.'

$script:Interactive = $false
Assert-VaultTest ((Invoke-Fixture) -eq 1 -and $script:Prompts -eq 0 -and [VaultFixtureHandler]::Calls -eq 0) 'Noninteractive input was accepted.'
$script:Interactive = $true
$script:Confirmation = 'no'
Assert-VaultTest ((Invoke-Fixture) -eq 0 -and $script:Prompts -eq 0 -and [VaultFixtureHandler]::Calls -eq 0) 'Cancellation did not stop input.'
$script:Confirmation = 'yes'
Assert-VaultTest ((Invoke-Fixture -Repeat 'different') -eq 1 -and [VaultFixtureHandler]::Calls -eq 0) 'Mismatched input was uploaded.'

foreach ($code in @(301, 302, 307, 308, 401, 403, 409, 500)) {
    [VaultFixtureHandler]::Code = $code
    Assert-VaultTest ((Invoke-Fixture) -eq 1 -and [VaultFixtureHandler]::Calls -eq 1) 'HTTP failure was accepted or retried.'
}
[VaultFixtureHandler]::Fail = $true
Assert-VaultTest ((Invoke-Fixture) -eq 1) 'Sensitive exception was accepted.'
[VaultFixtureHandler]::Fail = $false
[VaultFixtureHandler]::Code = 201

foreach ($origin in @('http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?secret=x', 'https://example.com/#fragment')) {
    Assert-VaultTest ((Invoke-Fixture -Extra @('-Server', $origin)) -eq 1 -and $script:Prompts -eq 0) 'Unsafe origin was accepted.'
}
Assert-VaultTest ((Invoke-Fixture -Extra @('-Value', 'fixture-sensitive-value')) -eq 1 -and $script:Prompts -eq 0) 'Value argument was accepted.'
Assert-VaultTest ((Invoke-Fixture -Extra @('-Server', 'https://vault.example.com:8443/')) -eq 0) 'Valid custom origin failed.'

# The real console gate must refuse this redirected test process.
Assert-VaultTest (-not (& $terminalCheck)) 'Real console gate accepted redirected input.'
[Console]::WriteLine('PowerShell vault helper offline checks passed.')
