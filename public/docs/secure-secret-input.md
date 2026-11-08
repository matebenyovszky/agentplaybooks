---
title: Secure Secret Input — Keep Credentials Out of Agent Context
---

# Adding secrets without showing them to an agent

When an agent needs a credential stored in a playbook vault, it should prepare
the destination and a local input helper, then let the user enter the value in
their **own terminal**. The agent receives only the secret identifier and the
result. Never ask for the value in chat or pass it as an agent tool argument,
including an argument to `store_secret`, `rotate_secret` or a terminal-input tool.
Tool arguments can be retained in session transcripts even when terminal echo is off.

## Agent instructions

1. Agree on the server, playbook GUID, secret identifier, type and whether this
   is a new secret or an explicitly requested rotation. These are metadata;
   descriptions and names must not contain the credential.
2. Reuse the reviewed [Python input helper](https://github.com/matebenyovszky/agentplaybooks/blob/main/packages/cli/skills/agentplaybooks/scripts/store-vault-secret.py)
   or [PowerShell input helper](https://github.com/matebenyovszky/agentplaybooks/blob/main/packages/cli/skills/agentplaybooks/scripts/store-vault-secret.ps1),
   bundled with the CLI skill under `scripts/`. Choose the runtime available
   in the user's environment. If neither is
   available, prepare an equivalent short program with the safeguards below.
   Let the user review it; the program contains no credentials.
3. Give the user a command containing **metadata only**. They run it themselves
   in a trusted local terminal, outside the agent-controlled or recorded terminal.
   Do not collect the input through chat, `write_stdin`, a shared remote console,
   screenshots or a tool result. If local execution is unavailable, use the
   playbook's **Secrets** web UI instead.
4. Check success with vault metadata or `get_secret_status`; never reveal the
   value to verify it. A connection timeout can leave an uncertain write result;
   check metadata before retrying. Never automatically replace an existing name.
5. For later API calls prefer server-side `use_secret` / `use_secret_write`.
   Do not enable reveal merely to store or verify a credential.

## Hidden terminal input

### Python

The helper requires Python 3.10+ and only uses its standard library. From a
reviewed repository checkout, run this yourself:

```sh
python packages/cli/skills/agentplaybooks/scripts/store-vault-secret.py --playbook PLAYBOOK_GUID --name SERVICE_PASSWORD --category password
```

On Windows, `py -3` can replace `python`. When using an installed skill, use
the actual path to its bundled helper. Self-hosting adds
`--server https://vault.example.com`; this helper accepts an HTTPS origin,
without a URL path prefix. To replace an existing value, explicitly add `--rotate`.
The command line contains no secret value or authentication key.

### PowerShell

If Python is unavailable or unsuitable, use the PowerShell helper. It supports
Windows PowerShell 5.1 and PowerShell 7+, with no extra modules. Run it as a
separate process in your own console:

```powershell
powershell.exe -NoProfile -File packages/cli/skills/agentplaybooks/scripts/store-vault-secret.ps1 -Playbook PLAYBOOK_GUID -Name SERVICE_PASSWORD -Category password
```

For PowerShell 7+, use `pwsh -NoProfile -File` with the same script and arguments.
Self-hosting adds `-Server https://vault.example.com`; replacement requires
`-Rotate`. Use `-Help` for the metadata-only argument list. Script execution must
be allowed by your organisation; do not lower its execution policy to run this.
Use the vault web UI if the policy or console does not allow it.

The helper requires `ConsoleHost` with non-redirected console input/output.
It uses [`Read-Host -AsSecureString`](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/read-host)
and never falls back to visible input. It does not pass plaintext to cmdlets
such as `ConvertTo-Json` or through PowerShell function parameters/pipeline
output. Serialization and HTTP use .NET directly, with automatic redirects
disabled, default certificate verification and a 30-second timeout.
Temporary unmanaged input buffers are zeroed/freed, and mutable JSON buffers
are cleared during cleanup. Managed strings cannot be guaranteed erased.

Run without transcription, command tracing, a debugger or tooling that inspects
runtime values. If managed logging policies capture runtime values or HTTP
bodies, use an approved alternative rather than disabling those policies.
`SecureString` protects the input step; it is not end-to-end encryption or a
guarantee against inspection of the process. Never dot-source the helper into
a long-running working session; exit the separate process after upload.

### Shared behavior

Both helpers display the destination before asking for confirmation, then read
the playbook API key and secret with hidden input. Use a playbook-scoped key
with `secrets:write`, not an account-wide management key. The value is requested
twice to catch typing errors, kept in process memory, and sent directly to the
vault in one HTTPS request. There is no value argument or environment-variable
input, no plaintext temporary file, clipboard step or child command containing
the secret. New entries have reveal disabled; rotation sends only the new value,
preserving the existing access policy and expiry.

Required properties of any replacement helper:

- **Fail closed on visible input.** Python's `getpass` can fall back to echoed
  input; turn `GetPassWarning` into an exception and require an interactive
  terminal. PowerShell must require a suitable console and `Read-Host -AsSecureString`.
  Never replace hidden input with `input()` or plain `Read-Host` for credentials.
- Keep TLS certificate and hostname checks enabled. Reject redirects rather than
  forwarding the authentication header or secret body to another URL.
- Never print values, prefixes, hashes or lengths, request bodies, authentication
  headers, server response bodies or raw exception messages. Disable HTTP debug
  logging, tracing and session recording for this workflow. Output only a fixed
  success/failure message or safe status code.
- Use an explicit create/rotate choice, a finite network timeout and no automatic
  retries. A duplicate name does not authorize replacement.
- Do not write the value to `.env`, shell history, files, memory entries, canvas,
  skill content or configuration. Do not launch a shell with interpolated secrets.

Python documents the echo fallback in its [getpass reference](https://docs.python.org/3/library/getpass.html).
OWASP's [logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#data-to-exclude)
also excludes passwords, access tokens and encryption keys from normal logs.

## Other ways to enter a secret

| Method | When to use it | What to check |
|---|---|---|
| Vault web UI | Browser-only agents or no local runtime | Use the intended server over HTTPS; the user fills it directly |
| Hidden-input helper | A person types/pastes a password or API key | User-owned terminal; echo fallback disabled; sanitized output |
| Password-manager pipe to `apb secrets push` | The value already lives in a trusted password manager | Direct pipe, no `echo`, shell substitution, `tee`, file redirection or recorded terminal |
| Scoped, short-lived service credential | Automated provisioning or CI | Inject through the platform's secret mechanism; avoid passing the value through the model |

For a password-manager pipe, run the installed CLI in your own terminal, specify
the target playbook, and use `--yes` only after reviewing that this command may
rotate an existing secret of the same name:

```sh
pass show deploy/api | apb secrets push DEPLOY_API_KEY --playbook=PLAYBOOK_GUID --yes
```

The value-producing command must emit **only** the intended value. `pass show`
can include extra lines in some entries; do not use this example unchanged for
those entries. Provision the CLI's playbook key separately with `apb secrets login`.
Some CLI errors include server diagnostics; the helpers above deliberately
uses stricter output handling for manual entry.

These methods keep values out of the normal agent transcript and command
history. They do not protect against a compromised terminal, OS, debugger,
keylogger or server configured to log request bodies. Values necessarily exist
briefly in client/server memory; neither runtime can guarantee erasing all copies or
excluding them from swap/crash dumps. Disable request-body capture on the vault
route and use a trusted device. If a credential has already appeared in chat or
logs, rotate/revoke it; deleting a message does not undo exposure.
