# Agent Guide – Heimdall React State

> ⚠️ **Pflicht zur Pflege:** Diese Agentendokumentation muss automatisch aktualisiert werden, sobald der Agent relevante neue Erkenntnisse gewinnt oder Änderungen vornimmt, die bestehende Informationen betreffen. Jede Änderung am Code, am Build-Prozess oder an zentralen Abhängigkeiten ist sofort hier einzupflegen.

## Ziel und Kontext
- **Paketname:** `@ikaru5/heimdall-react-state` – React-Bindings rund um `heimdall-contract`.
- **Rolle der Agenten:** Wartung, Qualitätssicherung und Erweiterung der Bibliothek sowie der Dokumentation.
- **Wichtige Werte:** Stabilität, feingranulare Aktualisierung von React-Komponenten, strenge Testabdeckung.

## Projektstruktur (Stand jetzt)
```
src/
  createContractStore.js   # Kern: Observable-Store-Layer rund um Contracts
  hooks.js                 # Implementierung der React-Hooks (useContractValue, ...)
  index.js                 # Public API / Re-Exports
  internal/                # Hilfsfunktionen (Pfad-Utilities, Proxy-Wrapper, Revisionen)
  types.js                 # JSDoc-Typdefinitionen für Entwickelnde

docs/
  AGENT_GUIDE.md           # Diese Datei
  architecture-overview.md # Architektur- und Designübersicht
README.md                  # Nutzer:innen-Doku mit Quickstart und API
eslint.config.js           # Flat ESLint-Konfiguration (ESLint 9, ersetzt .eslintrc)
```
> **Wenn neue zentrale Dateien oder Ordner entstehen**, sind sie hier einzutragen und kurz zu beschreiben.

## Kernkonzepte, die nicht verletzt werden dürfen
1. **Vertrauen in `heimdall-contract`:** Keine direkten Änderungen an dessen internem Zustand außerhalb der öffentlichen API (`assign`, `setValueAtPath`, etc.).
2. **Pfadbasierte Reaktivität:** Jede Mutation muss über `emitChange` den passenden Pfad und dessen Ahnen informieren. Neue Features dürfen diese Benachrichtigungskette nicht brechen.
3. **Proxys bleiben stabil:** Objekt- und Array-Proxys werden gecacht. Beim Arbeiten an `wrap*`-Hilfsfunktionen unbedingt darauf achten, dass Identitäten pro Instanz bestehen bleiben.
4. **Hooks sind Concurrent-Mode-sicher:** Alle Hooks nutzen `useSyncExternalStore`. Erweiterungen müssen dieses Muster beibehalten.

## Arbeitsablauf für Änderungen
1. **Analyse & Design**
   - Prüfe zuerst `docs/architecture-overview.md` sowie die Tests unter `test/`.
   - Überprüfe, ob bestehende Patterns wiederverwendet werden können.
2. **Implementierung**
   - Halte dich an die existierenden Utility-Funktionen im `internal/`-Verzeichnis.
   - Ergänze bei Bedarf JSDoc-Typen in `types.js`, damit die API konsistent bleibt.
3. **Tests & Qualitätssicherung**
   - `npm test` ausführen (Coverage basiert auf Jest 30 mit `coverageProvider: "v8"`).
   - `npm run lint` (ESLint 9 Flat Config in `eslint.config.js`) und `npm run format` prüfen Style & Formatierung.
   - Bei Anpassungen an Hooks Integrationstests unter `test/` erweitern.
4. **Dokumentation anpassen**
   - README für Nutzer:innen, diese Agenten-Doku für Prozesswissen, `architecture-overview.md` für technische Entscheidungen.
   - Jede veränderte Beobachtung oder neue Abhängigkeit **sofort** dokumentieren.

## Typische Fehlerquellen & Checks
- **Vergessene Instrumentierung**: Neue Mutationswege (z. B. zusätzliche Contract-Methoden) müssen `emitChange` auslösen.
- **Array-Operationen**: Nutze die vorhandene Liste `MUTATING_ARRAY_METHODS`, wenn neue Methoden hinzukommen.
- **Speicherlecks**: Beim Hinzufügen neuer Caches immer WeakMap/WeakSet einsetzen, um Contracts freizugeben.
- **Subscriptions**: Beim Erweitern von `subscribe`-Optionen daran denken, die `unsubscribe`-Logik zu aktualisieren.

## Wann diese Datei aktualisiert werden muss
- Neue Verzeichnisse, bedeutende Dateien oder Build-Schritte.
- Änderungen an Test- oder Lint-Workflows.
- Erkenntnisse über häufige Bugs oder Workarounds.
- Deprecations oder Breaking Changes in `heimdall-contract` **oder zentralen Tooling-Abhängigkeiten** (z. B. aktualisierte ESLint/Jest-Versionen, neue Overrides in `package.json`).

## Kontaktpunkte / Weiterführende Ressourcen
- `docs/architecture-overview.md` für aktuelle Architektur.
- Tests im Ordner `test/` als lebende Spezifikation.
- README für API-Beispiele, die mit Code synchron gehalten werden müssen.

> 💡 **Merke:** Jede Agentenaktion, die ohne Aktualisierung dieser Dokumentation erfolgt, gilt als unvollständig. Halte sie deshalb synchron – idealerweise automatisiert über den Arbeitsablauf.
