# Frankrike 2027

Roadtrips i Frankrike sommaren 2027, visualiserade på karta och tidslinje så att vi kan prata om dem: fyra rutter, var och en på två sätt.
Par A åker från Stockholm och Par B har en lägenhet i Paris och en i Nice. På varje rutt kan man växla mellan att A kör egen bil från Sverige och möter B, eller att alla flyger och hyr en bil.
Allt är grova planeringsuppskattningar: inget är bokat och körsträckor och tider är egna bedömningar.

## Köra

```bash
npm start      # http://localhost:2027
npm test       # kontrollerar datalogiken mot data/frankrike-2027.json
```

Inga beroenden att installera. Sidan behöver internet för kartbiblioteket (Leaflet från cdnjs) och kartrutorna (OpenStreetMap).

## Vad man ser

- **Jämför**: en enda omkopplare överst (egen bil från Sverige eller flyg + hyrbil, med antal dagar) som gäller alla rutter, och ett kort per rutt med karta, tidsreglage och nyckeltal. Båda varianterna är ritade i förväg och bara visas eller döljs, så växlingen går direkt. Tidslinjer sida vid sida, jämförelsetabellen, teckenförklaringen och antagandena ligger i utfällbara avsnitt.
- **Rutt 1–4**: en egen omkopplare för just den rutten, stor karta (hela rutten eller bara Frankrike), tidslinje och dag för dag. Avvägningar, osäkerheter, fordon, vin och alternativa mötesplatser ligger i utfällbara avsnitt.
- **Längst på samma ort**: det längsta stoppet tillsammans visas i jämförelsetabellen. Mer än två nätter markeras rött (gränsen `STAY_LIMIT_NIGHTS` i `js/data.js`). Längsta kördag markeras på samma sätt om den är klart över 60 mil (`DRIVE_LIMIT_KM`, med några procents marginal så att Stockholm–Malmö går an).
- **Tid**: dra i reglaget överst, klicka eller dra i tidslinjerna, ▶ eller mellanslag för att spela upp, Skift + ←/→ för en dag i taget.
  Adressen bär med vy, tid och val (`#/2?t=312&v=bfbb`, timmar sedan dag 1 klockan 00:00 och en bokstav per rutt: b = egen bil, f = flyg + hyrbil), så att ett ögonblick och ett val går att dela.

Så läser man kartan och tidslinjen:

| | |
|---|---|
| Blått / orange | Par A / Par B |
| Mörk heldragen färg | De reser tillsammans (samma bil, samma tåg) |
| Blå och orange streck om vartannat | De reser tillsammans i två bilar (ingen rutt använder det just nu) |
| Streckat / prickat / finprickat | Bil / tåg / flyg |
| Vinrött | Béziers och vinavhämtningen |
| Snedstreckat fält i tidslinjen | Hemma |

Linjerna på kartan är **schematiska**: raka streck mellan ortsankare, inte körbara vägar.
Positionen mellan två orter är interpolerad längs linjen efter tid.

## Data

- [`data/frankrike-2027.json`](data/frankrike-2027.json) med schema [`data/frankrike-2027.schema.json`](data/frankrike-2027.schema.json) (JSON Schema 2020-12). Underlaget är skapat 2026-11-01 och gjordes om till roadtrips 2026-11-05.
- Tid anges som timmar sedan dag 1 klockan 00:00 (`at_hour = (dag - 1) * 24 + klockslag`). Varje alternativ har sin egen relativa dag 1, så jämförelsen gäller resdagar, inte kalenderdatum.
- Rutternas nummer följer ordningen av `route_id` i `scenarios`; id:na (`s1`–`s8`) är bara beteckningar. Det finns ingen "förstahandsrekommendation" i underlaget: gruppen väljer.
- Rutterna (varje rutt har två scenarier med samma stopp, `route_id` och `variant` = `own_car` eller `fly_rent`):
  1. **Franska Alperna** – Nice norrut över Bonette, Izoard, Galibier och Iseran till Chamonix och Annecy. Egen bil: B tar tåget hem från Annecy. Flyg: hyrbil från Nice och tillbaka dit.
  2. **Normandie, Bretagne och Loire** – Honfleur, Bayeux, Mont-Saint-Michel, Saint-Malo, Vannes och Amboise. Egen bil via Nederländerna och Belgien, möte i Rouen. Flyg: till Paris.
  3. **Atlantkusten och Pyrenéerna** – Bordeaux, Dune du Pilat, Biarritz och Pau. Egen bil förbi Paris, ungefär sex dagar ner och sex hem. Flyg: till Bordeaux.
  4. **Rivieran, Provence och Languedoc** – Nice, Verdon, Luberon, Camargue och Béziers, med vinbonus. Flyg: till Nice, vinet hem i bagage eller leverans.
- Gruppens utgångspunkter: en gemensam bil (inte två), A kör helst inte egen bil in i Paris, B äger en lägenhet i Paris och en i Nice (och kan börja i den ena och sluta i den andra), helst en natt på samma ort och högst två där det finns något att se, högst cirka 60 mil per körsträcka och ungefär en vecka tillsammans. B röstar för Atlantkusten; någon annan föredrar Medelhavskusten om ni åker tidigt.
- Sträckorna Stockholm–Frankfurt och Frankfurt–Lyon–Nice är desamma som i tidigare versioner; sträckorna inom Frankrike är egna uppskattningar (högalpina pass, bergsvägar och småvägar är långsammare än motorväg). Tågtider är bara ungefärliga restider.
- Schemat tillåter valfritt antal scenarier, `wine_plan` får vara `null` och varje scenario har `route_id` och `variant`. Blocket `recommendation` är borttaget.
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
