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

## Prio 3 - UX i rozszerzenie funkcjonalności

### Więcej typów obiektów ABAP

| Typ | RFC do pobrania | RFC do zapisu |
|-----|----------------|---------------|
| Program (PROG) | `RPY_PROGRAM_READ` ✅ | `RPY_PROGRAM_UPDATE` |
| Function Module | `RFC_FUNCTION_SOURCE_CONTENTS` | `RFC_FUNCTION_SOURCE_INSERT` |
| Class (CLAS) | `SEO_CLASS_READ` | `SEO_CLASS_CREATE` |
| Include (INCL) | `RPY_PROGRAM_READ` ✅ | `RPY_PROGRAM_UPDATE` |

### Tree view (panel boczny)

- Widok połączonych systemów SAP
- Widok pobranych programów pogrupowanych per system
- Quick access do otwierania plików

### UX

- Progress bar przy pobieraniu/zapisie
- Quick pick z ostatnio używanymi TR
- Diff lokalny ↔ SAP przed nadpisaniem
- Auto syntax check przy save (opcjonalne, konfigurowane)

---

## Prio 4 - Infrastruktura

- [ ] Testy integracyjne z mockiem RFC (mock pyrfc)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Lepsza obsługa błędów RFC z komunikatami użytkownikowi
- [ ] Dokumentacja i README

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
