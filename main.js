// .ulviewer load
let loadedZip = null;

// .ulviewer streamed from a web link (only the parts needed are downloaded)
let remoteZip = null;

// Folder inside the zip that holds metadata.json ("" unless the zip wraps everything in a folder)
let zipPrefix = "";

// Link the current dataset was loaded from (if any)
let currentDataLink = null;

// Whole linked file, once it has been downloaded (kept so it can be saved to disk)
let downloadedBlob = null;

// Metadata
let metadata = null;
let metadataFileHandle = null;

// H&E
let heOpacity = 1.0;

// Segmentation data
let segmentationData = [];
let segmentationVisible = true;
let segmentationColor = "#00ffff";
let segmentationThickness = 0.5;
let segmentationOpacity = 1.0;
let cellSelectionEnabled = false;

// Genes
let geneLayers = {};

let overlayCanvas = null;
let overlayCtx = null;

let datasetRoot = "";

// Proteins
let proteinLayers = {};
let proteinOpacity = 0.8;
let proteinCanvas = null;

// CLUSTERS (disabled for now): remove the "// " from these lines to bring cell fills back
// // Cell fills (clusters / annotations)
// let cellAnnotations = {};      // name -> Map(cell_id -> label), or a file path still to be loaded
// let activeAnnotation = "";     // name of the annotation used to fill cells ("" = no fill)
// let cellLabels = [];           // label for each cell in segmentationData (active annotation)
// let clusterColors = {};        // label -> colour (active annotation)
// let clusterCounts = {};        // label -> number of cells (active annotation)
// let hiddenClusters = new Set();
// let cellFillOpacity = 0.5;

// Cell info
let selectedCell = null;
let hoveredCell = null;
let activeGene = null;

// Visibility states (to do with screenshot)
let showGenes = true;
let showProteins = true;
let showSegs = true;
let showHELayer = true;
let showScaleBar = true;


// Dropzone for dragging file
const dropZone =
    document.getElementById(
        "dropZone"
    );

// Screenshot
const saveScreenshotBtn =
    document.getElementById(
        "saveScreenshotBtn"
    );

// Export sections
const exportHE =
    document.getElementById(
        "exportHE"
    );

const exportGenes =
    document.getElementById(
        "exportGenes"
    );

const exportProteins =
    document.getElementById(
        "exportProteins"
    );

const exportSegs =
    document.getElementById(
        "exportSegs"
    );

const exportScaleBar =
    document.getElementById(
        "exportScaleBar"
    );

const exportCellInfo =
    document.getElementById(
        "exportCellInfo"
    );

// H&E opacity
const heOpacitySlider =
    document.getElementById(
        "heOpacity"
    );

// Default protein colours
const DEFAULT_PROTEIN_COLORS = [
    "#00ff00", // green
    "#ff0000", // red
    "#00ffff", // cyan
    "#ffff00", // yellow
    "#ff00ff", // magenta
    "#ffffff"  // white
];

// Default gene colours
const DEFAULT_GENE_COLORS = [
    "#ff00ff",
    "#00ffff",
    "#ffff00",
    "#ff8800",
    "#ffffff"
];

const infoBox =
    document.getElementById(
        "info"
    );

// Populate gene dropdown
const geneList =
    document.getElementById(
        "geneList"
    );

// Gene search
const geneSearch =
    document.getElementById(
        "geneSearch"
    );    

// Proteins
const proteinList =
    document.getElementById(
        "proteinList"
    );

const proteinSearch =
    document.getElementById(
        "proteinSearch"
    );

const proteinOpacitySlider =
    document.getElementById(
        "proteinOpacity"
    );

const loadedProteinsDiv =
    document.getElementById(
        "loadedProteins"
    );

const loadedGenesDiv =
    document.getElementById(
        "loadedGenes"
    );

// Cell info
const cellInfo =
    document.getElementById(
        "cellInfoPanel"
    );

// Cell info selection
const enableCellSelection =
    document.getElementById(
        "enableCellSelection"
    );

// Update button text
const btn =
    document.getElementById(
        "toggleLayersBtn"
    );


let allGenes = [];
let allProteins = [];

let viewer = null;
let heImage = null;


// Load data
async function loadUlviewer(file) {
    loadedZip =
        await JSZip.loadAsync(
            file
        );

    remoteZip = null;

    datasetRoot = "";

    clearDataLink();

    // Allow for zips that wrap the dataset in a folder
    zipPrefix =
        findZipPrefix(
            Object.keys(
                loadedZip.files
            )
        );

    const metadataText =
        await loadedZip
            .file(zipPrefix + "metadata.json")
            .async("string");

    metadata =
        JSON.parse(
            metadataText
        );

    await initialiseDataset();

    // Mobile-specific conditions
    if (
        window.innerWidth <= 768
    ) {

        showMobileTopSection(
            "displaySection"
        );
    }

    // Count number of times custom dataset is loaded
    window.goatcounter?.count({
        path: "event/custom-loaded",
        title: "Custom Dataset Loaded"
    });
}


async function initialiseDataset() {
    geneList.innerHTML = "";
    proteinList.innerHTML = "";

    // Datasets without one of the modalities
    metadata.genes = metadata.genes || {};
    metadata.proteins = metadata.proteins || {};
    metadata.segmentations = metadata.segmentations || {};

    // Clear anything left over from a previously loaded dataset
    resetDatasetState();

    allGenes =
        Object.keys(
            metadata.genes
        ).sort();

    allProteins =
        Object.keys(
            metadata.proteins
        ).sort();

    renderGeneList();

    renderProteinList();

    infoBox.textContent =
        `Core: ${metadata.core}
        Version: ${metadata.export_version}
        Genes: ${Object.keys(metadata.genes).length}
        Proteins: ${Object.keys(metadata.proteins).length}
        Segmentations: ${Object.keys(metadata.segmentations).length}`;

    const heBlob =
        await getBlob(
            metadata.image.file
        );

    const imageURL =
        URL.createObjectURL(
            heBlob
        );

    heImage =
        new Image();

    heImage.src =
        imageURL;

    if (viewer) {
        viewer.destroy();

        // Its overlay canvas went with it; a new one is made when the image opens
        overlayCanvas = null;
        overlayCtx = null;
    }

    viewer =
        OpenSeadragon({

            id: "viewer",

            prefixUrl:
                "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/5.0.1/images/",

            tileSources: {
                type: "image",
                url: imageURL
            }
        });

    viewer.addHandler(
        "open",
        setupOverlay
    );

    document
        .getElementById(
            "mobileDisplayTab"
        )
        .style.display = "block";

    document
        .getElementById(
            "mobileScreenshotTab"
        )
        .style.display = "block";
}


// Blob loader
async function getBlob(path) {

    if (remoteZip) {

        return new Blob([
            await remoteZip.read(path)
        ]);
    }

    if (loadedZip) {

        return await loadedZip
            .file(zipPrefix + path)
            .async("blob");
    }

    const response =
        await fetch(
            `${datasetRoot}/${path}`
        );

    return await response.blob();
}


// Gzip loader
async function getCompressedFile(path) {

    if (remoteZip) {

        return await remoteZip.read(path);
    }

    if (loadedZip) {

        return await loadedZip
            .file(zipPrefix + path)
            .async(
                "uint8array"
            );
    }

    const response =
        await fetch(
            `${datasetRoot}/${path}`
        );

    return new Uint8Array(
        await response.arrayBuffer()
    );
}


function setupOverlay() {

    const container =
        viewer.canvas;

    overlayCanvas =
        document.createElement(
            "canvas"
        );

    overlayCanvas.className =
        "overlay-canvas";

    container.appendChild(
        overlayCanvas
    );

    overlayCtx =
        overlayCanvas.getContext(
            "2d",
            {
                willReadFrequently: true,
            }
        );

    resizeOverlayCanvas();
    updateOverlay();

    viewer.addHandler(
        "viewport-change",
        updateOverlay
    );

    viewer.addHandler(
        "resize",
        () => {
            resizeOverlayCanvas();
            updateOverlay();
        }
    );

    // Cell info
    viewer.addHandler(
        "canvas-click",
        onViewerClick
    );

    // Mouse tracking
    viewer.container.addEventListener(
        "mousemove",
        onViewerMove
    );
}


function clearCanvas() {

    if (!overlayCanvas) {
        return;
    }

    overlayCtx.clearRect(
        0,
        0,
        overlayCanvas.width,
        overlayCanvas.height
    );
}


function resizeOverlayCanvas() {
    const rect =
        viewer.canvas.getBoundingClientRect();

    overlayCanvas.width =
        rect.width;

    overlayCanvas.height =
        rect.height;
}


// Save screenshot
function saveScreenshot() {

    if (!heImage) {
        return;
    }

    const canvas =
        document.createElement(
            "canvas"
        );

    canvas.width =
        overlayCanvas.width;

    canvas.height =
        overlayCanvas.height;

    const exportCtx =
        canvas.getContext(
            "2d"
        );

    // Black background
    exportCtx.fillStyle =
        "black";

    exportCtx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    // H&E with current opacity
    if (
        exportHE.checked
    ) {

        exportCtx.globalAlpha =
            heOpacity;

        exportCtx.drawImage(
            viewer.drawer.canvas,
            0,
            0,
            canvas.width,
            canvas.height
        );

        exportCtx.globalAlpha =
            1;
    }

    // Overlay
    if (
        exportProteins.checked
    ) {

        drawProteinsToContext(
            exportCtx
        );
    }

    if (
        exportSegs.checked
    ) {

        drawSegmentationsToContext(
            exportCtx
        );
    }

    if (
        exportGenes.checked
    ) {

        drawGenesToContext(
            exportCtx
        );
    }

    // CLUSTERS (disabled for now)
    // // Cluster legend (when cells are filled by cluster)
    // if (
    //     exportSegs.checked
    // ) {
    //
    //     drawClusterLegendToContext(
    //         exportCtx
    //     );
    // }

    // Scale bar
    if (
        exportScaleBar.checked
    ) {

        drawScaleBar(
            exportCtx
        );
    }

    const link =
        document.createElement(
            "a"
        );

    link.download =
        "ulviewer_screenshot.png";

    link.href =
        canvas.toDataURL(
            "image/png"
        );

    link.click();

    // Count number of exported screenshots
    window.goatcounter?.count({
        path: "event/screenshot-export",
        title: "Screenshot Export"
    });
}


// Screenshot genes
function drawGenesToContext(targetCtx) {

    for (
        const geneName
        in geneLayers
    ) {

        const layer =
            geneLayers[
                geneName
            ];

        targetCtx.fillStyle =
            layer.color;

        for (
            const pt
            of layer.points
        ) {

            const vp =
                viewer.viewport.imageToViewerElementCoordinates(
                    new OpenSeadragon.Point(
                        pt.x,
                        pt.y
                    )
                );

            targetCtx.beginPath();

            targetCtx.arc(
                vp.x,
                vp.y,
                layer.size,
                0,
                2 * Math.PI
            );

            targetCtx.fill();
        }
    }
}


// Screenshot segmentations
function drawSegmentationsToContext(targetCtx) {

    // CLUSTERS (disabled for now)
    // drawCellFills(targetCtx);

    for (
        const cell
        of segmentationData
    ) {

        // Don't screenshot selected cell
        const isSelected =
            false;
        // Don't screenshot hovered cell
        const isHovered =
            false;

        targetCtx.strokeStyle =
            hexToRgba(
                segmentationColor,
                segmentationOpacity
            );

        targetCtx.lineWidth =
            segmentationThickness;

        targetCtx.beginPath();

        cell.vertices.forEach(
            (pt, idx) => {

                const vp =
                    viewer.viewport.imageToViewerElementCoordinates(
                        new OpenSeadragon.Point(
                            pt[0],
                            pt[1]
                        )
                    );

                if (
                    idx === 0
                ) {

                    targetCtx.moveTo(
                        vp.x,
                        vp.y
                    );

                } else {

                    targetCtx.lineTo(
                        vp.x,
                        vp.y
                    );
                }
            }
        );

        targetCtx.closePath();

        targetCtx.stroke();
    }
}


// Screenshot proteins
function drawProteinsToContext(targetCtx) {

    for (
        const marker
        in proteinLayers
    ) {

        const layer =
            proteinLayers[marker];

        if (!layer.cachedCanvas) {
            continue;
        }

        const topLeft =
            viewer.viewport.imageToViewerElementCoordinates(
                new OpenSeadragon.Point(
                    0,
                    0
                )
            );

        const bottomRight =
            viewer.viewport.imageToViewerElementCoordinates(
                new OpenSeadragon.Point(
                    metadata.image.width,
                    metadata.image.height
                )
            );

        const width =
            bottomRight.x -
            topLeft.x;

        const height =
            bottomRight.y -
            topLeft.y;

        targetCtx.globalCompositeOperation =
            "lighter";

        targetCtx.globalAlpha =
            layer.opacity;

        targetCtx.drawImage(
            layer.cachedCanvas,
            topLeft.x,
            topLeft.y,
            width,
            height
        );

        targetCtx.globalCompositeOperation =
            "source-over";

        targetCtx.globalAlpha =
            1;
    }
}


// Get scale length
function getNiceScaleBarLength(visibleWidthUm) {

    const target =
        visibleWidthUm * 0.2;

    const choices = [
        10,
        20,
        25,
        50,
        75,
        100,
        200,
        250,
        500,
        1000,
        2000,
        5000
    ];

    for (
        const choice
        of choices
    ) {

        if (
            choice >= target
        ) {

            return choice;
        }
    }

    return choices[
        choices.length - 1
    ];
}


// Scale bar
function drawScaleBar(ctx) {

    if (
        !metadata ||
        !metadata.web_pixel_size_um
    ) {
        return;
    }

    const bounds =
        viewer.viewport.getBounds();

    const topLeft =
        viewer.viewport.viewportToImageCoordinates(
            bounds.getTopLeft()
        );

    const bottomRight =
        viewer.viewport.viewportToImageCoordinates(
            bounds.getBottomRight()
        );

    const visibleWidthPixels =
        Math.abs(
            bottomRight.x -
            topLeft.x
        );

    const visibleWidthUm =
        visibleWidthPixels *
        metadata.web_pixel_size_um;

    const barUm =
        getNiceScaleBarLength(
            visibleWidthUm
        );

    const barImagePixels =
        barUm /
        metadata.web_pixel_size_um;

    const p1 =
        viewer.viewport.imageToViewerElementCoordinates(
            new OpenSeadragon.Point(
                0,
                0
            )
        );

    const p2 =
        viewer.viewport.imageToViewerElementCoordinates(
            new OpenSeadragon.Point(
                barImagePixels,
                0
            )
        );

    const barScreenPixels =
        p2.x - p1.x;

    const margin = 40;

    const x2 =
        ctx.canvas.width -
        margin;

    const x1 =
        x2 -
        barScreenPixels;

    const y =
        ctx.canvas.height -
        margin;

    let label;

    if (
        barUm >= 1000
    ) {

        label =
            `${barUm / 1000} mm`;

    } else {

        label =
            `${barUm} µm`;
    }


    // Black outline

    ctx.strokeStyle =
        "black";

    ctx.lineWidth = 10;

    ctx.beginPath();

    ctx.moveTo(
        x1,
        y
    );

    ctx.lineTo(
        x2,
        y
    );

    ctx.stroke();

    // White bar

    ctx.strokeStyle =
        "white";

    ctx.lineWidth = 6;

    ctx.beginPath();

    ctx.moveTo(
        x1,
        y
    );

    ctx.lineTo(
        x2,
        y
    );

    ctx.stroke();

    // Text

    ctx.font =
        "22px Arial";

    ctx.textAlign =
        "left";

    ctx.lineWidth = 4;

    ctx.strokeStyle =
        "black";

    ctx.strokeText(
        label,
        x1,
        y - 15
    );

    ctx.fillStyle =
        "white";

    ctx.fillText(
        label,
        x1,
        y - 15
    );
}


function drawSegmentations(ctx) {

    // CLUSTERS (disabled for now)
    // drawCellFills(overlayCtx);

    for (
        const cell
        of segmentationData
    ) {

        const isSelected =
            selectedCell === cell;

        const isHovered =
            hoveredCell === cell;

        if (isSelected) {

            overlayCtx.strokeStyle =
                "#ffff00";

            overlayCtx.lineWidth = 3;

        } else if (isHovered) {

            overlayCtx.strokeStyle =
                "#ff8800";

            overlayCtx.lineWidth = 2;

        } else {

            overlayCtx.strokeStyle =
                hexToRgba(
                    segmentationColor,
                    segmentationOpacity
                );

            overlayCtx.lineWidth = segmentationThickness;
        }

        const vertices =
            cell.vertices;

        if (!vertices.length) {
            continue;
        }

        overlayCtx.beginPath();

        vertices.forEach(
            (pt, idx) => {

                const vp =
                    viewer.viewport.imageToViewerElementCoordinates(
                        new OpenSeadragon.Point(
                            pt[0],
                            pt[1]
                        )
                    );

                if (idx === 0) {

                    overlayCtx.moveTo(
                        vp.x,
                        vp.y
                    );

                } else {

                    overlayCtx.lineTo(
                        vp.x,
                        vp.y
                    );
                }
            }
        );

        overlayCtx.closePath();

        overlayCtx.stroke();
    }
}


// Segmentation opacity
function hexToRgba(hex, alpha) {

    const r =
        parseInt(
            hex.substring(1, 3),
            16
        );

    const g =
        parseInt(
            hex.substring(3, 5),
            16
        );

    const b =
        parseInt(
            hex.substring(5, 7),
            16
        );

    return `rgba(
        ${r},
        ${g},
        ${b},
        ${alpha}
    )`;
}


function drawGenes(ctx) {

    for (
        const geneName
        in geneLayers
    ) {

        const layer =
            geneLayers[
                geneName
            ];

        const points =
            layer.points;

        overlayCtx.fillStyle =
            layer.color;

        for (
            const pt
            of points
        ) {

            const vp =
                viewer.viewport.imageToViewerElementCoordinates(
                    new OpenSeadragon.Point(
                        pt.x,
                        pt.y
                    )
                );

            overlayCtx.beginPath();

            overlayCtx.arc(
                vp.x,
                vp.y,
                layer.size,
                0,
                2 * Math.PI
            );

            overlayCtx.fill();
        }
    }
}


// Draw function
function updateOverlay() {

    if (!overlayCanvas) {
        return;
    }

    clearCanvas();

    // Proteins
    if (showProteins) {
        drawProteins();
    }

    // Segmentations
    if (
        segmentationVisible &&
        showSegs
    ) {
        drawSegmentations();
    }

    // Genes
    if (showGenes) {
        drawGenes();
    }

    // Scale bar
    if (
        showScaleBar
    ) {

        drawScaleBar(
            overlayCtx
        );
    }
}


// Draw protein
function drawProteinLayer(layer) {

    if (
        !layer.cachedCanvas
    ) {
        return;
    }

    const topLeft =
        viewer.viewport.imageToViewerElementCoordinates(
            new OpenSeadragon.Point(
                0,
                0
            )
        );

    const bottomRight =
        viewer.viewport.imageToViewerElementCoordinates(
            new OpenSeadragon.Point(
                metadata.image.width,
                metadata.image.height
            )
        );

    const width =
        bottomRight.x - topLeft.x;

    const height =
        bottomRight.y - topLeft.y;

    overlayCtx.globalCompositeOperation =
        "lighter";

    overlayCtx.globalAlpha =
        layer.opacity;

    overlayCtx.drawImage(
        layer.cachedCanvas,
        topLeft.x,
        topLeft.y,
        width,
        height
    );

    overlayCtx.globalCompositeOperation =
        "source-over";

    overlayCtx.globalAlpha =
        1;
}


// Draw proteins
function drawProteins(ctx) {

    for (
        const marker
        in proteinLayers
    ) {

        const layer =
            proteinLayers[marker];

        drawProteinLayer(
            layer
        );
    }
}


// Rebuild proteins
function rebuildProteinCache(layer) {

    const canvas =
        document.createElement("canvas");

    canvas.width =
        layer.image.width;

    canvas.height =
        layer.image.height;

    const ctx =
        canvas.getContext("2d");

    ctx.drawImage(
        layer.image,
        0,
        0
    );

    const imageData =
        ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
        );

    const data =
        imageData.data;

    const hex =
        layer.color.replace("#", "");

    const r =
        parseInt(
            hex.substring(0, 2),
            16
        );

    const g =
        parseInt(
            hex.substring(2, 4),
            16
        );

    const b =
        parseInt(
            hex.substring(4, 6),
            16
        );

    for (
        let i = 0;
        i < data.length;
        i += 4
    ) {

        const intensity =
            data[i];

        if (
            intensity < layer.threshold
        ) {

            data[i + 3] = 0;

        } else {

            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = intensity;
        }
    }

    ctx.putImageData(
        imageData,
        0,
        0
    );

    layer.cachedCanvas =
        canvas;
}


// Active layers
function refreshActiveLayers() {

    // Keep the cell info panel in step with the loaded layers
    if (selectedCell) {
        renderCellInfo(selectedCell);
    }

    const activeProteins =
        document.getElementById(
            "activeProteins"
        );

    const activeGenes =
        document.getElementById(
            "activeGenes"
        );

    activeProteins.innerHTML = "";
    activeGenes.innerHTML = "";

    // Genes
    for (
        const gene
        in geneLayers
    ) {

        const chip =
            document.createElement(
                "div"
            );

        chip.className =
            "layer-chip gene-chip";

        chip.innerHTML = `
            <span
                class="chip-colour"
                style="
                    background:
                    ${geneLayers[gene].color}
                "
            ></span>

            ${gene}
        `;

        activeGenes.appendChild(
            chip
        );
    }

    // Proteins
    for (
        const protein
        in proteinLayers
    ) {

        const chip =
            document.createElement(
                "div"
            );

        chip.className =
            "layer-chip protein-chip";

        chip.innerHTML = `
            <span
                class="chip-colour"
                style="
                    background:
                    ${proteinLayers[protein].color}
                "
            ></span>

            ${protein}
        `;

        activeProteins.appendChild(
            chip
        );
    }
}


// Protein UI
function refreshProteinUI() {

    loadedProteinsDiv.innerHTML = "";

    for (
        const marker
        in proteinLayers
    ) {

        const layer =
            proteinLayers[marker];

        const row =
            document.createElement(
                "div"
            );

        row.style.marginBottom =
            "10px";

        row.innerHTML = `
            <strong>${marker}</strong>

            <button
                data-marker="${marker}"
                class="remove-protein"
            >
                X
            </button>

            Colour<br>

            <input
                type="color"
                value="${layer.color}"
                data-marker="${marker}"
                class="protein-color"
            >

            <br>

            Opacity<br>

            <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value="${layer.opacity}"
                data-marker="${marker}"
                class="protein-opacity"
            >

            <br>

            Threshold<br>

            <input
                type="range"
                min="0"
                max="255"
                value="${layer.threshold}"
                data-marker="${marker}"
                class="protein-threshold"
            >
        `;

        loadedProteinsDiv.appendChild(
            row
        );
    }

    attachProteinControlEvents();
}


// Protein list renderer
function renderProteinList(filter = "") {

    proteinList.innerHTML = "";

    allProteins
        .filter(
            protein =>
                protein
                .toLowerCase()
                .includes(
                    filter.toLowerCase()
                )
        )
        .forEach(
            protein => {

                const row =
                    document.createElement("div");

                row.className =
                    "search-row";

                row.innerHTML = `
                    <label>
                        <input
                            type="checkbox"
                            data-protein="${protein}"
                            ${
                                proteinLayers[protein]
                                ? "checked"
                                : ""
                            }
                        >
                        ${protein}
                    </label>
                `;

                proteinList.appendChild(row);
            }
        );

    attachProteinCheckboxEvents();
}


// Protein colours
function getUnusedProteinColor() {

    const used =
        Object.values(
            proteinLayers
        )
        .map(
            layer => layer.color
        );

    const free =
        DEFAULT_PROTEIN_COLORS.find(
            color =>
                !used.includes(
                    color
                )
        );

    return free ??
        DEFAULT_PROTEIN_COLORS[0];
}


// Attach proteins
function attachProteinCheckboxEvents() {

    document
        .querySelectorAll(
            "#proteinList input[type='checkbox']"
        )
        .forEach(
            checkbox => {

                checkbox.addEventListener(
                    "change",
                    async () => {

                        const marker =
                            checkbox.dataset.protein;

                        if (
                            checkbox.checked
                        ) {

                            if (
                                proteinLayers[marker]
                            ) {
                                return;
                            }

                            const proteinPath =
                                metadata.proteins[
                                    marker
                                ].file;

                            const img =
                                new Image();

                            img.onload = () => {

                                proteinLayers[marker] = {
                                    image: img,
                                    color: getUnusedProteinColor(),
                                    opacity: proteinOpacity,
                                    threshold: 0,
                                    cachedCanvas: null
                                };

                                rebuildProteinCache(
                                    proteinLayers[marker]
                                );

                                proteinCanvas =
                                    document.createElement(
                                        "canvas"
                                    );

                                proteinCanvas.width =
                                    img.width;

                                proteinCanvas.height =
                                    img.height;

                                refreshProteinUI();
                                refreshActiveLayers();
                                updateOverlay();
                            };

                            const blob =
                                await getBlob(
                                    proteinPath
                                );

                            img.src =
                                URL.createObjectURL(
                                    blob
                                );

                        } else {

                            delete proteinLayers[
                                marker
                            ];

                            refreshProteinUI();
                            refreshActiveLayers();
                            updateOverlay();
                        }
                    }
                );
            }
        );
}


// Handle colour/opacity changes
function attachProteinControlEvents() {

    document
        .querySelectorAll(
            ".protein-color"
        )
        .forEach(
            picker => {

                picker.addEventListener(
                    "input",
                    () => {

                        const marker =
                            picker.dataset.marker;

                        proteinLayers[marker].color =
                            picker.value;

                        rebuildProteinCache(
                            proteinLayers[marker]
                        );

                        refreshActiveLayers();

                        updateOverlay();
                    }
                );
            }
        );

    document
        .querySelectorAll(
            ".protein-opacity"
        )
        .forEach(
            slider => {

                slider.addEventListener(
                    "input",
                    () => {

                        const marker =
                            slider.dataset.marker;

                        proteinLayers[marker].opacity =
                            parseFloat(
                                slider.value
                            );

                        updateOverlay();
                    }
                );
            }
        );

    document
        .querySelectorAll(
            ".protein-threshold"
        )
        .forEach(
            slider => {

                slider.addEventListener(
                    "input",
                    () => {

                        const marker =
                            slider.dataset.marker;

                        proteinLayers[marker].threshold =
                            parseInt(
                                slider.value
                            );

                        rebuildProteinCache(
                            proteinLayers[marker]
                        );

                        updateOverlay();
                    }
                );
            }
        );

    // Remove proteins individually
    document
        .querySelectorAll(
            ".remove-protein"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const marker =
                            button.dataset.marker;

                        delete proteinLayers[marker];

                        refreshProteinUI();
                        refreshActiveLayers();
                        renderProteinList(proteinSearch.value);
                        updateOverlay();
                    }
                );
            }
        );
}


// Convert click to image coordinates
function onViewerClick(event) {

    if (!cellSelectionEnabled) {
        return;
    }

    const viewportPoint =
        viewer.viewport.pointFromPixel(
            event.position
        );

    const imagePoint =
        viewer.viewport.viewportToImageCoordinates(
            viewportPoint
        );

    selectCellAtPoint(
        imagePoint.x,
        imagePoint.y
    );
}


// Point-in-polygon test
function pointInPolygon(x, y, vertices) {

    let inside =
        false;

    for (
        let i = 0,
        j = vertices.length - 1;
        i < vertices.length;
        j = i++
    ) {

        const xi =
            vertices[i][0];

        const yi =
            vertices[i][1];

        const xj =
            vertices[j][0];

        const yj =
            vertices[j][1];

        const intersect =
            (
                (yi > y) !==
                (yj > y)
            )
            &&
            (
                x <
                (
                    (xj - xi) *
                    (y - yi)
                ) /
                (
                    yj - yi
                ) +
                xi
            );

        if (
            intersect
        ) {

            inside =
                !inside;
        }
    }

    return inside;
}


// Select a cell
function selectCellAtPoint(x, y) {

    for (
        const cell
        of segmentationData
    ) {

        if (
            pointInPolygon(
                x,
                y,
                cell.vertices
            )
        ) {

            selectedCell =
                cell;

            // Selected cell information panel
            renderCellInfo(cell);

            cellInfo.style.display =
                "block";

            updateOverlay();

            return;
        }
    }

    selectedCell = null;

    cellInfo.textContent =
        "No cell selected";

    cellInfo.style.display =
        "none";

    updateOverlay();
}


// Mouse position
function onViewerMove(event) {

    if (!cellSelectionEnabled) {
        return;
    }

    const rect =
        viewer.container.getBoundingClientRect();

    const pixelPoint =
        new OpenSeadragon.Point(
            event.clientX - rect.left,
            event.clientY - rect.top
        );

    const viewportPoint =
        viewer.viewport.pointFromPixel(
            pixelPoint
        );

    const imagePoint =
        viewer.viewport.viewportToImageCoordinates(
            viewportPoint
        );

    updateHoveredCell(
        imagePoint.x,
        imagePoint.y
    );
}


// Find hovered cell
function updateHoveredCell(x, y) {

    let newHoveredCell =
        null;

    for (
        const cell
        of segmentationData
    ) {

        if (
            pointInPolygon(
                x,
                y,
                cell.vertices
            )
        ) {

            newHoveredCell =
                cell;

            break;
        }
    }

    if (
        hoveredCell !==
        newHoveredCell
    ) {

        hoveredCell =
            newHoveredCell;

        updateOverlay();
    }
}


// Cell area
function calculatePolygonArea(vertices) {

    let area = 0;

    for (
        let i = 0;
        i < vertices.length;
        i++
    ) {

        const j =
            (
                i + 1
            ) %
            vertices.length;

        area +=
            vertices[i][0] *
            vertices[j][1];

        area -=
            vertices[j][0] *
            vertices[i][1];
    }

    return Math.abs(
        area / 2
    );
}


// Cell centroid
function calculateCentroid(vertices) {

    let x = 0;
    let y = 0;

    for (
        const vertex
        of vertices
    ) {

        x += vertex[0];
        y += vertex[1];
    }

    return {

        x:
            x /
            vertices.length,

        y:
            y /
            vertices.length
    };
}


// Gene counts in cell
function countGenesInCell(cell) {

    const counts = {};

    for (
        const geneName
        in geneLayers
    ) {

        let count = 0;

        const points =
            geneLayers[
                geneName
            ].points;

        for (
            const point
            of points
        ) {

            if (
                pointInPolygon(
                    point.x,
                    point.y,
                    cell.vertices
                )
            ) {

                count++;
            }
        }

        counts[
            geneName
        ] = count;
    }

    return counts;
}


// Gene UI
function refreshGeneUI() {

    loadedGenesDiv.innerHTML = "";

    for (
        const geneName
        in geneLayers
    ) {

        const layer =
            geneLayers[
                geneName
            ];

        const row =
            document.createElement(
                "div"
            );

        row.style.marginBottom =
            "10px";

        row.innerHTML = `
            <strong>${geneName}</strong>

            <button
                data-gene="${geneName}"
                class="remove-gene"
            >
                X
            </button>

            <br>

            Colour

            <br>

            <input
                type="color"
                value="${layer.color}"
                data-gene="${geneName}"
                class="gene-color"
            >

            <br>

            Dot Size

            <br>

            <input
                type="range"
                min="1"
                max="20"
                value="${layer.size}"
                data-gene="${geneName}"
                class="gene-size"
            >
        `;

        loadedGenesDiv.appendChild(
            row
        );
    }

    attachGeneControlEvents();
}


// Gene list renderer
function renderGeneList(filter = "") {

    geneList.innerHTML = "";

    allGenes
        .filter(
            gene =>
                gene
                .toLowerCase()
                .includes(
                    filter.toLowerCase()
                )
        )
        .forEach(
            gene => {

                const row =
                    document.createElement("div");

                row.className =
                    "search-row";

                row.innerHTML = `
                    <label>
                        <input
                            type="checkbox"
                            data-gene="${gene}"
                            ${
                                geneLayers[gene]
                                ? "checked"
                                : ""
                            }
                        >
                        ${gene}
                    </label>
                `;

                geneList.appendChild(row);
            }
        );

    attachGeneCheckboxEvents();
}


// Attach genes
function attachGeneCheckboxEvents() {

    document
        .querySelectorAll(
            "#geneList input[type='checkbox']"
        )
        .forEach(
            checkbox => {

                checkbox.addEventListener(
                    "change",
                    async () => {

                        const geneName =
                            checkbox.dataset.gene;

                        if (
                            checkbox.checked
                        ) {

                            if (
                                geneLayers[geneName]
                            ) {
                                return;
                            }

                            const filename =
                                metadata.genes[
                                    geneName
                                ];

                            const compressed =
                                await getCompressedFile(
                                    `genes/${filename}`
                                );

                            const jsonText =
                                pako.inflate(
                                    compressed,
                                    {
                                        to: "string"
                                    }
                                );

                            geneLayers[geneName] = {

                                points:
                                    JSON.parse(jsonText),

                                color:
                                    getUnusedGeneColor(),

                                size: 3
                            };

                        } else {

                            delete geneLayers[
                                geneName
                            ];
                        }

                        refreshGeneUI();
                        refreshActiveLayers();
                        updateOverlay();
                    }
                );
            }
        );
}


// Gene colours
function getUnusedGeneColor() {

    const used =
        Object.values(
            geneLayers
        )
        .map(
            layer => layer.color
        );

    const free =
        DEFAULT_GENE_COLORS.find(
            color =>
                !used.includes(
                    color
                )
        );

    return free ??
        DEFAULT_GENE_COLORS[0];
}


// Remove genes
function attachGeneControlEvents() {

    document
        .querySelectorAll(
            ".gene-color"
        )
        .forEach(
            picker => {

                picker.addEventListener(
                    "input",
                    () => {

                        const gene =
                            picker.dataset.gene;

                        geneLayers[gene].color =
                            picker.value;

                        refreshActiveLayers();
                        updateOverlay();
                    }
                );
            }
        );

    document
        .querySelectorAll(
            ".gene-size"
        )
        .forEach(
            slider => {

                slider.addEventListener(
                    "input",
                    () => {

                        const gene =
                            slider.dataset.gene;

                        geneLayers[gene].size =
                            parseInt(
                                slider.value
                            );

                        console.log(
                            gene,
                            geneLayers[
                                gene
                            ].size
                        );

                        updateOverlay();
                    }
                );
            }
        );

    document
        .querySelectorAll(
            ".remove-gene"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const gene =
                            button.dataset.gene;

                        delete geneLayers[gene];

                        refreshGeneUI();
                        refreshActiveLayers();
                        renderGeneList(geneSearch.value);
                        updateOverlay();
                    }
                );
            }
        );
}


// Protein/gene browse/load tabs
function showProteinBrowse() {

    document
        .getElementById("proteinBrowseView")
        .style.display = "flex";

    document
        .getElementById("proteinLoadedView")
        .style.display = "none";
}

function showProteinLoaded() {

    document
        .getElementById("proteinBrowseView")
        .style.display = "none";

    document
        .getElementById("proteinLoadedView")
        .style.display = "flex";
}

function showGeneBrowse() {

    document
        .getElementById("geneBrowseView")
        .style.display = "flex";

    document
        .getElementById("geneLoadedView")
        .style.display = "none";
}

function showGeneLoaded() {

    document
        .getElementById("geneBrowseView")
        .style.display = "none";

    document
        .getElementById("geneLoadedView")
        .style.display = "flex";
}

document
    .getElementById("proteinBrowseBtn")
    .addEventListener("click", showProteinBrowse);

document
    .getElementById("proteinLoadedBtn")
    .addEventListener("click", showProteinLoaded);

document
    .getElementById("geneBrowseBtn")
    .addEventListener("click", showGeneBrowse);

document
    .getElementById("geneLoadedBtn")
    .addEventListener("click", showGeneLoaded);

// Show panels if on phone
if (window.innerWidth <= 768) {
    showProteinBrowse();
    showGeneBrowse();

    showMobileTopSection(
        "dataSection"
    );
}


// Mobile tabs
function showMobileTopSection(id) {

    document
        .getElementById(
            "topbar"
        )
        .classList.remove(
            "collapsed"
        );

    document
        .querySelectorAll(".mobileTopSection")
        .forEach(section =>
            section.classList.remove("active")
        );

    document
        .getElementById(id)
        .classList.add("active");


    document
        .querySelectorAll("#mobileTopTabs button")
        .forEach(button =>
            button.classList.remove("active")
        );

    if (id === "dataSection") {
        document
            .getElementById("mobileDataTab")
            .classList.add("active");
    }

    if (id === "displaySection") {
        document
            .getElementById("mobileDisplayTab")
            .classList.add("active");
    }

    if (id === "screenshotSection") {
        document
            .getElementById("mobileScreenshotTab")
            .classList.add("active");
    }
}


// Hide tabs
function hideMobileTopSections() {

    document
        .querySelectorAll(
            ".mobileTopSection"
        )
        .forEach(
            section =>
                section.classList.remove(
                    "active"
                )
        );

    document
        .querySelectorAll(
            "#mobileTopTabs button"
        )
        .forEach(
            button =>
                button.classList.remove(
                    "active"
                )
        );

    document
        .getElementById(
            "topbar"
        )
        .classList.add(
            "collapsed"
        );
}


// Close tabs when clicking viewer
viewerWrapper.addEventListener(
    "click",
    () => {

        hideMobileTopSections();

        document
            .getElementById("proteinPanel")
            .classList.remove("open");

        document
            .getElementById("genePanel")
            .classList.remove("open");
    }
);


document
    .getElementById(
        "mobileDataTab"
    )
    .addEventListener(
        "click",
        () =>
            showMobileTopSection(
                "dataSection"
            )
    );

document
    .getElementById(
        "mobileDisplayTab"
    )
    .addEventListener(
        "click",
        () =>
            showMobileTopSection(
                "displaySection"
            )
    );

document
    .getElementById(
        "mobileScreenshotTab"
    )
    .addEventListener(
        "click",
        () =>
            showMobileTopSection(
                "screenshotSection"
            )
    );


document
    .getElementById("toggleLayersBtn")
    .addEventListener(
        "click",
        () => {

            const layerBar =
                document.getElementById(
                    "layerBar"
                );

            layerBar.classList.toggle(
                "hidden"
            );

            btn.textContent =
                layerBar.classList.contains(
                    "hidden"
                )
                    ? "Active Layers ▶"
                    : "Active Layers ▼";
        }
    );


// Load file from drag and drop
dropZone.addEventListener(
    "dragover",
    event => {

        event.preventDefault();

        dropZone.classList.add(
            "dragging"
        );
    }
);

dropZone.addEventListener(
    "dragleave",
    () => {

        dropZone.classList.remove(
            "dragging"
        );
    }
);

dropZone.addEventListener(
    "drop",
    async event => {

        event.preventDefault();

        dropZone.classList.remove(
            "dragging"
        );

        const file =
            event.dataTransfer.files[0];

        await loadUlviewer(
            file
        );
    }
);


// Checkbox H&E
exportHE.addEventListener(
    "change",
    () => {

        showHELayer =
            exportHE.checked;

        if (
            viewer &&
            viewer.world &&
            viewer.world.getItemCount() > 0
        ) {

            viewer
                .world
                .getItemAt(0)
                .setOpacity(
                    showHELayer
                        ? heOpacity
                        : 0
                );
        }
    }
);


// Checkbox genes
exportGenes.addEventListener(
    "change",
    () => {

        showGenes =
            exportGenes.checked;

        updateOverlay();
    }
);


// Checkbox proteins
exportProteins.addEventListener(
    "change",
    () => {

        showProteins =
            exportProteins.checked;

        updateOverlay();
    }
);


// Checkbox segmentation
exportSegs.addEventListener(
    "change",
    () => {

        showSegs =
            exportSegs.checked;

        updateOverlay();
    }
);


// Checkbox scale bar
exportScaleBar.addEventListener(
    "change",
    () => {

        showScaleBar =
            exportScaleBar.checked;

        updateOverlay();
    }
);


// Save screenshot
saveScreenshotBtn.addEventListener(
    "click",
    saveScreenshot
);


// H&E opacity
heOpacitySlider.addEventListener(
    "input",
    () => {

        heOpacity =
            parseFloat(
                heOpacitySlider.value
            );

        if (
            viewer &&
            viewer.world &&
            viewer.world.getItemCount() > 0
        ) {

            viewer
                .world
                .getItemAt(0)
                .setOpacity(
                    heOpacity
                );
        }
    }
);


// Load ulviewer
document
    .getElementById(
        "ulviewerFile"
    )
    .addEventListener(
        "change",
        async event => {

            const file =
                event.target.files[0];

            await loadUlviewer(
                file
            );
        }
    );

document.addEventListener(
    "dragover",
    event => {

        event.preventDefault();
    }
);

document.addEventListener(
    "drop",
    async event => {

        event.preventDefault();

        const file =
            event.dataTransfer.files[0];

        if (
            !file
        ) {
            return;
        }

        await loadUlviewer(
            file
        );
    }
);

// Load demo dataset
async function loadDemoDataset() {

    loadedZip = null;
    remoteZip = null;
    zipPrefix = "";

    clearDataLink();

    datasetRoot = "./data";

    metadata =
        await fetch(
            `${datasetRoot}/metadata.json`
        ).then(
            r => r.json()
        );

    await initialiseDataset();

    // Mobile-specific conditions
    if (
        window.innerWidth <= 768
    ) {

        showMobileTopSection(
            "displaySection"
        );
    }

    // Count number of loaded demo datasets
    window.goatcounter?.count({
        path: "event/demo-loaded",
        title: "Demo Loaded"
    });
}

document
    .getElementById("loadDemoBtn")
    .addEventListener(
        "click",
        loadDemoDataset
    );

// Load segmentation
document
    .getElementById(
        "loadSegBtn"
    )
    .addEventListener(
        "click",
        async () => {

            // Xenium cells by default, otherwise the first segmentation in the dataset
            const filename =
                metadata.segmentations[
                    "xenium_cells"
                ] ??
                Object.values(
                    metadata.segmentations
                )[0];

            if (!filename) {

                showStatus(
                    "This dataset has no cell segmentations.",
                    true
                );

                return;
            }

            console.log(
                "Segmentation:",
                filename
            );

            const compressed =
                await getCompressedFile(
                    filename
                );

            const jsonText =
                pako.inflate(
                    compressed,
                    {
                        to: "string"
                    }
                );

            segmentationData =
                JSON.parse(
                    jsonText
                );

            document
                .getElementById(
                    "enableCellSelection"
                )
                .disabled = false;

            document
                .getElementById(
                    "loadSegBtn"
                )
                .style.display = "none";

            document
                .getElementById(
                    "segmentationControls"
                )
                .style.display = "flex";

            // CLUSTERS (disabled for now): cluster / annotation options for cell fills
            // initCellAnnotations();

            // Count number of segmentations loaded
            window.goatcounter?.count({
                path: "event/load-segmentations",
                title: "Load Segmentations"
            });

            updateOverlay();
        }
    );

// Segmentation line colour
document
    .getElementById(
        "segmentationColor"
    )
    .addEventListener(
        "input",
        event => {

            segmentationColor =
                event.target.value;

            updateOverlay();
        }
    );

// Segmentation line thickness
document
    .getElementById(
        "segmentationThickness"
    )
    .addEventListener(
        "input",
        event => {

            segmentationThickness =
                parseFloat(
                    event.target.value
                );

            updateOverlay();
        }
    );

// Segmentation opacity
document
    .getElementById(
        "segmentationOpacity"
    )
    .addEventListener(
        "input",
        event => {

            segmentationOpacity =
                parseFloat(
                    event.target.value
                );

            updateOverlay();
        }
    );


// Gene search
geneSearch.addEventListener(
    "input",
    () => {

        renderGeneList(
            geneSearch.value
        );
    }
);


// Clear genes
document
    .getElementById(
        "clearGenesBtn"
    )
    .addEventListener(
        "click",
        () => {

            geneLayers = {};

            refreshGeneUI();
            refreshActiveLayers();

            renderGeneList(
                geneSearch.value
            );

            updateOverlay();
        }
    );


// Protein search
proteinSearch.addEventListener(
    "input",
    () => {

        renderProteinList(
            proteinSearch.value
        );
    }
);


// Clear proteins
document
    .getElementById(
        "clearProteinsBtn"
    )
    .addEventListener(
        "click",
        () => {

            proteinLayers = {};

            refreshProteinUI();
            refreshActiveLayers();

            renderProteinList(
                proteinSearch.value
            );

            updateOverlay();
        }
    );

// Cell info selection
enableCellSelection.addEventListener(
    "change",
    () => {

        cellSelectionEnabled =
            enableCellSelection.checked;

        if (
            !cellSelectionEnabled
        ) {

            selectedCell = null;
            hoveredCell = null;

            cellInfo.style.display =
                "none";

            updateOverlay();
        }
    }
);


// Side tabs (for phones)
document
    .getElementById("proteinTab")
    .addEventListener(
        "click",
        () => {

            document
                .getElementById("genePanel")
                .classList.remove("open");

            document
                .getElementById("proteinPanel")
                .classList.toggle("open");
        }
    );

document
    .getElementById("geneTab")
    .addEventListener(
        "click",
        () => {

            document
                .getElementById("proteinPanel")
                .classList.remove("open");

            document
                .getElementById("genePanel")
                .classList.toggle("open");
        }
    );



// ======================================================================
// Shared helpers
// ======================================================================

// Escape text before placing it in innerHTML
function escapeHtml(value) {

    return String(value).replace(
        /[&<>"']/g,
        ch => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[ch]
    );
}


// Status message shown over the viewer (loading progress, errors)
let statusTimer = null;

function showStatus(message, isError = false) {

    const box =
        document.getElementById("statusMsg");

    clearTimeout(statusTimer);

    box.textContent = message;

    box.classList.toggle("error", isError);

    box.style.display = "block";

    // Errors stay until dismissed (click) or replaced
    if (isError) {
        console.warn(message);
    }
}

function hideStatus(delayMs = 0) {

    clearTimeout(statusTimer);

    statusTimer =
        setTimeout(
            () => {
                document
                    .getElementById("statusMsg")
                    .style.display = "none";
            },
            delayMs
        );
}

document
    .getElementById("statusMsg")
    .addEventListener(
        "click",
        event => {

            // Don't let the click fall through to the viewer
            event.stopPropagation();

            hideStatus();
        }
    );


// Folder (inside a zip) that contains metadata.json
function findZipPrefix(names) {

    const candidates =
        names
            .filter(
                name =>
                    !name.startsWith("__MACOSX/") &&
                    (
                        name === "metadata.json" ||
                        name.endsWith("/metadata.json")
                    )
            )
            .sort(
                (a, b) => a.length - b.length
            );

    if (!candidates.length) {

        throw new Error(
            "This file doesn't look like a UnumLocalia export (no metadata.json inside)."
        );
    }

    return candidates[0].slice(
        0,
        candidates[0].length - "metadata.json".length
    );
}


// Clear layers/cells/clusters when a new dataset is opened
function resetDatasetState() {

    geneLayers = {};
    proteinLayers = {};

    segmentationData = [];
    selectedCell = null;
    hoveredCell = null;

    cellInfo.style.display = "none";

    enableCellSelection.checked = false;
    cellSelectionEnabled = false;

    document
        .getElementById("loadSegBtn")
        .style.display = "";

    document
        .getElementById("segmentationControls")
        .style.display = "";

    // CLUSTERS (disabled for now)
    // resetCellAnnotations();

    refreshGeneUI();
    refreshProteinUI();
    refreshActiveLayers();
}


// ======================================================================
// Load a dataset from a web link
//
// A viewer address ending in  #data=<link>  opens that dataset straight
// away, so a single link can be shared. The link sits after the "#", which
// browsers never send to a server, so it is not seen by GitHub Pages or
// the visit counter.
//
// <link> can point to
//   - a .ulviewer / .zip file (e.g. a Dropbox share link), or
//   - a folder (or its metadata.json) on any host that allows other
//     websites to read its files (GitHub Pages, S3/R2 with CORS, ...).
// ======================================================================

// Turn a share link into one the browser is allowed to read
function normaliseDataUrl(rawUrl) {

    let url;

    try {

        url = new URL(rawUrl.trim());

    } catch (error) {

        throw new Error(
            "That doesn't look like a web link."
        );
    }

    const host =
        url.hostname.toLowerCase();

    // Dropbox: the share page doesn't allow other sites to read it, the download host does
    if (
        host === "www.dropbox.com" ||
        host === "dropbox.com"
    ) {

        if (url.pathname.startsWith("/scl/fo/")) {

            throw new Error(
                "That is a link to a Dropbox folder. Share the .ulviewer file itself instead."
            );
        }

        url.hostname = "dl.dropboxusercontent.com";

        url.searchParams.set("dl", "1");
    }

    // GitHub: file page -> raw file
    if (host === "github.com") {

        const parts =
            url.pathname.split("/");

        // /user/repo/blob/branch/path...
        if (
            parts[3] === "blob" ||
            parts[3] === "raw"
        ) {

            parts.splice(3, 1);

            url =
                new URL(
                    "https://raw.githubusercontent.com" +
                    parts.join("/")
                );
        }
    }

    return url;
}


// Hosts known not to let other websites read shared files
function unsupportedHostName(url) {

    const host =
        url.hostname.toLowerCase();

    if (
        host === "1drv.ms" ||
        host.endsWith("onedrive.live.com") ||
        host.endsWith(".sharepoint.com")
    ) {
        return "OneDrive / SharePoint";
    }

    if (
        host === "drive.google.com" ||
        host === "docs.google.com"
    ) {
        return "Google Drive";
    }

    return null;
}


// Reads single files out of a .zip that lives on a web server, using HTTP
// range requests, so only the layers that are switched on get downloaded.
class RemoteZip {

    constructor(url, entries, size) {

        this.url = url;
        this.entries = entries;

        // Size of the whole file in bytes
        this.size = size;
        this.prefix =
            findZipPrefix(
                [...entries.keys()]
            );
    }

    // Fetch bytes [start, end] of the file
    static async fetchRange(url, start, end) {

        const response =
            await fetch(
                url,
                {
                    headers: {
                        Range: `bytes=${start}-${end}`
                    }
                }
            );

        if (!response.ok) {

            throw new Error(
                `The link returned an error (HTTP ${response.status}).`
            );
        }

        const bytes =
            new Uint8Array(
                await response.arrayBuffer()
            );

        // Server ignored the range and sent the whole file
        if (response.status === 200) {

            return bytes.subarray(
                start,
                end + 1
            );
        }

        return bytes;
    }

    // Build from the last bytes of the file (which hold the zip's table of contents)
    static async fromTail(url, tail) {

        const view =
            new DataView(
                tail.buffer,
                tail.byteOffset,
                tail.byteLength
            );

        // End-of-central-directory record
        let eocd = -1;

        for (
            let i = tail.length - 22;
            i >= 0;
            i--
        ) {

            if (
                view.getUint32(i, true) === 0x06054b50
            ) {

                eocd = i;

                break;
            }
        }

        if (eocd < 0) {

            throw new Error(
                "The link didn't return a .ulviewer (zip) file."
            );
        }

        let directorySize =
            view.getUint32(eocd + 12, true);

        let directoryOffset =
            view.getUint32(eocd + 16, true);

        // Bytes from the end-of-directory record to the end of the file
        const ending =
            tail.length - eocd;

        // The directory sits just before that record, so this gives the file size
        let size =
            directoryOffset +
            directorySize +
            ending;

        // Zip64 (more than 4 GB or 65,535 files)
        if (
            directorySize === 0xffffffff ||
            directoryOffset === 0xffffffff ||
            view.getUint16(eocd + 10, true) === 0xffff
        ) {

            const locator = eocd - 20;

            if (
                locator < 0 ||
                view.getUint32(locator, true) !== 0x07064b50
            ) {

                throw new Error(
                    "Couldn't read the zip file's table of contents."
                );
            }

            const recordOffset =
                Number(
                    view.getBigUint64(locator + 8, true)
                );

            const record =
                await RemoteZip.fetchRange(
                    url,
                    recordOffset,
                    recordOffset + 55
                );

            const recordView =
                new DataView(
                    record.buffer,
                    record.byteOffset,
                    record.byteLength
                );

            directorySize =
                Number(
                    recordView.getBigUint64(40, true)
                );

            directoryOffset =
                Number(
                    recordView.getBigUint64(48, true)
                );

            // Zip64 record (56 bytes) + its locator (20 bytes) come before the ending
            size =
                recordOffset +
                76 +
                ending;
        }

        const directory =
            await RemoteZip.fetchRange(
                url,
                directoryOffset,
                directoryOffset + directorySize - 1
            );

        return new RemoteZip(
            url,
            RemoteZip.parseDirectory(directory),
            size
        );
    }

    static parseDirectory(directory) {

        const view =
            new DataView(
                directory.buffer,
                directory.byteOffset,
                directory.byteLength
            );

        const decoder =
            new TextDecoder("utf-8");

        const entries =
            new Map();

        let pos = 0;

        while (
            pos + 46 <= directory.length &&
            view.getUint32(pos, true) === 0x02014b50
        ) {

            const method =
                view.getUint16(pos + 10, true);

            let compressedSize =
                view.getUint32(pos + 20, true);

            let size =
                view.getUint32(pos + 24, true);

            const nameLength =
                view.getUint16(pos + 28, true);

            const extraLength =
                view.getUint16(pos + 30, true);

            const commentLength =
                view.getUint16(pos + 32, true);

            let offset =
                view.getUint32(pos + 42, true);

            const name =
                decoder.decode(
                    directory.subarray(
                        pos + 46,
                        pos + 46 + nameLength
                    )
                );

            // Zip64 sizes/offsets live in an extra field
            let extra =
                pos + 46 + nameLength;

            const extraEnd =
                extra + extraLength;

            while (extra + 4 <= extraEnd) {

                const id =
                    view.getUint16(extra, true);

                const length =
                    view.getUint16(extra + 2, true);

                if (id === 0x0001) {

                    let field = extra + 4;

                    if (size === 0xffffffff) {

                        size =
                            Number(
                                view.getBigUint64(field, true)
                            );

                        field += 8;
                    }

                    if (compressedSize === 0xffffffff) {

                        compressedSize =
                            Number(
                                view.getBigUint64(field, true)
                            );

                        field += 8;
                    }

                    if (offset === 0xffffffff) {

                        offset =
                            Number(
                                view.getBigUint64(field, true)
                            );
                    }
                }

                extra += 4 + length;
            }

            entries.set(
                name,
                {
                    method,
                    compressedSize,
                    offset,
                    nameLength,
                    extraLength
                }
            );

            pos +=
                46 +
                nameLength +
                extraLength +
                commentLength;
        }

        return entries;
    }

    // Download and unpack one file from the zip
    async read(path) {

        const entry =
            this.entries.get(
                this.prefix + path
            );

        if (!entry) {

            throw new Error(
                `"${path}" is missing from the dataset.`
            );
        }

        // Local header (30 bytes + name + extra field) comes before the data.
        // Its extra field can be longer than the one in the directory, so ask
        // for a little more than expected.
        const guess =
            30 +
            entry.nameLength +
            entry.extraLength +
            256;

        let bytes =
            await RemoteZip.fetchRange(
                this.url,
                entry.offset,
                entry.offset + guess + entry.compressedSize - 1
            );

        const view =
            new DataView(
                bytes.buffer,
                bytes.byteOffset,
                bytes.byteLength
            );

        if (
            bytes.length < 30 ||
            view.getUint32(0, true) !== 0x04034b50
        ) {

            throw new Error(
                `Couldn't read "${path}" from the dataset.`
            );
        }

        const dataStart =
            30 +
            view.getUint16(26, true) +
            view.getUint16(28, true);

        let data;

        if (
            dataStart + entry.compressedSize <= bytes.length
        ) {

            data =
                bytes.subarray(
                    dataStart,
                    dataStart + entry.compressedSize
                );

        } else {

            data =
                await RemoteZip.fetchRange(
                    this.url,
                    entry.offset + dataStart,
                    entry.offset + dataStart + entry.compressedSize - 1
                );
        }

        // Stored (how UnumLocalia writes .ulviewer files)
        if (entry.method === 0) {
            return data;
        }

        // Deflated (e.g. zipped by hand)
        if (entry.method === 8) {
            return pako.inflateRaw(data);
        }

        throw new Error(
            `"${path}" uses a zip compression method that isn't supported.`
        );
    }
}


// File size for display
function formatSize(bytes) {

    if (bytes >= 1e9) {
        return `${(bytes / 1e9).toFixed(1)} GB`;
    }

    if (bytes >= 1e7) {
        return `${Math.round(bytes / 1e6)} MB`;
    }

    return `${(bytes / 1e6).toFixed(1)} MB`;
}


// Download a whole response, reporting progress
async function downloadWithProgress(response, knownTotal = 0) {

    const total =
        knownTotal ||
        Number(
            response.headers.get("Content-Length")
        ) || 0;

    if (!response.body) {
        return await response.blob();
    }

    const reader =
        response.body.getReader();

    const chunks = [];

    let received = 0;

    while (true) {

        const { done, value } =
            await reader.read();

        if (done) {
            break;
        }

        chunks.push(value);

        received += value.length;

        showStatus(
            total
                ? `Downloading dataset… ${formatSize(received)} of ${formatSize(total)}`
                : `Downloading dataset… ${formatSize(received)}`
        );
    }

    return new Blob(chunks);
}


// Open a .ulviewer / .zip that lives at a web address
async function openRemoteArchive(url) {

    let response;

    try {

        // Ask for the end of the file only (the zip's table of contents)
        response =
            await fetch(
                url,
                {
                    headers: {
                        Range: "bytes=-66000"
                    }
                }
            );

    } catch (error) {

        // Some hosts refuse partial requests from other websites; try a plain download
        response =
            await fetch(url);
    }

    if (!response.ok) {

        throw new Error(
            response.status === 404
                ? "Nothing was found at that link (HTTP 404). Check it is shared with 'anyone with the link'."
                : `The link returned an error (HTTP ${response.status}).`
        );
    }

    // Partial content: stream the dataset, fetching layers on demand
    if (response.status === 206) {

        const tail =
            new Uint8Array(
                await response.arrayBuffer()
            );

        remoteZip =
            await RemoteZip.fromTail(
                url,
                tail
            );

        loadedZip = null;
        datasetRoot = "";
        zipPrefix = "";

        metadata =
            JSON.parse(
                new TextDecoder().decode(
                    await remoteZip.read("metadata.json")
                )
            );

        await initialiseDataset();

        return;
    }

    // Host sent the whole file: download it all, then open it like a local file
    const blob =
        await downloadWithProgress(response);

    const start =
        new Uint8Array(
            await blob.slice(0, 2).arrayBuffer()
        );

    if (
        start[0] !== 0x50 ||
        start[1] !== 0x4b
    ) {

        throw new Error(
            "The link didn't return a .ulviewer (zip) file. Make sure it points to the file itself and is shared with 'anyone with the link'."
        );
    }

    await loadUlviewer(blob);

    downloadedBlob = blob;
}


// Open an exported dataset folder that is hosted on the web
async function openRemoteFolder(url) {

    const root =
        url.href
            .split(/[?#]/)[0]
            .replace(/metadata\.json$/, "")
            .replace(/\/+$/, "");

    const response =
        await fetch(
            `${root}/metadata.json`
        );

    if (!response.ok) {

        throw new Error(
            `No metadata.json was found at that link (HTTP ${response.status}).`
        );
    }

    metadata =
        await response.json();

    loadedZip = null;
    remoteZip = null;
    zipPrefix = "";

    datasetRoot = root;

    await initialiseDataset();
}


// Load whatever the link points to
async function loadFromLink(rawLink) {

    rawLink = rawLink.trim();

    if (!rawLink) {
        return;
    }

    const copyBtn =
        document.getElementById("copyShareLinkBtn");

    copyBtn.style.display = "none";

    const downloadBtn =
        document.getElementById("downloadAllBtn");

    const saveBtn =
        document.getElementById("saveFileBtn");

    downloadBtn.style.display = "none";
    saveBtn.style.display = "none";

    let url;

    try {

        url =
            normaliseDataUrl(rawLink);

    } catch (error) {

        showStatus(
            error.message,
            true
        );

        return;
    }

    showStatus(
        "Loading dataset from link…"
    );

    try {

        const lastPart =
            url.pathname.split("/").pop();

        const isFolder =
            lastPart === "metadata.json" ||
            !lastPart.includes(".");

        if (isFolder) {

            await openRemoteFolder(url);

        } else {

            await openRemoteArchive(url);
        }

    } catch (error) {

        console.error(error);

        const blockedHost =
            unsupportedHostName(url);

        let message;

        if (blockedHost) {

            message =
                `${blockedHost} doesn't let other websites read shared files, so this link can't be opened here. ` +
                "Use a Dropbox link instead, or download the file and open it with 'Choose file'.";

        } else if (error instanceof TypeError) {

            // fetch() itself failed: offline, or the host blocks cross-site reads (CORS)
            message =
                "Couldn't read that link. Check it is shared with 'anyone with the link'. " +
                "Some hosts don't let other websites read their files (Dropbox links work; OneDrive and Google Drive links don't). " +
                "You can also download the file and open it with 'Choose file'.";

        } else {

            message =
                error.message;
        }

        showStatus(
            message,
            true
        );

        return;
    }

    hideStatus();

    currentDataLink = rawLink;

    // Put the link in the address bar so the page address itself can be shared
    history.replaceState(
        null,
        "",
        "#data=" + encodeURIComponent(rawLink)
    );

    copyBtn.style.display = "";

    // Streaming from the link: offer to fetch the whole file for faster layer loading
    if (remoteZip) {

        downloadBtn.textContent =
            `Download all (${formatSize(remoteZip.size)})`;

        downloadBtn.style.display = "";
    }

    // A .ulviewer file (streamed or already downloaded) can be saved to disk
    if (
        remoteZip ||
        downloadedBlob
    ) {

        saveBtn.style.display = "";
    }

    // Mobile-specific conditions
    if (
        window.innerWidth <= 768
    ) {

        showMobileTopSection(
            "displaySection"
        );
    }

    // Count number of datasets loaded from a link (the link itself is not recorded)
    window.goatcounter?.count({
        path: "event/link-loaded",
        title: "Link Dataset Loaded"
    });
}


// Forget the link when a local file or the demo is opened instead
function clearDataLink() {

    currentDataLink = null;

    document
        .getElementById("copyShareLinkBtn")
        .style.display = "none";

    document
        .getElementById("downloadAllBtn")
        .style.display = "none";

    document
        .getElementById("saveFileBtn")
        .style.display = "none";

    downloadedBlob = null;

    if (location.hash.startsWith("#data=")) {

        history.replaceState(
            null,
            "",
            location.pathname + location.search
        );
    }
}


// Link named in the page address (#data=...)
function getLinkFromAddress() {

    const match =
        location.hash.match(/^#data=(.+)$/);

    if (!match) {
        return null;
    }

    try {

        return decodeURIComponent(match[1]);

    } catch (error) {

        return match[1];
    }
}

function loadFromAddress() {

    const link =
        getLinkFromAddress();

    if (
        !link ||
        link === currentDataLink
    ) {
        return;
    }

    if (link === "demo") {

        loadDemoDataset();

        return;
    }

    document
        .getElementById("dataLinkInput")
        .value = link;

    loadFromLink(link);
}

document
    .getElementById("loadLinkBtn")
    .addEventListener(
        "click",
        () =>
            loadFromLink(
                document
                    .getElementById("dataLinkInput")
                    .value
            )
    );

document
    .getElementById("dataLinkInput")
    .addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                loadFromLink(
                    event.target.value
                );
            }
        }
    );

// Copy a viewer link that opens this dataset
document
    .getElementById("copyShareLinkBtn")
    .addEventListener(
        "click",
        async event => {

            const shareLink =
                location.href.split("#")[0] +
                "#data=" +
                encodeURIComponent(currentDataLink);

            try {

                await navigator.clipboard.writeText(
                    shareLink
                );

                event.target.textContent = "Copied!";

                setTimeout(
                    () => {
                        event.target.textContent = "Copy share link";
                    },
                    1500
                );

            } catch (error) {

                // Clipboard not available: show the link to copy by hand
                window.prompt(
                    "Copy this link:",
                    shareLink
                );
            }
        }
    );

// Download the whole linked dataset into this browser tab, so layers no
// longer have to be fetched one at a time. Nothing is uploaded; loaded
// layers stay as they are. Returns true once the whole file is held here.
async function downloadWholeDataset() {

    if (downloadedBlob) {
        return true;
    }

    const source = remoteZip;

    if (!source) {
        return false;
    }

    const buttons = [
        document.getElementById("downloadAllBtn"),
        document.getElementById("saveFileBtn")
    ];

    buttons.forEach(
        button => {
            button.disabled = true;
        }
    );

    try {

        showStatus(
            "Downloading dataset…"
        );

        const response =
            await fetch(source.url);

        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const blob =
            await downloadWithProgress(
                response,
                source.size
            );

        const zip =
            await JSZip.loadAsync(blob);

        // A different dataset was opened while this was downloading
        if (remoteZip !== source) {
            return false;
        }

        // Read from the downloaded copy from now on
        zipPrefix =
            findZipPrefix(
                Object.keys(zip.files)
            );

        loadedZip = zip;
        remoteZip = null;

        downloadedBlob = blob;

        buttons[0].style.display = "none";

        // Count number of full downloads (the link itself is not recorded)
        window.goatcounter?.count({
            path: "event/link-download-all",
            title: "Link Dataset Downloaded"
        });

        return true;

    } catch (error) {

        console.error(error);

        if (remoteZip === source) {

            showStatus(
                "Couldn't download the whole dataset. Layers will keep loading from the link one at a time.",
                true
            );
        }

        return false;

    } finally {

        buttons.forEach(
            button => {
                button.disabled = false;
            }
        );
    }
}


// File name to save the linked dataset under
function getDatasetFileName() {

    let name = "";

    try {

        name =
            decodeURIComponent(
                new URL(currentDataLink)
                    .pathname
                    .split("/")
                    .pop()
            );

    } catch (error) {

        name = "";
    }

    // Keep it a plain file name
    name =
        name.replace(/[\\/:*?"<>|]/g, "_");

    if (!/\.(ulviewer|zip)$/i.test(name)) {

        name =
            `${name || metadata?.core || "dataset"}.ulviewer`;
    }

    return name;
}


// Load the whole dataset into the tab (faster layer switching)
document
    .getElementById("downloadAllBtn")
    .addEventListener(
        "click",
        async () => {

            if (
                await downloadWholeDataset()
            ) {

                showStatus(
                    `Whole dataset downloaded (${formatSize(downloadedBlob.size)}). Layers now load from this device.`
                );

                hideStatus(4000);
            }
        }
    );


// Save the linked .ulviewer file to the computer (browser's downloads folder)
document
    .getElementById("saveFileBtn")
    .addEventListener(
        "click",
        async () => {

            // Fetch the whole file first if it hasn't been already
            if (
                !(await downloadWholeDataset())
            ) {
                return;
            }

            const fileName =
                getDatasetFileName();

            const link =
                document.createElement("a");

            link.href =
                URL.createObjectURL(downloadedBlob);

            link.download = fileName;

            link.click();

            // Give the browser time to start saving before releasing the address
            setTimeout(
                () => URL.revokeObjectURL(link.href),
                60000
            );

            showStatus(
                `Saving ${fileName} (${formatSize(downloadedBlob.size)}) to your downloads folder. Open it later with 'Choose file'.`
            );

            hideStatus(6000);

            // Count number of datasets saved to disk (the link itself is not recorded)
            window.goatcounter?.count({
                path: "event/link-save-file",
                title: "Link Dataset Saved"
            });
        }
    );

window.addEventListener(
    "hashchange",
    loadFromAddress
);


// ======================================================================
// Cell info: protein expression inside a cell
// ======================================================================

const measureCanvas =
    document.createElement("canvas");

// Mean intensity of each loaded protein inside the cell outline.
// Values come from the exported 8-bit images, where 0-255 spans the
// min-max display thresholds chosen at export, so they are relative
// (0-100% of that range) rather than raw instrument counts.
function measureProteinsInCell(cell) {

    const results = {};

    if (!cell.vertices.length) {
        return results;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (
        const vertex
        of cell.vertices
    ) {

        minX = Math.min(minX, vertex[0]);
        minY = Math.min(minY, vertex[1]);
        maxX = Math.max(maxX, vertex[0]);
        maxY = Math.max(maxY, vertex[1]);
    }

    for (
        const marker
        in proteinLayers
    ) {

        const image =
            proteinLayers[marker].image;

        // Protein images can be a different size to the H&E image
        const scaleX =
            image.naturalWidth / metadata.image.width;

        const scaleY =
            image.naturalHeight / metadata.image.height;

        const x0 =
            Math.max(
                0,
                Math.floor(minX * scaleX)
            );

        const y0 =
            Math.max(
                0,
                Math.floor(minY * scaleY)
            );

        const x1 =
            Math.min(
                image.naturalWidth,
                Math.ceil(maxX * scaleX)
            );

        const y1 =
            Math.min(
                image.naturalHeight,
                Math.ceil(maxY * scaleY)
            );

        const width = x1 - x0;
        const height = y1 - y0;

        if (
            width <= 0 ||
            height <= 0
        ) {
            continue;
        }

        measureCanvas.width = width;
        measureCanvas.height = height;

        const ctx =
            measureCanvas.getContext(
                "2d",
                {
                    willReadFrequently: true
                }
            );

        ctx.drawImage(
            image,
            x0,
            y0,
            width,
            height,
            0,
            0,
            width,
            height
        );

        const pixels =
            ctx.getImageData(
                0,
                0,
                width,
                height
            ).data;

        let sum = 0;
        let count = 0;

        for (
            let py = 0;
            py < height;
            py++
        ) {

            for (
                let px = 0;
                px < width;
                px++
            ) {

                // Pixel centre, in H&E image coordinates
                if (
                    pointInPolygon(
                        (x0 + px + 0.5) / scaleX,
                        (y0 + py + 0.5) / scaleY,
                        cell.vertices
                    )
                ) {

                    sum +=
                        pixels[
                            (py * width + px) * 4
                        ];

                    count++;
                }
            }
        }

        if (count) {

            results[marker] =
                sum / count / 255 * 100;
        }
    }

    return results;
}


// Fill the cell info panel
function renderCellInfo(cell) {

    const area =
        calculatePolygonArea(
            cell.vertices
        );

    const centroid =
        calculateCentroid(
            cell.vertices
        );

    const lines = [
        "<b>Cell Selected</b>",
        `Cell ID: ${escapeHtml(cell.cell_id ?? "Unknown")}`
    ];

    // CLUSTERS (disabled for now)
    // // Cluster (if cells are filled by one)
    // if (activeAnnotation) {
    //
    //     const label =
    //         cellLabels[
    //             segmentationData.indexOf(cell)
    //         ];
    //
    //     lines.push(
    //         `${escapeHtml(activeAnnotation)}: ${escapeHtml(label ?? "–")}`
    //     );
    // }

    lines.push(
        `Vertices: ${cell.vertices.length}`
    );

    const pixelSize =
        metadata.web_pixel_size_um;

    lines.push(
        pixelSize
            ? `Area: ${Math.round(area * pixelSize * pixelSize)} µm² (${Math.round(area)} px²)`
            : `Area: ${Math.round(area)} px²`
    );

    lines.push(
        `Centroid: (${Math.round(centroid.x)}, ${Math.round(centroid.y)})`
    );

    // Gene counts
    const transcriptCount =
        countGenesInCell(cell);

    lines.push(
        "<b>Genes</b> <span class=\"cell-info-note\">(transcripts)</span>"
    );

    const geneNames =
        Object.keys(transcriptCount);

    if (geneNames.length) {

        for (
            const gene
            of geneNames
        ) {

            lines.push(
                `${escapeHtml(gene)}: ${transcriptCount[gene]}`
            );
        }

    } else {

        lines.push(
            "<span class=\"cell-info-note\">Switch on genes to count them</span>"
        );
    }

    // Protein expression
    const proteinMeans =
        measureProteinsInCell(cell);

    lines.push(
        "<b>Proteins</b> <span class=\"cell-info-note\" title=\"Mean pixel intensity inside the cell outline, as a percentage of the display range the image was exported with\">(mean intensity)</span>"
    );

    const markers =
        Object.keys(proteinMeans);

    if (markers.length) {

        for (
            const marker
            of markers
        ) {

            lines.push(
                `${escapeHtml(marker)}: ${proteinMeans[marker].toFixed(1)}%`
            );
        }

    } else {

        lines.push(
            "<span class=\"cell-info-note\">Switch on proteins to measure them</span>"
        );
    }

    cellInfo.innerHTML =
        lines.join("<br>");
}


// ======================================================================
// CLUSTERS (disabled for now)
//
// Everything between the /* and */ below is switched off. To bring cell
// fills back: delete those two markers, and un-comment the other places
// marked "CLUSTERS (disabled for now)" in this file, index.html and styles.css.
// ======================================================================

/*

// ======================================================================
// Cell fills: colour cells by cluster (or any per-cell category)
//
// Clusters can come from
//   - the dataset: extra properties on each cell in the segmentation file
//     (e.g. "cluster"), or files listed under "cell_annotations" in
//     metadata.json ({ "name": "path/to/file.csv" }), or
//   - a CSV the user picks: one column of cell IDs plus one or more
//     cluster columns, e.g. UnumLocalia's cluster_assignments.csv or
//     Xenium's clusters.csv (Barcode, Cluster).
// ======================================================================

const CLUSTER_COLORS = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#17becf", "#bcbd22", "#7f7f7f",
    "#aec7e8", "#ffbb78", "#98df8a", "#ff9896", "#c5b0d5",
    "#c49c94", "#f7b6d2", "#9edae5", "#dbdb8d", "#c7c7c7"
];

// Columns with more distinct values than this aren't treated as clusters
const MAX_CLUSTERS = 150;

const cellFillSelect =
    document.getElementById("cellFillSelect");

const clusterLegend =
    document.getElementById("clusterLegend");


function resetCellAnnotations() {

    cellAnnotations = {};

    setActiveAnnotation("");

    refreshCellFillOptions();
}


// Find annotations supplied with the dataset (called once cells are loaded)
function initCellAnnotations() {

    cellAnnotations = {};

    // Extra properties on the cells themselves
    const first =
        segmentationData[0] || {};

    for (
        const key
        of Object.keys(first)
    ) {

        if (
            key === "cell_id" ||
            key === "vertices" ||
            (
                typeof first[key] !== "string" &&
                typeof first[key] !== "number"
            )
        ) {
            continue;
        }

        const map = new Map();

        for (
            const cell
            of segmentationData
        ) {

            if (
                cell[key] !== undefined &&
                cell[key] !== null &&
                cell[key] !== ""
            ) {

                map.set(
                    String(cell.cell_id),
                    String(cell[key])
                );
            }
        }

        if (
            new Set(map.values()).size <= MAX_CLUSTERS
        ) {

            cellAnnotations[key] = map;
        }
    }

    // Files listed in metadata.json (loaded when chosen)
    for (
        const [name, path]
        of Object.entries(
            metadata.cell_annotations || {}
        )
    ) {

        cellAnnotations[name] = path;
    }

    refreshCellFillOptions();
}


function refreshCellFillOptions() {

    cellFillSelect.innerHTML = "";

    const addOption = (value, text) => {

        const option =
            document.createElement("option");

        option.value = value;
        option.textContent = text;

        cellFillSelect.appendChild(option);
    };

    addOption("", "None");

    for (
        const name
        of Object.keys(cellAnnotations)
    ) {

        addOption(
            "a:" + name,
            name
        );
    }

    addOption(
        "csv",
        "Load clusters (CSV)…"
    );

    cellFillSelect.value =
        activeAnnotation
            ? "a:" + activeAnnotation
            : "";
}


// Read a table of cell IDs and cluster labels.
// Returns { columnName: Map(cell_id -> label) }
function parseClusterTable(text, fallbackName) {

    const rows =
        text
            .replace(/^﻿/, "")
            .split(/\r?\n/)
            .filter(
                line => line.trim() !== ""
            );

    if (rows.length < 2) {

        throw new Error(
            "The cluster file is empty."
        );
    }

    const delimiter =
        rows[0].includes("\t")
            ? "\t"
            : rows[0].includes(";") && !rows[0].includes(",")
                ? ";"
                : ",";

    const split = line =>
        line
            .split(delimiter)
            .map(
                value =>
                    value
                        .trim()
                        .replace(/^"(.*)"$/, "$1")
            );

    const header =
        split(rows[0]);

    // Column holding the cell IDs
    let idColumn =
        header.findIndex(
            name =>
                /^(cell[_ ]?ids?|barcodes?|cells?|ids?|)$/i.test(name)
        );

    if (idColumn < 0) {
        idColumn = 0;
    }

    const maps =
        header.map(
            () => new Map()
        );

    for (
        let r = 1;
        r < rows.length;
        r++
    ) {

        const values =
            split(rows[r]);

        const id =
            values[idColumn];

        for (
            let c = 0;
            c < header.length;
            c++
        ) {

            if (
                c !== idColumn &&
                values[c] !== undefined &&
                values[c] !== ""
            ) {

                maps[c].set(
                    id,
                    values[c]
                );
            }
        }
    }

    const result = {};

    header.forEach(
        (name, c) => {

            if (
                c === idColumn ||
                !maps[c].size ||
                new Set(maps[c].values()).size > MAX_CLUSTERS
            ) {
                return;
            }

            result[
                name ||
                fallbackName
            ] = maps[c];
        }
    );

    if (!Object.keys(result).length) {

        throw new Error(
            `No cluster column was found in the file (a column needs ${MAX_CLUSTERS} or fewer different values).`
        );
    }

    return result;
}


// Bytes -> text, unpacking .gz if needed
function bytesToText(bytes) {

    if (
        bytes[0] === 0x1f &&
        bytes[1] === 0x8b
    ) {

        return pako.inflate(
            bytes,
            {
                to: "string"
            }
        );
    }

    return new TextDecoder().decode(bytes);
}


// How many loaded cells have a label in this annotation
function countMatchedCells(map) {

    let matched = 0;

    for (
        const cell
        of segmentationData
    ) {

        if (
            map.has(
                String(cell.cell_id)
            )
        ) {
            matched++;
        }
    }

    return matched;
}


// Sort labels so that 2 comes before 10
function sortLabels(labels) {

    return labels.sort(
        (a, b) =>
            a.localeCompare(
                b,
                undefined,
                {
                    numeric: true
                }
            )
    );
}


// Choose which annotation fills the cells ("" = none)
function setActiveAnnotation(name) {

    activeAnnotation = name;

    cellLabels = [];
    clusterColors = {};
    clusterCounts = {};
    hiddenClusters = new Set();

    if (name) {

        const map =
            cellAnnotations[name];

        cellLabels =
            segmentationData.map(
                cell =>
                    map.get(
                        String(cell.cell_id)
                    )
            );

        for (
            const label
            of cellLabels
        ) {

            if (label !== undefined) {

                clusterCounts[label] =
                    (clusterCounts[label] || 0) + 1;
            }
        }

        sortLabels(
            Object.keys(clusterCounts)
        ).forEach(
            (label, index) => {

                clusterColors[label] =
                    index < CLUSTER_COLORS.length
                        ? CLUSTER_COLORS[index]
                        // Beyond the palette: evenly spread hues
                        : hslToHex(
                            (index * 137.508) % 360,
                            65,
                            index % 2 ? 45 : 65
                        );
            }
        );
    }

    document
        .getElementById("cellFillOpacityItem")
        .style.display =
            name ? "" : "none";

    renderClusterLegend();

    if (selectedCell) {
        renderCellInfo(selectedCell);
    }

    updateOverlay();
}


function hslToHex(h, s, l) {

    s /= 100;
    l /= 100;

    const f = n => {

        const k =
            (n + h / 30) % 12;

        const value =
            l -
            s *
            Math.min(l, 1 - l) *
            Math.max(
                -1,
                Math.min(k - 3, 9 - k, 1)
            );

        return Math.round(value * 255)
            .toString(16)
            .padStart(2, "0");
    };

    return `#${f(0)}${f(8)}${f(4)}`;
}


// Legend over the viewer: colour, show/hide and cell count per cluster
function renderClusterLegend() {

    if (!activeAnnotation) {

        clusterLegend.style.display = "none";

        return;
    }

    const labels =
        sortLabels(
            Object.keys(clusterCounts)
        );

    clusterLegend.innerHTML =
        `<div class="legend-title">${escapeHtml(activeAnnotation)}</div>` +
        labels
            .map(
                (label, index) =>
                    `<label class="legend-row">
                        <input type="checkbox" data-index="${index}" checked>
                        <input type="color" data-index="${index}" value="${clusterColors[label]}">
                        <span class="legend-label">${escapeHtml(label)}</span>
                        <span class="legend-count">${clusterCounts[label].toLocaleString()}</span>
                    </label>`
            )
            .join("");

    clusterLegend
        .querySelectorAll("input[type='checkbox']")
        .forEach(
            box =>
                box.addEventListener(
                    "change",
                    () => {

                        const label =
                            labels[box.dataset.index];

                        if (box.checked) {
                            hiddenClusters.delete(label);
                        } else {
                            hiddenClusters.add(label);
                        }

                        updateOverlay();
                    }
                )
        );

    clusterLegend
        .querySelectorAll("input[type='color']")
        .forEach(
            picker =>
                picker.addEventListener(
                    "input",
                    () => {

                        clusterColors[
                            labels[picker.dataset.index]
                        ] = picker.value;

                        updateOverlay();
                    }
                )
        );

    clusterLegend.style.display = "block";
}

// Clicking the legend shouldn't select cells or close panels
clusterLegend.addEventListener(
    "click",
    event => event.stopPropagation()
);


// Trace one cell outline as a canvas path
function traceCellPath(targetCtx, cell) {

    targetCtx.beginPath();

    cell.vertices.forEach(
        (pt, idx) => {

            const vp =
                viewer.viewport.imageToViewerElementCoordinates(
                    new OpenSeadragon.Point(
                        pt[0],
                        pt[1]
                    )
                );

            if (idx === 0) {

                targetCtx.moveTo(
                    vp.x,
                    vp.y
                );

            } else {

                targetCtx.lineTo(
                    vp.x,
                    vp.y
                );
            }
        }
    );

    targetCtx.closePath();
}


// Fill cells with their cluster colour (drawn under the outlines)
function drawCellFills(targetCtx) {

    if (!activeAnnotation) {
        return;
    }

    targetCtx.globalAlpha =
        cellFillOpacity;

    segmentationData.forEach(
        (cell, index) => {

            const label =
                cellLabels[index];

            if (
                label === undefined ||
                hiddenClusters.has(label) ||
                !cell.vertices.length
            ) {
                return;
            }

            targetCtx.fillStyle =
                clusterColors[label];

            traceCellPath(
                targetCtx,
                cell
            );

            targetCtx.fill();
        }
    );

    targetCtx.globalAlpha = 1;
}


// Legend for screenshots
function drawClusterLegendToContext(targetCtx) {

    if (!activeAnnotation) {
        return;
    }

    const labels =
        sortLabels(
            Object.keys(clusterCounts)
        ).filter(
            label =>
                !hiddenClusters.has(label)
        );

    const rowHeight = 18;
    const padding = 8;
    const margin = 20;

    // Only as many rows as fit
    const maxRows =
        Math.floor(
            (
                targetCtx.canvas.height -
                2 * margin -
                2 * padding -
                rowHeight
            ) /
            rowHeight
        );

    const shown =
        labels.slice(
            0,
            Math.max(0, maxRows)
        );

    targetCtx.save();

    targetCtx.font =
        "13px sans-serif";

    targetCtx.textBaseline =
        "middle";

    const width =
        Math.max(
            targetCtx.measureText(activeAnnotation).width,
            ...shown.map(
                label =>
                    targetCtx.measureText(label).width + 20
            )
        ) +
        2 * padding;

    const height =
        (shown.length + 1) * rowHeight +
        2 * padding;

    const x = margin;

    const y =
        targetCtx.canvas.height -
        margin -
        height;

    targetCtx.fillStyle =
        "rgba(0, 0, 0, 0.6)";

    targetCtx.fillRect(
        x,
        y,
        width,
        height
    );

    targetCtx.fillStyle = "white";

    targetCtx.font =
        "bold 13px sans-serif";

    targetCtx.fillText(
        activeAnnotation,
        x + padding,
        y + padding + rowHeight / 2
    );

    targetCtx.font =
        "13px sans-serif";

    shown.forEach(
        (label, index) => {

            const rowY =
                y +
                padding +
                (index + 1.5) * rowHeight;

            targetCtx.fillStyle =
                clusterColors[label];

            targetCtx.fillRect(
                x + padding,
                rowY - 6,
                12,
                12
            );

            targetCtx.fillStyle = "white";

            targetCtx.fillText(
                label,
                x + padding + 20,
                rowY
            );
        }
    );

    targetCtx.restore();
}


// Add annotations from a table and fill by the first one
function addAnnotationsFromText(text, fallbackName) {

    const tables =
        parseClusterTable(
            text,
            fallbackName
        );

    let best = null;
    let bestMatched = 0;

    for (
        const [name, map]
        of Object.entries(tables)
    ) {

        const matched =
            countMatchedCells(map);

        if (matched > bestMatched) {

            best = name;
            bestMatched = matched;
        }

        if (matched) {
            cellAnnotations[name] = map;
        }
    }

    if (!best) {

        const fileId =
            Object.values(tables)[0]
                .keys()
                .next()
                .value;

        throw new Error(
            "None of the cell IDs in the cluster file match the loaded cells " +
            `(file: "${fileId}", cells: "${segmentationData[0]?.cell_id}").`
        );
    }

    return {
        name: best,
        matched: bestMatched
    };
}


cellFillSelect.addEventListener(
    "change",
    async () => {

        const value =
            cellFillSelect.value;

        // Pick a CSV file
        if (value === "csv") {

            // Keep the current choice showing until a file is loaded
            cellFillSelect.value =
                activeAnnotation
                    ? "a:" + activeAnnotation
                    : "";

            document
                .getElementById("clusterFile")
                .click();

            return;
        }

        const name =
            value.slice(2);

        try {

            // Annotation file from the dataset that hasn't been read yet
            if (
                name &&
                typeof cellAnnotations[name] === "string"
            ) {

                const path =
                    cellAnnotations[name];

                const text =
                    bytesToText(
                        await getCompressedFile(path)
                    );

                let map;

                if (/\.json(\.gz)?$/i.test(path)) {

                    // { cell_id: label }
                    map =
                        new Map(
                            Object.entries(
                                JSON.parse(text)
                            ).map(
                                ([id, label]) => [
                                    id,
                                    String(label)
                                ]
                            )
                        );

                } else {

                    // Table: use its first cluster column
                    map =
                        Object.values(
                            parseClusterTable(
                                text,
                                name
                            )
                        )[0];
                }

                cellAnnotations[name] = map;
            }

            setActiveAnnotation(name);

        } catch (error) {

            console.error(error);

            showStatus(
                error.message,
                true
            );

            refreshCellFillOptions();
        }
    }
);


document
    .getElementById("clusterFile")
    .addEventListener(
        "change",
        async event => {

            const file =
                event.target.files[0];

            // Allow the same file to be picked again later
            event.target.value = "";

            if (!file) {
                return;
            }

            try {

                const text =
                    bytesToText(
                        new Uint8Array(
                            await file.arrayBuffer()
                        )
                    );

                const { name, matched } =
                    addAnnotationsFromText(
                        text,
                        file.name.replace(/\.(csv|tsv|txt)(\.gz)?$/i, "")
                    );

                refreshCellFillOptions();

                setActiveAnnotation(name);

                cellFillSelect.value =
                    "a:" + name;

                showStatus(
                    `Clusters loaded for ${matched.toLocaleString()} of ${segmentationData.length.toLocaleString()} cells.`
                );

                hideStatus(4000);

                // Count number of cluster files loaded
                window.goatcounter?.count({
                    path: "event/load-clusters",
                    title: "Load Clusters"
                });

            } catch (error) {

                console.error(error);

                showStatus(
                    error.message,
                    true
                );
            }
        }
    );


// Fill opacity
document
    .getElementById("cellFillOpacity")
    .addEventListener(
        "input",
        event => {

            cellFillOpacity =
                parseFloat(
                    event.target.value
                );

            updateOverlay();
        }
    );

*/


// Open the dataset named in the page address, if there is one
loadFromAddress();
