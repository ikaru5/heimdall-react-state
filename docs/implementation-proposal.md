# Heimdall React State – Implementation Proposal

## 1. Zielsetzung
- **Plugin-Charakter**: Heimdall React State soll als dünne Schicht um `heimdall-contract` fungieren, ohne den Kern zu verändern.
- **Reaktives Formular-Handling**: Änderungen im Contract spiegeln sich effizient in React-Komponenten wider.
- **Feingranulares Rendering**: Nur betroffene Komponenten rerendern, insbesondere bei verschachtelten Contracts.
- **Erweiterbarkeit**: Optionale Erweiterungen am Contract bleiben minimalinvasiv.

## 2. Ausgangssituation – Heimdall Contract (Annahmen)
- Contracts sind Klassen, die Zustand kapseln und Methoden wie `assign` und `setValueAtPath` anbieten.
- Contracts können verschachtelt sein (Child-Contracts in Feldern).
- Der Contract besitzt bislang kein Event-System.

## 3. Architekturvorschlag
### 3.1 Kernidee
Wir ergänzen den Contract um eine **Beobachtungs-API** (Observable Layer), die unabhängig vom React-Plugin ist. Diese API lässt sich auch in anderen Umgebungen nutzen. Das React-Plugin basiert darauf und setzt `useSyncExternalStore` ein, um sich mit Reacts Concurrent Mode zu integrieren.

```
┌────────────────────┐
│ heimdall-contract  │
├────────────────────┤
│ Base Contract API  │◄───────── unverändert nutzbar
├────────────────────┤
│ Observable Layer   │◄───────── optionales Add-on, Events pro Path
└────────────────────┘
          ▲
          │
┌─────────────────────────┐
│ heimdall-react-state    │
├─────────────────────────┤
│ Store Manager           │
│ React Bindings          │
│ CLI / Devtools (optional)
└─────────────────────────┘
```

### 3.2 Observable Layer (Contract-Add-on)
- **Ziel**: Minimalinvasiv, keine Änderungen an bestehenden Methoden.
- **Mechanismus**:
  - Wrap der Mutationsmethoden (`assign`, `setValueAtPath`, `merge`, etc.).
  - Bei Änderung: Ermittlung der betroffenen Pfade und Dispatch an ein Event-System (z. B. eigenes kleines Pub/Sub oder `EventTarget`).
  - Child-Contracts melden Änderungen über denselben Kanal (Pfadpräfix).
- **API** (pseudo):
  ```ts
  type ContractObserver = (event: ContractChangeEvent) => void;

  interface ContractChangeEvent {
    contract: HeimdallContract;
    path: string[];        // Pfad innerhalb des Contracts
    type: 'set' | 'merge' | 'delete' | 'child-update';
    value: unknown;        // Neue Wert-Repräsentation
    prevValue?: unknown;
  }

  contract.observe(pathSelector?, callback, options?) => unsubscribe;
  ```
- **Pfad-Optimierung**:
  - `pathSelector` kann ein Array, String oder Prädikat sein.
  - Intern: Normalisierung zu einer `PathTree`, die Abhängigkeiten als Trie hält → schnelle Ermittlung, wer benachrichtigt werden muss.
  - Child-Contracts melden Änderungen mit vollständigem Pfad (`['address', 'street']`).

### 3.3 React-Bindings
- **Kontext-Provider**: `HeimdallProvider` nimmt Contract-Instanz entgegen.
  ```tsx
  <HeimdallProvider contract={contract}>
    <MyForm />
  </HeimdallProvider>
  ```
- **Hooks**:
  - `useContract()` → gesamte Instanz (vorsichtig einsetzen, rerendert global).
  - `useContractValue(pathSelector, options?)` → liest Wert an Pfad, rerendert bei Änderungen.
  - `useContractActions(pathSelector)` → liefert stabile Mutationsfunktionen.
  - `useContractForm({ schema, defaults })` → optionales Convenience-API für Formulare.
- **Selector-Unterstützung**:
  - Path (Array / String): `useContractValue('address.street')`.
  - Custom Selector (Fn): `useContractSelector(contract => contract.isValid())` → uses memoized comparator.
  - `options.equalityFn` für tiefe Vergleiche.
- **Performance**:
  - `useSyncExternalStore` + `PathTree` ensures minimal rerenders.
  - Batching: Änderungen, die synchron passieren, werden `unstable_batchedUpdates` (automatisch in React 18) zusammengeführt.

### 3.4 Umgang mit verschachtelten Contracts
- Child-Contracts registrieren sich beim Parent über `registerChild(path, childContract)`.
- Beobachter werden in der `PathTree`-Struktur mit vollständigem Pfad gespeichert.
- Änderungen im Parent lösen nur Events aus, wenn Pfad betroffen ist:
  - `assign({ address: { city: 'Berlin' } })` → only watchers unter `address`.
  - Wenn Parent-Property ersetzt wird, wird `type: 'replace'` mit `path: ['address']` gesendet und Kinder werden benachrichtigt.

### 3.5 CLI / DSL Ideen
1. **Minimal** – Kein CLI, nur API-Deklaration.
2. **Schema-basierte Generierung** (optional):
   - CLI liest JSON/YAML-Schema und generiert Contract-Klassen + React Hooks (`heimdall-react-state generate form userForm.json`).
   - DSL orientiert an Form-Felddefinitionen (Validierungen, Default-Werte, Abhängigkeiten).
   - Generiert ebenfalls TypeScript-Typen für Pfade (`type AddressPath = 'address.street' | ...`).
3. **Devtools** (optional):
   - CLI startet `devtools` Server → Inspect Contract-Zustand, Replay Mutationen.

## 4. Implementierungsoptionen
### Option A – Lightweight Wrapper (Empfohlen für MVP)
- Observable Layer als Mix-in / Decorator ohne Kernänderung.
- React-Plugin nutzt nur öffentliche Contract-API.
- Pro: Minimal invasiv, schnelle Umsetzung.
- Contra: Event-System lebt außerhalb, muss manuell installiert werden (`withObservable(contract)`).

### Option B – Contract-Erweiterung
- Observable Layer direkt in `HeimdallContract` integriert.
- React-Plugin nutzt `contract.subscribe(path, cb)`.
- Pro: Einheitliche API, weniger Boilerplate.
- Contra: Anpassung der Kernbibliothek nötig → könnte bestehende Nutzer beeinflussen.

### Option C – Proxy-basierte Reaktivität
- Contract wird via `Proxy` beobachtet, Änderungen lösen Events aus.
- Pro: Keine Änderung an Mutationsmethoden nötig.
- Contra: Performance-Overhead, schwerer mit verschachtelten Contracts und Methoden.

## 5. Schritte zur Umsetzung (für Option A)
1. **Observable Layer Paket** (`@heimdall/observable`)
   - Implementiert PathTree, Subscription Management, Mutation-Wrap.
   - `makeObservableContract(contract)` gibt neue Instanz mit `subscribe`-API zurück.
2. **React Store** (`@heimdall/react-state`)
   - `createHeimdallStore(contract)` → liefert `provider`, Hooks, Utilities.
   - Hooks basieren auf `useSyncExternalStore`.
   - Optional: `useContractDispatcher` für Mutationen.
3. **Testing**
   - Unit-Tests für PathTree & Subscription.
   - React-Tests mit `@testing-library/react`.
4. **CLI (Optional)**
   - Basic CLI mit `commander` / `oclif`.
   - Kommandos: `generate`, `inspect`, `devtools` (Placeholder).

## 6. Antworten auf Rückfragen

### 6.1 Umfang potenzieller Contract-Erweiterungen
- **Bevorzugt: Mix-in / Decorator** – Der Observable-Layer bleibt weiterhin optional (`withObservable(contract)`), sodass bestehende Instanzen unverändert funktionieren.
- **Zulässige Ergänzungen im Kern** – Falls wir im Contract selbst eingreifen müssen, beschränkt sich das auf kleine Erweiterungspunkte:
  - optionale `onMutation(callback)`-Registrierung, die intern vom Mix-in genutzt wird,
  - Hilfsfunktionen, mit denen Child-Contracts ihren Parent informieren können (z. B. `notifyParent(path, payload)`).
- **Keine Pflicht für harte Kopplung** – Auch mit verschachtelten Contracts genügt es, dass Child-Instanzen beim Parent ein `registerChild(path, child)` aufrufen. Der Contract bleibt dadurch agnostisch und kann ohne React weiterverwendet werden.

### 6.2 Schema-basierte CLI – was bedeutet das?
- **Definition** – Eine optionale CLI könnte aus Schema-Dateien (JSON/YAML) Contract-Klassen, Pfad-Typen und React-Hooks generieren.
- **Startumfang** – Für den MVP nicht notwendig. Anfangs reicht eine einfache CLI (oder gar keine) mit Tasks wie `inspect` bzw. `watch`.
- **Mehrwert später** – Sobald wiederkehrende Formularstrukturen entstehen, kann die CLI Validierungsregeln, Default-Werte oder abhängige Felder aus einem Schema ableiten und in Contracts + Hook-Boilerplate übersetzen.

### 6.3 Form-Helper & Validierung
- **Direkter Wertezugriff** – `useContractValue(path)` liefert den aktuellen Feldwert und reagiert auf Änderungen. Zusätzlich stellt `useContractActions(path)` stabile Setter (`set`, `assign`, `setValueAtPath`) bereit.
- **Formular-Hook (`useContractForm`)**
  - Einstiegspunkt für Formularlogik mit Optionen wie `{ paths, defaults, validators }`.
  - Gibt Utilities zurück: `values`, `setValue(path, value)`, `reset()`, `isDirty(path?)`, `touched`, `submit(handler)`.
  - Validierung bleibt manuell steuerbar: `validate(path?)` startet gezielt Validierungen (auch zusammengesetzte Regeln).
- **Validierungsfluss** – Die React-Komponenten verwalten weiter den UI-State. Der Contract kapselt Daten + Validierungsergebnisse (z. B. `errors[path]`). Änderungen am Contract lösen Re-Renders nur dort aus, wo `useContractValue`/`useContractSelector` genutzt wird. Dadurch bleiben Eltern- und Kinder-Contracts voneinander entkoppelt, solange ihre Pfade unverändert bleiben.

## 7. Fazit
Die vorgeschlagene Architektur erlaubt es, den bestehenden Contract weitgehend unangetastet zu lassen und dennoch effiziente Reaktivität in React zu erreichen. Über den Observable Layer können sowohl flache als auch verschachtelte Contracts zielgerichtet beobachtet werden. Die React-Bindings setzen moderne Patterns (`useSyncExternalStore`, selektive Subscriptions) ein, um unnötige Re-Renders zu vermeiden. Je nach gewünschtem Integrationsgrad können weitere Optionen (z. B. CLI, direkte Contract-Erweiterung) schrittweise umgesetzt werden.
