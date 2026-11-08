# User-run hidden console input -> one HTTPS vault write. PowerShell 5.1 / 7+.
# Arguments contain metadata only. Do not dot-source this in a production session.

Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Runtime.Serialization

function Test-VaultTerminal {
    return ($Host.Name -eq 'ConsoleHost' -and
        -not [Console]::IsInputRedirected -and -not [Console]::IsOutputRedirected)
}

function Read-VaultHiddenInput([string] $Prompt) {
    $entered = Read-Host -Prompt $Prompt -AsSecureString
    if ($entered -isnot [Security.SecureString]) { throw 'Hidden input unavailable.' }
    return $entered
}

function Read-VaultConfirmation {
    return (Read-Host -Prompt 'Type yes to continue')
}

function Get-VaultOptions([object[]] $Arguments) {
    $options = @{ Server = 'https://agentplaybooks.ai'; Category = 'general'; Rotate = $false }
    $seen = @{}
    for ($index = 0; $index -lt $Arguments.Count; $index++) {
        $flag = [string] $Arguments[$index]
        if ($flag -eq '-Help') {
            [Console]::WriteLine('Usage: store-vault-secret.ps1 -Playbook GUID -Name IDENTIFIER [-Category password] [-Server https://server] [-Rotate]')
            return $null
        }
        if ($seen.ContainsKey($flag)) { throw 'Duplicate metadata option.' }
        $seen[$flag] = $true
        if ($flag -eq '-Rotate') { $options.Rotate = $true; continue }
        if ($flag -notin @('-Server', '-Playbook', '-Name', '-Category') -or
            $index + 1 -ge $Arguments.Count) { throw 'Invalid metadata option.' }
        $index++
        $options[$flag.Substring(1)] = [string] $Arguments[$index]
    }
    if ($options.Playbook -cnotmatch '^[A-Za-z0-9_-]{1,128}$' -or
        $options.Name -cnotmatch '^[A-Za-z0-9_-]{1,128}$' -or
        $options.Category -cnotin @('api_key', 'password', 'token', 'certificate', 'connection_string', 'general')) {
        throw 'Invalid metadata.'
    }
    $uri = $null
    if (-not [Uri]::TryCreate($options.Server, [UriKind]::Absolute, [ref] $uri) -or
        $uri.Scheme -ne 'https' -or -not $uri.Host -or $uri.UserInfo -or
        $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment -or
        $options.Server -match '\s|\\') { throw 'Invalid HTTPS origin.' }
    $options.Server = $uri.GetLeftPart([UriPartial]::Authority)
    return $options
}

function New-VaultHttpHandler {
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.UseCookies = $false
    # System certificate/hostname verification remains enabled.
    return $handler
}

function Invoke-VaultSecretEntry([object[]] $Arguments) {
    $ErrorActionPreference = 'Stop'
    $request = $null
    $key = $null
    $value = $null
    $repeat = $null
    $payload = $null
    $bytes = $null
    $stream = $null
    $handler = $null
    $client = $null
    $response = $null
    $entered = [Collections.Generic.List[Security.SecureString]]::new()
    $clear = [string[]]::new(3)
    try {
        # Parse manually: binding/validation errors normally repeat bad input.
        $options = Get-VaultOptions $Arguments
        if ($null -eq $options) { return 0 }
        if (-not (Test-VaultTerminal)) {
            [Console]::Error.WriteLine('Run this in your own interactive console, outside the agent session. Use the vault web UI if unavailable.')
            return 1
        }
        $action = if ($options.Rotate) { 'Rotate existing secret' } else { 'Create new secret' }
        [Console]::WriteLine("${action}: $($options.Server) / playbook $($options.Playbook) / $($options.Name)")
        if ((Read-VaultConfirmation) -cne 'yes') {
            [Console]::WriteLine('Cancelled; nothing was sent.')
            return 0
        }
        $entered.Add((Read-VaultHiddenInput 'Playbook API key with secrets:write (hidden)'))
        $entered.Add((Read-VaultHiddenInput 'Secret value (hidden)'))
        $entered.Add((Read-VaultHiddenInput 'Repeat secret value (hidden)'))
        for ($index = 0; $index -lt $entered.Count; $index++) {
            $pointer = [IntPtr]::Zero
            try {
                $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($entered[$index])
                $clear[$index] = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
            } finally {
                if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
            }
        }
        $key = $clear[0]
        $value = $clear[1]
        $repeat = $clear[2]
        if ([string]::IsNullOrEmpty($key) -or $key -match '[^\x21-\x7e]') { throw 'Invalid authentication input.' }
        if ([string]::IsNullOrWhiteSpace($value)) { throw 'Empty input.' }
        if (-not [string]::Equals($value, $repeat, [StringComparison]::Ordinal)) {
            [Console]::Error.WriteLine('Values did not match; nothing was sent.')
            return 1
        }
        $path = "/api/playbooks/$($options.Playbook)/secrets"
        $payload = [Collections.Generic.Dictionary[string, string]]::new()
        $payload.Add('value', $value)
        $method = [Net.Http.HttpMethod]::Post
        if ($options.Rotate) {
            $path += '/' + $options.Name
            $method = [Net.Http.HttpMethod]::Put
        } else {
            # The create API defaults reveal to false; never request enabling it.
            $payload.Add('name', $options.Name)
            $payload.Add('category', $options.Category)
        }
        # No plaintext in cmdlet/function parameters or PowerShell pipeline output.
        $settings = [Runtime.Serialization.Json.DataContractJsonSerializerSettings]::new()
        $settings.UseSimpleDictionaryFormat = $true
        $serializer = [Runtime.Serialization.Json.DataContractJsonSerializer]::new($payload.GetType(), $settings)
        $stream = [IO.MemoryStream]::new()
        $serializer.WriteObject($stream, $payload)
        $bytes = $stream.ToArray()
        $request = [Net.Http.HttpRequestMessage]::new($method, $options.Server + $path)
        $request.Headers.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $key)
        $request.Content = [Net.Http.ByteArrayContent]::new($bytes)
        $request.Content.Headers.ContentType = [Net.Http.Headers.MediaTypeHeaderValue]::new('application/json')
        $request.Content.Headers.ContentType.CharSet = 'utf-8'
        $handler = New-VaultHttpHandler
        $client = [Net.Http.HttpClient]::new($handler)
        $client.Timeout = [TimeSpan]::FromSeconds(30)
        $response = $client.SendAsync($request, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        # Never buffer, parse or print response bodies, even on success.
        $status = [int] $response.StatusCode
        if ($status -in @(200, 201, 204)) {
            [Console]::WriteLine('Vault write succeeded. Secret values were not printed.')
            return 0
        }
        if ($status -ge 300 -and $status -le 399) {
            [Console]::Error.WriteLine('Redirect refused. Check the server address; nothing was resent.')
        } elseif ($status -eq 409) {
            [Console]::Error.WriteLine('The name already exists. Rotate only if replacing it was intended.')
        } elseif ($status -in @(401, 403)) {
            [Console]::Error.WriteLine('Access denied. Check the playbook key and secrets:write permission.')
        } else {
            [Console]::Error.WriteLine('Vault write failed. Check vault metadata before retrying.')
        }
        return 1
    } catch {
        # Never print the error record: it can carry credentials/request details.
        [Console]::Error.WriteLine('Operation failed. Check metadata arguments, hidden console input and vault status before retrying. No diagnostic payload was printed.')
        return 1
    } finally {
        if ($null -ne $response) { $response.Dispose() }
        if ($null -ne $client) { $client.Dispose() }
        if ($null -ne $handler) { $handler.Dispose() }
        if ($null -ne $request) { $request.Dispose() }
        if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
        if ($null -ne $stream) {
            $buffer = $stream.GetBuffer()
            [Array]::Clear($buffer, 0, $buffer.Length)
            $stream.Dispose()
        }
        foreach ($item in $entered) { $item.Dispose() }
        [Array]::Clear($clear, 0, $clear.Length)
        $key = $null; $value = $null; $repeat = $null; $payload = $null
        # Managed strings/JSON cannot be guaranteed erased. Exit this process.
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    exit (Invoke-VaultSecretEntry -Arguments $args)
}
