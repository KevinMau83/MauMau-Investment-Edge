# MauMau Properties Investment Edge

Private, single-owner real estate acquisition and underwriting workspace. The initial database is empty. The UI accepts manual evidence and labeled illustrative records.

## Run locally

Requires Python 3.11 or later. There are no third-party runtime dependencies.

```bash
read -rs -p 'Owner password (at least 16 characters): ' EDGE_PASSWORD
export EDGE_PASSWORD
python app.py
```

Open http://127.0.0.1:8000 and sign in as `owner`. Use the same hostname in the browser and in `EDGE_ORIGIN`. The default database is `runtime/edge.sqlite`. Optional variables are `EDGE_DB`, `EDGE_PORT`, and `EDGE_ORIGIN`. Stop the server with Ctrl+C and unset the password in the parent shell when finished.

Use **Underwriting** for a calculation without creating a property. For an investment record, select **Add property**, record its listing source and date, then enter each strategy’s own financing assumptions. A known zero should be entered explicitly for required inputs such as rehabilitation. Owner review checkboxes capture due diligence. A completed model or elevated score does not clear an outstanding gate.

**Reports** opens the printable intelligence report. Use the browser’s print dialog to save PDF and the CSV button for spreadsheet export. Use the **Illustrative** filter to review demonstration records. Demonstrations are excluded from acquisition-ready results, live boards, reports and exports.

## Verify

```bash
python -m unittest discover -s tests -v
node --check static/app.js
```

The HTTP tests bind an ephemeral loopback port. The PWA is designed for a secure origin. Localhost is suitable for development. Physical iPhone validation remains pending.

## Deployment and recovery

For remote owner testing, place the loopback listener behind a reviewed HTTPS reverse proxy with rate limits, request limits and private access. Set the exact external origin, preserve the browser Origin and Authorization headers, and keep the data volume and credential injection private. Use a dedicated origin because routing and the service-worker scope begin at /. The built-in HTTP server and Basic authentication are for the foundation and owner evaluation. A production deployment needs hardened serving, a session or private identity gateway review, monitoring and a mobile device acceptance pass.

Take a consistent snapshot with `python backup.py runtime/edge.sqlite /path/to/private/unique-snapshot.sqlite`. The command refuses to overwrite a destination. Encrypt snapshots and store them separately from the deployment. To rehearse recovery, start an isolated instance with a copy of the snapshot as `EDGE_DB` and confirm property history and settings. For actual recovery, stop the server, preserve the current database and its sidecar files, and point `EDGE_DB` to a separate restored copy before restarting.

See [financial formulas](FORMULAS.md) and [development status](DEVELOPMENT_STATUS.md).
