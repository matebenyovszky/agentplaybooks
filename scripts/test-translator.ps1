# AgentPlaybooks Translator Playbook Test Script
# 
# Usage:
#   .\scripts\test-translator.ps1
#   .\scripts\test-translator.ps1 -BaseUrl "https://your-domain.com"
#
# This script tests:
# 1. Playbook exists and is accessible
# 2. All API formats work (JSON, Markdown, MCP)
# 3. Memory read works
# 4. Memory write works (with API key)
# 5. Skills are defined correctly

param(
    [string]$BaseUrl = "http://localhost:3001",
    [string]$PlaybookGuid = "translator",
    [string]$ApiKey = "apb_live_test1234567890abcdef1234567890abcdef"
)

Write-Host "`n🔧 AgentPlaybooks Translator Playbook Test" -ForegroundColor Cyan
Write-Host "=" * 50
Write-Host "Base URL: $BaseUrl"
Write-Host "Playbook: $PlaybookGuid"
Write-Host ""

$passed = 0
$failed = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [string]$Body = $null,
        [scriptblock]$Validation = $null
    )
    
    Write-Host -NoNewline "Testing $Name... "
    
    try {
        $params = @{
            Uri = $Url
            Method = $Method
            Headers = $Headers
            UseBasicParsing = $true
        }
        
        if ($Body) {
            $params.Body = $Body
            $params.ContentType = "application/json"
        }
        
        $response = Invoke-WebRequest @params -ErrorAction Stop
        $content = $response.Content
        
        if ($Validation) {
            $result = & $Validation $content
            if (-not $result) {
                throw "Validation failed"
            }
        }
        
        Write-Host "PASS" -ForegroundColor Green
        $script:passed++
        return $content
    }
    catch {
        Write-Host "FAIL - $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
        return $null
    }
}

# Test 1: JSON format
$json = Test-Endpoint -Name "JSON Format" -Url "$BaseUrl/api/playbooks/$PlaybookGuid" -Validation {
    param($content)
    $data = $content | ConvertFrom-Json
    return $data.guid -eq $PlaybookGuid -and $data.name -eq "Universal Translator"
}

# Test 2: Markdown format
Test-Endpoint -Name "Markdown Format" -Url "$BaseUrl/api/playbooks/$PlaybookGuid`?format=markdown" -Validation {
    param($content)
    return $content -match "# Universal Translator" -and $content -match "Translation Output Format"
}

# Test 3: Skills exist
$skillCount = 0
if ($json) {
    $data = $json | ConvertFrom-Json
    $skillCount = $data.skills.Count
    if ($skillCount -eq 3) {
        Write-Host "Testing Skills Count... " -NoNewline
        Write-Host "PASS (3 skills found)" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "Testing Skills Count... " -NoNewline
        Write-Host "FAIL (Expected 3, got $skillCount)" -ForegroundColor Red
        $failed++
    }
}

# Test 4: Specific skills exist
$expectedSkills = @("translate_text", "learn_translation_preference", "explain_translation")
foreach ($skill in $expectedSkills) {
    $found = $data.skills | Where-Object { $_.name -eq $skill }
    if ($found) {
        Write-Host "Testing Skill '$skill'... " -NoNewline
        Write-Host "PASS" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "Testing Skill '$skill'... " -NoNewline
        Write-Host "FAIL (not found)" -ForegroundColor Red
        $failed++
    }
}

# Test 5: Memory read
Test-Endpoint -Name "Memory Read" -Url "$BaseUrl/api/playbooks/$PlaybookGuid/memory" -Validation {
    param($content)
    $memories = $content | ConvertFrom-Json
    return $memories.Count -ge 4
}

# Test 6: Memory search by tags
Test-Endpoint -Name "Memory Search (tags)" -Url "$BaseUrl/api/playbooks/$PlaybookGuid/memory?tags=preferences" -Validation {
    param($content)
    $memories = $content | ConvertFrom-Json
    return $memories.Count -ge 2
}

# Test 7: Memory write (requires API key)
$testValue = @{
    value = @{
        test_field = "test_value_$(Get-Date -Format 'HHmmss')"
        timestamp = (Get-Date).ToString("o")
    }
    description = "Test entry created by test script"
    tags = @("test", "automated")
} | ConvertTo-Json -Depth 3

$headers = @{
    "Authorization" = "Bearer $ApiKey"
}

Test-Endpoint -Name "Memory Write" -Url "$BaseUrl/api/playbooks/$PlaybookGuid/memory/test_entry" -Method "PUT" -Headers $headers -Body $testValue -Validation {
    param($content)
    $data = $content | ConvertFrom-Json
    return $data.key -eq "test_entry"
}

# Test 8: Verify written memory
Test-Endpoint -Name "Memory Write Verification" -Url "$BaseUrl/api/playbooks/$PlaybookGuid/memory?key=test_entry" -Validation {
    param($content)
    $data = $content | ConvertFrom-Json
    return $data.key -eq "test_entry" -and $data.tags -contains "test"
}

# Test 9: Delete test memory
Test-Endpoint -Name "Memory Delete" -Url "$BaseUrl/api/playbooks/$PlaybookGuid/memory/test_entry" -Method "DELETE" -Headers $headers -Validation {
    param($content)
    $data = $content | ConvertFrom-Json
    return $data.success -eq $true
}

# Test 10: Persona exists
if ($json) {
    $data = $json | ConvertFrom-Json
    if ($data.persona_system_prompt -match "professional translator") {
        Write-Host "Testing Persona Content... " -NoNewline
        Write-Host "PASS" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "Testing Persona Content... " -NoNewline
        Write-Host "FAIL" -ForegroundColor Red
        $failed++
    }
}

# Summary
Write-Host "`n" + ("=" * 50)
Write-Host "Test Results:" -ForegroundColor Cyan
Write-Host "  Passed: $passed" -ForegroundColor Green
Write-Host "  Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Gray" })

if ($failed -eq 0) {
    Write-Host "`n✅ All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n❌ Some tests failed." -ForegroundColor Red
    exit 1
}


