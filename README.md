# abaprfc — ABAP RFC Extension for VS Code

Edit and upload ABAP programs directly from VS Code to SAP systems via RFC.

## Requirements

These runtime requirements must be installed outside the extension itself.

| Requirement | Notes |
|-------------|-------|
| **Python 3.8+** | Must be in PATH |
| **pyrfc** | `pip install pyrfc` — requires SAP NW RFC SDK ([SAP note 2573790](https://launchpad.support.sap.com/#/notes/2573790)) |
| **SAP user** | Developer authorization (`S_DEVELOP`) and transport rights (`S_TRANSPRT`) |
| **VS Code extension** | [vscode-abap](https://marketplace.visualstudio.com/items?itemName=larshp.vscode-abap) for syntax highlighting |

## Installation

1. Install the extension from the VS Code Marketplace (or build from source, see below)
2. Install Python dependency:
   ```bash
   pip install pyrfc
   ```
3. Set up the SAP NW RFC SDK following SAP note 2573790
4. If the SDK is not in a standard location, set `abaprfc.sapNwRfcSdkPath` to the SDK root or `lib` directory

## Quick Start

### 1. Add a SAP connection
Open the Command Palette (`Ctrl+Shift+P`) and run:
```
AbapRfc: Add SAP Connection
```
Fill in: host, user, password, system number, client, language.
Credentials are stored securely via VS Code's built-in Secret Storage — **never in plain text**.

### 2. Open the ABAP workspace
```
AbapRfc: Open ABAP Workspace
```
Opens `~/AbapRfc/abaprfc.code-workspace` — persists your downloaded objects across VS Code restarts.

### 3. Download an object
```
AbapRfc: Download Program from SAP          (Z/Y prefix required)
AbapRfc: Download Function Module from SAP  (Z/Y prefix required)
```

### 4. Edit and upload

| Action | Shortcut | Button |
|--------|----------|--------|
| Upload to SAP | `Ctrl+Shift+U` | `$(cloud-upload)` in editor title |
| Syntax check | `Ctrl+Shift+S` | `$(check)` in editor title |
| Diff vs SAP | `Ctrl+Shift+D` | `$(diff)` in editor title |

## Transport Request Flow

Every upload **must go through a Transport Request (TR)** so that changes propagate through DEV → QAS → PRD.

```
Edit .abap file locally
    ↓
Upload to SAP  (Ctrl+Shift+U)
    ↓
Syntax check  →  errors shown as red/yellow squigglies in editor
    ↓
Select Transport Request
    ├── Reuse last TR (cached per session + destination)
    ├── Choose from list of your open TRs
    └── Create new TR  (enter description)
    ↓
Write source via RFC  (RPY_PROGRAM_UPDATE / RFC_FUNCTION_SOURCE_INSERT)
    ↓
Assign object to TR  (TR_OBJECT_INSERT  R3TR/PROG  or  R3TR/FUGR)
    ↓
Success notification with TR number
```

> **Function Modules**: TR assignment uses the **function group** (FUGR), not the individual FM name.
> Verify the function group is in your TR before releasing.

## Commands

| Command | Description |
|---------|-------------|
| `AbapRfc: Add SAP Connection` | Wizard to configure a new SAP system |
| `AbapRfc: Download Program from SAP` | Download ABAP program + includes |
| `AbapRfc: Download Function Module from SAP` | Download function module source |
| `AbapRfc: Upload to SAP` | Upload active .abap file via transport |
| `AbapRfc: Syntax Check` | RFC syntax check with inline diagnostics |
| `AbapRfc: Diff with SAP` | Compare local file with current SAP version |
| `AbapRfc: Open ABAP Workspace` | Open the persistent workspace file |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `abaprfc.syntaxCheckOnSave` | `false` | Automatically run syntax check on save |
| `abaprfc.pythonPath` | `""` | Absolute path to the Python interpreter used by the RFC bridge |
| `abaprfc.sapNwRfcSdkPath` | `""` | Path to SAP NW RFC SDK root or `lib` directory; if empty, common paths like `C:\nwrfcsdk\lib` are auto-detected |

## File Structure

```
~/AbapRfc/
├── abapConfig.json              — connection list (no passwords stored here)
├── abaprfc.code-workspace       — VS Code workspace (auto-updated on new connections)
└── repos/
    ├── DEV/
    │   ├── ZPROGRAM1/
    │   │   ├── zprogram1.abap   — main source
    │   │   ├── .abapobj         — metadata: {objectType, name, dest}
    │   │   └── INCLUDES/
    │   │       └── zinclude1.abap
    │   └── Z_MY_FUNC/
    │       ├── z_my_func.abap
    │       └── .abapobj         — {objectType:"FUNC", functionGroup:"Z_MY_GROUP", …}
    └── QAS/
```

## RFC Modules

### Read
| RFC | Purpose |
|-----|---------|
| `RPY_PROGRAM_READ` | Program source + includes |
| `RPY_EXISTENCE_CHECK_PROG` | Check program exists |
| `RFC_FUNCTION_SOURCE_CONTENTS` | Function module source |
| `RFC_FUNCTION_SEARCH` | Check FM exists |

### Write
| RFC | Purpose |
|-----|---------|
| `SYNTAX_CHECK_PROGRAM` | Syntax check before upload |
| `RPY_PROGRAM_UPDATE` | Update program source |
| `RFC_FUNCTION_SOURCE_INSERT` | Update function module |
| `CTS_API_GET_OPEN_CHANGE_REQUESTS` | List open TRs (ERP 6.0+) |
| `CTS_API_CREATE_CHANGE_REQUEST` | Create new TR |
| `TR_OBJECT_INSERT` | Assign object to TR |

## Build from Source

```bash
git clone https://github.com/siasty/abaprfc.git
cd abaprfc
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

## Tests

```bash
# TypeScript unit tests (no SAP or VS Code installation required)
npm run test:unit

# Python unit tests (no SAP required — uses mock pyrfc)
pytest test/python/ -v
```

## Known Limitations

- Only **Z/Y prefix** objects can be downloaded and uploaded
- **ABAP Classes** (`SE24`) are not yet supported
- `SYNTAX_CHECK_PROGRAM` parameter names may vary by SAP release — adjust `src/py/abap_write.py` if needed
- The SAP NW RFC SDK is proprietary and must be obtained from SAP separately

## License

MIT
