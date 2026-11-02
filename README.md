# Frankrike 2027

Sätt att ta sig till Béziers sommaren 2027, visualiserade på karta och tidslinje så att vi kan prata om dem: fyra grundalternativ och två korta varianter av Flyg till Paris.
Par A åker från Stockholm och vill köpa vin kring Béziers. Par B har bostäder i Paris och Nice.
Allt är grova planeringsuppskattningar: inget är bokat och körsträckor och tider är egna bedömningar.

## Köra

```bash
npm start      # http://localhost:5173
npm test       # kontrollerar datalogiken mot data/frankrike-2027.json
```

Inga beroenden att installera. Sidan behöver internet för kartbiblioteket (Leaflet från cdnjs) och kartrutorna (OpenStreetMap).

## Vad man ser

- **Jämför**: en karta per alternativ över Frankrike i samma ram, ett gemensamt tidsreglage, tidslinjerna sida vid sida på samma tidsaxel och en jämförelsetabell.
- **Alternativ 1–6**: stor karta (hela rutten eller bara Frankrike), tidslinje, dag för dag, fordon och sträckor, vin, alternativa mötesplatser, avvägningar och osäkerheter.
- **Längst på samma ort**: det längsta stoppet tillsammans visas i jämförelsetabellen och som chip i varje alternativ. Mer än två nätter markeras rött (gränsen `STAY_LIMIT_NIGHTS` i `js/data.js`). Längsta kördag markeras på samma sätt om den är klart över 60 mil (`DRIVE_LIMIT_KM`, med några procents marginal så att Stockholm–Malmö går an).
- **Tid**: dra i reglaget överst, klicka eller dra i tidslinjerna, ▶ eller mellanslag för att spela upp, Skift + ←/→ för en dag i taget.
  Adressen bär med vy och tid (`#/2?t=312`, timmar sedan dag 1 klockan 00:00), så att ett ögonblick går att dela.

Så läser man kartan och tidslinjen:

| | |
|---|---|
| Blått / orange | Par A / Par B |
| Mörk heldragen färg | De reser tillsammans (samma bil, samma tåg) |
| Blå och orange streck om vartannat | De reser tillsammans i två bilar (alternativ 4 och 6) |
| Streckat / prickat / finprickat | Bil / tåg / flyg |
| Vinrött | Béziers och vinavhämtningen |
| Snedstreckat fält i tidslinjen | Hemma |

Linjerna på kartan är **schematiska**: raka streck mellan ortsankare, inte körbara vägar.
Positionen mellan två orter är interpolerad längs linjen efter tid.

## Data

- [`data/frankrike-2027.json`](data/frankrike-2027.json) med schema [`data/frankrike-2027.schema.json`](data/frankrike-2027.schema.json) (JSON Schema 2020-12). Underlaget är skapat 2026-11-01.
- Tid anges som timmar sedan dag 1 klockan 00:00 (`at_hour = (dag - 1) * 24 + klockslag`). Varje alternativ har sin egen relativa dag 1, så jämförelsen gäller resdagar, inte kalenderdatum.
- Alternativens nummer följer ordningen i `scenarios`; id:na (`s1`–`s4`) är bara beteckningar. Alternativ 1 är underlagets förstaval (`recommendation.first_choice_scenario_id`), alltså `s2`.
- Alternativ 5 och 6 (`s5`, `s6`) är korta varianter av Flyg till Paris: ungefär en vecka tillsammans i stället för över två, med en gemensam hyrbil respektive en hyrbil var. De är byggda av etapper som redan finns i underlaget (vägen Paris–Clermont-Ferrand–Millau, Béziers–Beaune och Beaune–Paris), med korta etapper i vinområdet (Clermont-Ferrand–Faugères, Faugères–Saint-Chinian och Saint-Chinian–Béziers) som är egna uppskattningar, så sträckor och tider är lika grova som i övriga alternativ. Vinveckan är delad på tre baser (en natt i Faugères och i Saint-Chinian, två i Béziers). Schemat tillåter numera valfritt antal alternativ; tidigare krävdes exakt fyra.
- Planeringsreglerna är gruppens: helst en natt på samma ort och högst två där det finns något att se, och högst cirka 60 mil per körsträcka. Därför är vinvistelsen i alternativ 1–4 delad på flera byar (Saint-Chinian, Minerve, Faugères, Béziers) med två nätter i Béziers, och etapperna mellan byarna är egna uppskattningar. I alternativ 3 är dagen Frankfurt–Lyon (72 mil) delad på två med natt i Mulhouse, så A kommer till Nice en dag senare och paret har två nätter där i stället för tre. I alternativ 2 hämtas vinet i Faugères, på vägen norrut.
- Schemat kontrollerar bara struktur. Referenser, tidsspår, händelser och summor kontrollerades separat mot reglerna i `web_app_contract.validation_rules` när underlaget lades in (inga avvikelser). `npm test` täcker den logik som visualiseringen bygger på.
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
