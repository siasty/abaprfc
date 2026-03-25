# abaprfc - Plan rozwoju

## Stan obecny (v0.0.1)

Zaimplementowane:
- Dodawanie połączeń SAP (wizard)
- Pobieranie programów ABAP (tylko Z*) przez RFC
- Pobieranie includeów programu
- Otwieranie pobranego programu w edytorze

---

## Prio 1 - Naprawy krytyczne ✅ DONE

- [x] Szyfrowanie haseł - VS Code SecretStorage (`context.secrets`)
  - Hasła usunięte z `abapConfig.json`
  - Przechowywane bezpiecznie w SecretStorage VS Code
- [x] Naprawa async/await w `Configuration.ts` i `fileSystem.ts`
  - `updateFile` używa `fs.promises`
  - `createFile` używa `fs.promises.access` + `fs.promises.writeFile`
  - Usunięty pusty `setTimeout()` (race condition)
- [x] Naprawa logiki walidacji (`||` → `&&` w `canFinish`)
- [x] Naprawa błędu składni w `abapConfigModel.ts` (`}[];` → `}`)

---

## Prio 2 - Core features (zapis do SAP przez transport)

### Mechanizm transportów

Zapis do SAP **musi** przechodzić przez Transport Request (TR).
Bez TR zmiana istnieje tylko w kliencie deweloperskim i nie trafia na QAS/PRD.

#### Flow zapisu:

```
Edycja .abap lokalnie
    → "Upload to SAP" (komenda)
    → wybór systemu docelowego (dest)
    → pobranie otwartych TR użytkownika (CTS_API_GET_OPEN_CHANGE_REQUESTS)
    → wybór TR z listy LUB stworzenie nowego (CTS_API_CREATE_CHANGE_REQUEST)
    → zapis kodu przez RFC (RPY_PROGRAM_UPDATE)
    → przypisanie obiektu do TR (TR_OBJECT_INSERT / CTS_API_CHANGE_REQUEST_INCLUDE)
    → potwierdzenie użytkownikowi
```

#### RFC do implementacji (Python bridge):

| RFC | Cel |
|-----|-----|
| `RPY_PROGRAM_UPDATE` | Zapis kodu programu do SAP |
| `RPY_PROGRAM_INSERT` | Tworzenie nowego programu |
| `CTS_API_GET_OPEN_CHANGE_REQUESTS` | Lista otwartych TR użytkownika |
| `CTS_API_CREATE_CHANGE_REQUEST` | Tworzenie nowego TR |
| `TR_OBJECT_INSERT` | Dołączenie obiektu do TR |
| `RPY_EXISTENCE_CHECK_PROG` | Sprawdzenie czy program istnieje (już jest) |
| `SYNTAX_CHECK_PROGRAM` | Syntax check przed zapisem |

#### Komendy VS Code do dodania:

- `abaprfc.uploadProgram` - Upload aktywnego pliku .abap do SAP
- `abaprfc.syntaxCheck` - Syntax check przez RFC

#### Uwagi:

- Przed zapisem wykonać syntax check (opcjonalnie z ostrzeżeniem)
- TR powinien być "zapamiętany" per sesja (nie pytać za każdym razem)
- Przy zapisie include'a - zapisywać program główny, nie include bezpośrednio
- Obsługa błędu: obiekt zablokowany przez innego użytkownika (`ENQUEUE_ESABAP*`)

---

## Prio 3 - UX i rozszerzenie funkcjonalności ✅ DONE

### Więcej typów obiektów ABAP

| Typ | RFC do pobrania | RFC do zapisu | Status |
|-----|----------------|---------------|--------|
| Program (PROG) | `RPY_PROGRAM_READ` | `RPY_PROGRAM_UPDATE` | ✅ |
| Function Module | `RFC_FUNCTION_SOURCE_CONTENTS` | `RFC_FUNCTION_SOURCE_INSERT` | ✅ |
| Class (CLAS) | `SEO_CLASS_READ` | `SEO_CLASS_CREATE` | todo |
| Include (INCL) | `RPY_PROGRAM_READ` | `RPY_PROGRAM_UPDATE` | ✅ (via PROG) |

### Zaimplementowane w Prio 3

- [x] `.abapobj` metadata sidecar — każdy pobrany obiekt ma plik z typem, nazwą, dest, functionGroup
- [x] Tree View — ikona `$(symbol-method)` dla FM, `$(file-code)` dla PROG, opis function group
- [x] `SapSourceProvider` — wirtualny dokument `sap-source:/DEST/NAME` do diff editora
- [x] `abaprfc.diffWithSap` — diff SAP ↔ lokalny plik (Ctrl+Shift+D), ikona `$(diff)` w edytorze
- [x] `abaprfc.getFunction` — pobieranie Function Module z SAP
- [x] `abaprfc.uploadProgram` — type-aware upload: PROG vs FUNC (różne RFC, różny TR assignment)
  - PROG → `RPY_PROGRAM_UPDATE` + TR: R3TR/PROG/{name}
  - FUNC → `RFC_FUNCTION_SOURCE_INSERT` + TR: R3TR/FUGR/{functionGroup}
- [x] Auto syntax check przy save — ustawienie `abaprfc.syntaxCheckOnSave` (default: false)
- [x] VS Code settings contribution (`abaprfc.syntaxCheckOnSave`)

---

## Prio 4 - Infrastruktura ✅ DONE

- [x] Testy Python z mock pyrfc (`test/python/` — pytest, bez SAP)
  - `mock_pyrfc.py`: Connection, exception classes, konfigurowalne RESPONSES per test
  - `test_abap_read.py`: get_error, checkProgramExist, getZetReadProgram, getFunctionModule
  - `test_abap_write.py`: syntaxCheckProgram, getOpenTransports, createTransport, updateProgram, insertObjectToTransport
- [x] TypeScript unit testy (`src/test/unit/` — mocha, bez VS Code)
  - `pathUtils.test.ts`: resolveAbapPath — happy paths + error paths
  - Script `npm run test:unit` (compile + mocha, no VS Code needed)
- [x] `src/utils/pathUtils.ts` — czyste funkcje bez vscode dependency (testowalne)
- [x] `src/helper/RfcErrorHandler.ts` — centralna obsługa błędów RFC
  - isRfcError() + describeRfcError() z czytelnym komunikatem per typ błędu
  - (LogonError → "Login failed", CommunicationError → "Cannot reach SAP", itd.)
  - Usunięte lokalne duplikaty z 5 plików
- [x] CI/CD pipeline `.github/workflows/ci.yml` (GitHub Actions)
  - Job `typescript`: npm ci → lint → compile → test:unit
  - Job `python`: pytest test/python/ -v
  - Triggeruje na push i pull_request
- [x] README.md — pełna dokumentacja: prereqs, quickstart, transport flow, komendy, RFC tabela

---

## Architektura docelowa

```
extension.ts
├── commands/
│   ├── addConnection     - kreator połączenia SAP
│   ├── getProgram        - pobieranie programu z SAP
│   ├── uploadProgram     - zapis programu do SAP (przez TR)  ← do zrobienia
│   └── syntaxCheck       - syntax check przez RFC            ← do zrobienia
├── helper/
│   ├── Configuration.ts  - zarządzanie konfiguracją + SecretStorage
│   ├── fileSystem.ts     - operacje na plikach lokalnych
│   ├── ProgramsMethods.ts - logika pobierania programów
│   └── TransportMethods.ts - logika TR (create/select/assign) ← do zrobienia
├── models/
│   ├── abapConfigModel.ts - model połączenia SAP
│   └── transportModel.ts  - model Transport Request           ← do zrobienia
└── py/
    ├── abap.py            - bridge pyrfc (read)
    └── abap_write.py      - bridge pyrfc (write + TR)         ← do zrobienia
```
