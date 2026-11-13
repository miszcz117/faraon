# Faraon

Przeglądarkowa gra o budowaniu piramidy: incremental z łańcuchem produkcji, w rzucie izometrycznym.

## Uruchomienie lokalnie

```bash
python3 -m http.server 8000
```

Potem `http://localhost:8000/dev.html`.

## Układ

- `index.html` – strona gry (znaczniki i style; publikowana jako artefakt, dlatego bez `<html>` i `<head>`)
- `dev.html` – ta sama strona opakowana w pełny dokument, do otwierania lokalnie
- `js/sim.js` – symulacja, czysta logika bez DOM; działa też w Node
- `js/gfx.js` – rzut, faktury, bloki, ludziki
- `js/scene.js` – układ doliny, kolejność rysowania, trafianie kliknięć
- `js/app.js` – panel, sterowanie, zapis, pętla gry
- `art/` – grafiki gry (WebP)
- `tools/process_art.py` – przerabia surowe obrazy na pliki z `art/`
- `tools/balance.js` – bot przechodzący jedno panowanie, do sprawdzania tempa: `node tools/balance.js 2`
