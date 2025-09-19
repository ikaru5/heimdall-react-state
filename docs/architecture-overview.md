# Architekturüberblick – Heimdall React State

Dieser Überblick beschreibt den aktuellen Stand der Bibliothek und ersetzt frühere Implementierungsvorschläge.

## 1. High-Level
- **Zweck:** Brücke zwischen `heimdall-contract` und React-Komponenten. Liefert einen beobachtbaren Store, der feingranulare Re-Renders erlaubt.
- **Kernelemente:**
  - `createContractStore` (Instrumentierung & Observable Layer)
  - React-Hooks (`useContractValue`, `useContractSelector`, `useContract`)
  - Pfad-Utilities (`src/internal/path.js`) für Normalisierung, Schlüsselgenerierung und Ahnen-Traversierung

## 2. Datenfluss bei Mutationen
1. **Mutation** – erfolgt über Contract-API (`setValueAtPath`, `assign`, direkte Proxy-Zugriffe).
2. **Instrumentierung** – `createContractStore` patched `setValueAtPath`, wrappt Objekte/Arrays/Child-Contracts mit Proxys und überwacht Array-Mutatoren.
3. **Emit** – `emitChange` bildet den Pfadschlüssel, erhöht Revisionen für alle Ahnen (`traverseAncestors`) und benachrichtigt Listener.
4. **Hooks** – `useSyncExternalStore` liest Snapshots und prüft Revisionen plus `equalityFn`, um unnötige Re-Renders zu verhindern.

## 3. Store-Aufbau (`createContractStore.js`)
- Verwaltet `subscribers`, `revisions` und Proxy-Caches (WeakMap/WeakSet).
- `subscribe(path, callback, { exact })` registriert Listener pro Pfadschlüssel. Ahnen werden automatisch informiert, sofern `exact` nicht gesetzt ist.
- `getRevision(pathKey?)` liefert monotone Zähler als Memoisierungshilfe.
- `getContract()` stellt die Proxy-Version bereit, `getOriginalContract()` liefert den unveränderten Contract.
- Instrumentiert Kindstrukturen rekursiv, inklusive später hinzukommender Werte (`captureNestedStructures`).

## 4. React-Hooks (`src/hooks.js`)
- **Gemeinsame Grundlagen**
  - Validieren Stores via `assertValidStore` (muss `subscribe` und `getRevision` besitzen).
  - Greifen über `getContractProxy` auf den proxied Contract zu.
- **`useContractValue`**
  - Normalisiert Pfade (`normalizePath`), bildet Schlüssel (`pathToKey`).
  - Abonniert Änderungen am Pfad; prüft Revision und optional `equalityFn`.
- **`useContractSelector`**
  - Führt benutzerdefinierten Selector aus, speichert Zwischenergebnisse.
  - Kombiniert Revisionstracking des Root-Stores mit `equalityFn`.
- **`useContract`**
  - Verwendet `useContractSelector`, um globale Revisionen zu verfolgen, und gibt den Proxy memoisiert zurück.

## 5. Pfad-Hilfen (`src/internal/path.js`)
- `normalizePath` akzeptiert Strings (`"a.b"`), Arrays oder leere Werte → normalisierte Segmentarrays.
- `pathToKey` wandelt Segmentarrays in Schlüssel (`"a.b"`) um; Root-Schlüssel ist `""`.
- `traverseAncestors` iteriert vom Blatt zum Root-Schlüssel.
- `readAtPath` extrahiert Werte sicher entlang des Pfades.
- `RAW_SYMBOL` kennzeichnet Rohwerte, wenn Proxys Zugriff gewähren müssen.

## 6. Erweiterungspunkte
- **`options.onUpdate`**: Callback in `createContractStore` für Logging/Devtools.
- **Equality-Funktionen:** Hooks akzeptieren `equalityFn`, um komplexe Vergleiche zu steuern.
- **Proxy-Strategie:** Neue Strukturtypen müssen über `ensureInstrumented` eingebunden werden.

## 7. Tests & Qualitätssicherung
- `npm test` (Jest, JS-DOM) deckt Store- und Hook-Verhalten ab.
- `npm run lint` prüft ESLint-Regeln inkl. React-Hooks-Plugin.
- `npm run format` stellt Prettier-konformes Formatting sicher.

## 8. Bekannte Grenzen
- Array-Reordering erfordert manuelle Revalidierung, weil Indizes als stabile Schlüssel behandelt werden.
- Direkte Mutationen außerhalb der Contract-API (z. B. Fremdmethoden) werden nur erkannt, wenn sie über instrumentierte Proxys laufen.

> Diese Datei ist aktuell zu halten, sobald sich interne Abläufe oder Tests ändern.
