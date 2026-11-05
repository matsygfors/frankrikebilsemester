# Frankrike 2027

Roadtrips i Frankrike sommaren 2027, visualiserade på karta och tidslinje så att vi kan prata om dem: sex förslag i fem olika delar av landet.
Par A åker från Stockholm, helst med egen bil, och vill kunna köpa vin kring Béziers som bonus. Par B äger en lägenhet i Paris och en i Nice.
Allt är grova planeringsuppskattningar: inget är bokat och körsträckor och tider är egna bedömningar.

## Köra

```bash
npm start      # http://localhost:2027
npm test       # kontrollerar datalogiken mot data/frankrike-2027.json
```

Inga beroenden att installera. Sidan behöver internet för kartbiblioteket (Leaflet från cdnjs) och kartrutorna (OpenStreetMap).

## Vad man ser

- **Jämför**: en karta per roadtrip över Frankrike i samma ram, ett gemensamt tidsreglage, tidslinjerna sida vid sida på samma tidsaxel och en jämförelsetabell.
- **Alternativ 1–6**: stor karta (hela rutten eller bara Frankrike), tidslinje, dag för dag, fordon och sträckor, vin, alternativa mötesplatser, avvägningar och osäkerheter.
- **Längst på samma ort**: det längsta stoppet tillsammans visas i jämförelsetabellen och som chip i varje alternativ. Mer än två nätter markeras rött (gränsen `STAY_LIMIT_NIGHTS` i `js/data.js`). Längsta kördag markeras på samma sätt om den är klart över 60 mil (`DRIVE_LIMIT_KM`, med några procents marginal så att Stockholm–Malmö går an).
- **Tid**: dra i reglaget överst, klicka eller dra i tidslinjerna, ▶ eller mellanslag för att spela upp, Skift + ←/→ för en dag i taget.
  Adressen bär med vy och tid (`#/2?t=312`, timmar sedan dag 1 klockan 00:00), så att ett ögonblick går att dela.

Så läser man kartan och tidslinjen:

| | |
|---|---|
| Blått / orange | Par A / Par B |
| Mörk heldragen färg | De reser tillsammans (samma bil, samma tåg) |
| Blå och orange streck om vartannat | De reser tillsammans i två bilar (alternativ 6) |
| Streckat / prickat / finprickat | Bil / tåg / flyg |
| Vinrött | Béziers och vinavhämtningen |
| Snedstreckat fält i tidslinjen | Hemma |

Linjerna på kartan är **schematiska**: raka streck mellan ortsankare, inte körbara vägar.
Positionen mellan två orter är interpolerad längs linjen efter tid.

## Data

- [`data/frankrike-2027.json`](data/frankrike-2027.json) med schema [`data/frankrike-2027.schema.json`](data/frankrike-2027.schema.json) (JSON Schema 2020-12). Underlaget är skapat 2026-11-01 och gjordes om till roadtrips 2026-11-05.
- Tid anges som timmar sedan dag 1 klockan 00:00 (`at_hour = (dag - 1) * 24 + klockslag`). Varje alternativ har sin egen relativa dag 1, så jämförelsen gäller resdagar, inte kalenderdatum.
- Alternativens nummer följer ordningen i `scenarios`; id:na (`s1`–`s6`) är bara beteckningar. Det finns ingen "förstahandsrekommendation" i underlaget: gruppen väljer.
- De sex alternativen:
  1. **Rivieran, Provence och Languedoc** – Nice via Gorges du Verdon, Luberon och Camargue till Béziers. Egen bil, vinbonus.
  2. **Route des Grandes Alpes** – Annecy till Nice över de höga passen. Egen bil, ingen vinbonus. B börjar i Paris och slutar i Nice.
  3. **Atlantkusten och Baskien** – Bordeaux, Dune du Pilat, Biarritz och Carcassonne till Béziers. Egen bil, vinbonus.
  4. **Auvergne, Tarn och Cévennes** – Clermont-Ferrand, Millau, Tarnkanjonen och Cévennerna till Béziers. Egen bil, vinbonus.
  5. **Normandie, Bretagne och Loire** – flyg till Paris och en hyrbil. Ingen vinbonus.
  6. Som 5, men två hyrbilar (en var).
- Gruppens utgångspunkter: A kör helst inte egen bil in i Paris, så rutter som börjar där använder flyg och hyrbil (en eller två) och rutterna med egen bil går förbi Paris (B tar tåg dit). Vin från Béziers är en bonus och finns bara där A har egen bil och Béziers ligger på vägen; vinplanen (`wine_plan`) är `null` i de andra. Helst en natt på samma ort och högst två där det finns något att se, högst cirka 60 mil per körsträcka och ungefär en vecka tillsammans.
- Bilrutternas sträckor Stockholm–Frankfurt och Frankfurt–Lyon–Nice är desamma som tidigare; sträckorna inom Frankrike är egna uppskattningar (högalpina pass, bergsvägar och småvägar är långsammare än motorväg och tiderna är grova). Tågtider är bara ungefärliga restider.
- Schemat tillåter valfritt antal alternativ, och `wine_plan` får vara `null`. Blocket `recommendation` är borttaget.
- Schemat kontrollerar bara struktur. Referenser, tidsspår, händelser och summor kontrollerades separat mot reglerna i `web_app_contract.validation_rules` när underlaget skapades (inga avvikelser). `npm test` täcker den logik som visualiseringen bygger på.
- Det som visas (rutter, positioner, när paren är tillsammans, nätter, nyckeltal) räknas ut ur datan i [`js/data.js`](js/data.js). Ändra i JSON-filen och ladda om.

## Struktur

```
index.html            sidan
css/style.css         stilar (ljust och mörkt läge)
js/app.js             start, flikar och adress
js/data.js            data -> rutter, positioner, tillsammans, nyckeltal
js/geo.js, format.js  avstånd/interpolering, svensk formatering
js/text.js            svenska formuleringar och tooltip-innehåll
js/map-view.js        en Leaflet-karta per alternativ
js/lanes.js           tidslinjerna (en rad per par, "tillsammans"-list, händelser)
js/compare.js         jämförelsevyn
js/detail.js          vyn för ett alternativ
js/transport.js       reglage, uppspelning, kartram
test/                 tester (node:test)
scripts/serve.mjs     lokal utvecklingsserver
```

## Kartrutor

Kartrutorna kommer från OpenStreetMap (`tile.openstreetmap.org`), som är avsedda för lätt användning. Toner och mörkt läge görs med CSS-filter.
CARTO:s gratisrutor kräver numera API-nyckel. Byt leverantör i [`js/map-view.js`](js/map-view.js) om sidan ska ut offentligt.

## Nästa steg (idéer)

- Riktig vägegeometri från en ruttmotor i stället för raka streck (`road_geometry` finns redan i datamodellen), och jämförelse mot underlagets uppskattade kilometer.
- Startdatum: visa veckodagar och datum, och vad som infaller på helger.
- Ändra dagar, mötesplatser och vistelser och få tidslinjen omräknad (se `web_app_contract.change_rules`).
- Förslag på stopp och boenden längs rutterna.
