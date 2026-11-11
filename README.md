# UnumLocalia Viewer

A browser-based viewer for exploring spatial multi-omics on a single tissue section — H&E histology, multiplexed protein immunofluorescence (COMET) and spatial gene expression (Xenium) with cell segmentations, overlaid and explorable side by side. It runs entirely in the browser (desktop or phone): nothing to install, and your data never leaves your computer.

**▶ Open the viewer: https://felixillion.github.io/UnumLocalia-Viewer/**

The viewer is the companion to **[UnumLocalia](https://github.com/Felixillion/UnumLocalia)**, the Python toolkit (napari GUI and Python API) for visualising, exploring and quantifying multimodal spatial biology data. This repository holds only the web viewer and its demo dataset, so installing UnumLocalia doesn't download ~150 MB of demo data.

## Using it

- **Demo** — loads the example dataset in this repository (`data/`), streamed on demand: each gene or protein layer is only downloaded when you switch it on.
- **Your own data** — choose a `.ulviewer` (or `.zip`) file exported from UnumLocalia. It is opened locally in your browser and is not uploaded anywhere.
- **Layers** — adjust H&E opacity; show cell outlines (colour, thickness, opacity, cell selection); add protein channels and gene transcript maps from the side panels.
- **Screenshot** — save the current view as an image.

## Demo dataset

`data/` contains one tissue core (`core01_hcc`) prepared with the UnumLocalia exporter:

| Path | Contents |
|---|---|
| `data/metadata.json` | Image sizes, pixel sizes and the list of available layers |
| `data/images/he.webp` | H&E image |
| `data/proteins/*.webp` | 16 COMET protein channels (e.g. DAPI, CD45, CK8, E-Cadherin, vimentin, αSMA) |
| `data/genes/*.json.gz` | Transcript positions for ~5,000 Xenium genes (one compressed file per gene) |
| `data/segmentations/xenium_cells.json.gz` | Cell segmentation outlines |

## How it's hosted

This is a plain static site served by **GitHub Pages** (Settings → Pages → *Deploy from a branch* → `main` / `(root)`). There is no build step — the `.nojekyll` file tells GitHub to serve the files exactly as they are. Pages redeploys automatically whenever this repository changes.

```
index.html     the viewer page
main.js        viewer logic (OpenSeadragon for the image, pako for .gz, JSZip for .ulviewer files — loaded from CDNs)
styles.css     layout (desktop sidebar / phone tabs)
favicon.png
data/          demo dataset (loaded with relative paths, so the viewer works from any address)
```

To run it locally: `python3 -m http.server` in this folder, then open http://localhost:8000 (opening `index.html` directly from disk won't load the demo data).

Visits are counted with [GoatCounter](https://www.goatcounter.com/) (privacy-friendly, no cookies).

## Author

Felix Marsh-Wakefield — [felixillion.github.io](https://felixillion.github.io) · [UnumLocalia](https://github.com/Felixillion/UnumLocalia)
