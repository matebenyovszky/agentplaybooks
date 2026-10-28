# AgentPlaybooks Doctor Action

Use a reviewed commit SHA of this repository in `uses` (the action path is
`matebenyovszky/agentplaybooks/actions/doctor`). Check out the project first,
then provide `path` (default `.`) and `strict` (default `true`). The action
installs its own locked CLI dependencies and runs a local read-only audit;
no account or API key is needed.

Outputs: `score`, `report` (JSON path), `badge` (Shields endpoint JSON path).
A compact GitHub job summary is always written, including when strict mode
fails with exit code 2 on high or critical findings. Use an artifact upload
step with `if: always()` if you want to keep the JSON report and badge.

The action doesn't post comments or need `pull-requests: write`. Dependency
installation uses the network; the audit itself does not. A public health
badge requires publishing the generated badge JSON to a public static URL;
this action does not publish private project data automatically.
