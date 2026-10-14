# NEVULA

**What happens in NEVULA, stays in NEVULA.**

NEVULA ist eine Android-App für private Nachrichten, einen lokalen Tresor, Notizen und einen Kalender. Die App öffnet hinter einem Taschenrechner-Bildschirm. Es gibt keine Werbung und keine Analyse-SDKs.

Dieser Baum ist der veröffentlichte Play-Stand ohne Play-Signing und ohne private Projektschlüssel.

## Was die App tut

- Taschenrechner als Deckbildschirm. Der Zugangscode wird auf dem Gerät gewählt. Es gibt keinen eingebauten Mastercode.
- Nachrichten werden auf den Geräten verschlüsselt. Der Server sieht den Empfänger, den Geheimtext und ein Ablaufdatum, nicht den Klartext und nicht, wer mit wem schreibt.
- Tresor, Notizen und Kalender bleiben auf dem Gerät.
- Kontakte werden lokal gekoppelt, über QR oder eine Einladung.
- Optionaler Tor-Transport (NevTOR). Das ist zusätzlicher Transportschutz, keine Ende-zu-Ende-Verschlüsselung.

iOS ist nicht Teil dieses Projekts. Geschäftliche Zahlungsfunktionen gehören nicht in diese öffentliche App.

## Sicherheitsmodell

Kurz und ohne Werbeversprechen. Die technische Einordnung steht in `docs/CRYPTO_ARCHITECTURE_REVIEW.md`.

- Identität, Sitzungsschlüssel und Tresor-Schlüssel bleiben im gerätegebundenen Speicher.
- Der aktuelle Chat-Weg ist eine eigene Ratchet-Sitzung (NVL3): Schlüssel wechseln nach Antworten der Gegenseite. Das ist Vorwärtssicherheit im üblichen Ratchet-Sinn für spätere Ketten. Die erste Sitzung hängt noch am Identitätsschlüssel. Wer diesen Schlüssel später erhält, kann frühe Nachrichten dieser Kette nachrechnen.
- Ein kompromittierter Sitzungsstand heilt nach einem neuen Diffie-Hellman-Schritt nur begrenzt. Ein vollständiges Wiederherstellen von Sitzung und Commit-Zähler zusammen fällt lokal nicht auf.
- Neue Nachrichten werden nicht mit OpenPGP signiert. OpenPGP bleibt nur zum Lesen älterer Nachrichten.
- Chat-Sitzungen mischen P-256 mit ML-KEM-768. Das ist ein hybrider Baustein, kein abgeschlossenes Urteil über post-quante Sicherheit. Eine externe Prüfung steht aus.
- Es gibt keine Kontowiederherstellung und keine Synchronisation auf ein zweites eigenes Gerät. Wer Telefon, Zugangscode oder lokale Schlüssel verliert, verliert den lokalen Inhalt.
- NevTOR versteckt den Weg zum Server nicht vor einem Angreifer auf dem Gerät und ersetzt keine Ende-zu-Ende-Verschlüsselung.
- Der Taschenrechner ist ein Diskretionsmerkmal, keine kryptografische Grenze gegen jemanden, der das entsperrte Gerät oder eine Sicherung des App-Speichers hat.

Sicherheitslücken bitte nicht als öffentliches Issue melden. Der Weg steht in [SECURITY.md](SECURITY.md).

## OpenPGP.js

`openpgp` (OpenPGP.js) steht unter der LGPL-3.0-or-later und wird nur zum Lesen älterer Nachrichten genutzt. Die Bibliothek bleibt unter der LGPL. Weil der Quelltext dieser App mitveröffentlicht wird, kann sie ersetzt werden. Das übrige NEVULA steht unter der AGPL-3.0-only.

## Bauen und prüfen

Fremde können den Code übersetzen und den Debug-Build prüfen. Dafür sind keine Play-Signing-Daten nötig. Der Upload-Schlüssel der Play-App liegt nicht in diesem Repository.

Voraussetzungen: Node.js 22, JDK 17, Android SDK.

```bash
npm ci
cp .env.example .env
cp google-services.example.json google-services.json
```

In `.env` eine eigene Supabase-URL und einen eigenen Publishable-Key eintragen. `google-services.json` kommt aus einem eigenen Firebase-Projekt. Die Beispieldateien enthalten nur Platzhalter. Die Datei des Play-Projekts liegt nicht hier. Zum reinen Übersetzen reichen Werte wie `https://example.supabase.co` und `replace-with-publishable-key`. Die App spricht dann nicht mit dem echten NEVULA-Dienst. Ohne eine echte `google-services.json` lässt sich der Debug-Build erzeugen; Firebase-Zustellung dann nicht.

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleDebug
```

Unter Windows: `gradlew.bat assembleDebug`.

Die Debug-APK liegt unter `android/app/build/outputs/apk/debug/`. Sie ist mit dem normalen Android-Debug-Keystore signiert. Das ist kein Play-Schlüssel. Diese APK lässt sich nicht als Update für die Play-App `com.nevula.app` hochladen.

Ein eigener Release-Build braucht einen eigenen Keystore, den jede Person selbst erzeugt. Gradle bricht einen Release-Build ab, wenn diese Variablen fehlen:

- `NEVULA_UPLOAD_STORE_FILE`
- `NEVULA_UPLOAD_STORE_PASSWORD`
- `NEVULA_UPLOAD_KEY_ALIAS`
- `NEVULA_UPLOAD_KEY_PASSWORD`

Diese Namen sind historisch. Für einen Quellen-Build sind es die Werte des eigenen Keystores, niemals die des Play-Upload-Schlüssels.

```bash
npm test
npm run typecheck
```

## Lizenz

NEVULA steht unter der GNU Affero General Public License, Version 3. Der Text liegt in [LICENSE](LICENSE). Beiträge: [CONTRIBUTING.md](CONTRIBUTING.md).
