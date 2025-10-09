import fs from "fs/promises";
import {degrees, PDFDocument} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, Image } from "@napi-rs/canvas";
GlobalWorkerOptions.workerSrc = "pdfjs-dist/build/pdf.worker.mjs";
global.Image = Image;
const canvas = createCanvas(1, 1);
const ctx = canvas.getContext("2d");

function fracFromTopToPdfY(f, height) {
    return height * (1 - f);
}


function getTextItemRect(item, viewport, ctx) {
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 12;
    const baselineX = tx[4];
    const baselineY = tx[5];

    ctx.save();
    ctx.font = `${fontHeight}px sans-serif`;
    ctx.textBaseline = "alphabetic";
    const width = ctx.measureText(item.str).width;
    ctx.restore();

    const left = baselineX;
    const top = baselineY - fontHeight;

    return { left, top, width, height: fontHeight };
}
function pdfTopToViewportTop(pdfTop, viewport) {
    // convert a single point (0, pdfTop) from PDF to viewport coordinates
    const [, viewportY] = viewport.convertToViewportPoint(0, pdfTop);
    return viewportY;
}

function pdfLeftToViewportLeft(pdfLeft, viewport) {
    const [viewportX,] = viewport.convertToViewportPoint(pdfLeft, 0);
    return viewportX;
}
function isValidString(str) {
    const regex = /^\s*\*?\s*(?:[1-9]|[1-9][0-9])\**\s*(?:(?:\(?[a-z](?:i+)?\)?|\(?i+\)?)\**)*\s*$/i;
    return regex.test(str.replace(/\s+/g, ''));
}
export async function extractPageSplitsMs(pdfPath, srcDoc) {
    const newDoc = await PDFDocument.create();
    const [srcPage] = await newDoc.copyPages(srcDoc, [1]);

    const fileData = new Uint8Array(await fs.readFile(pdfPath));
    const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;

    let questionCounter = 1;
    const pageSplits = {};

    let minX = 0;
    let maxX = 1;
    let residual = ''
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 })
        let splits = [];

        const textContent = await page.getTextContent();

        for (const item of textContent.items) {
            const text = (item.str || "").toLowerCase();

            if (parseInt(text.replace(/\*/g, "")) && isValidString(text) && getTextItemRect(item, viewport, ctx).left < 80 ) {
                const clean = text.replace(/\D/g, "")
                console.log(clean)
                if (parseInt(clean) === questionCounter) {
                    const viewportHeight = viewport.height;
                    const rect = getTextItemRect(item, viewport, ctx);
                    splits.push((rect.top) / viewportHeight);

                    questionCounter++
                } else {
                    if (questionCounter > 9) {
                        if (parseInt(`${residual}${clean}`) === questionCounter) {
                            const viewportHeight = viewport.height;
                            const rect = getTextItemRect(item, viewport, ctx);
                            splits.push((rect.top) / viewportHeight);

                            questionCounter++;
                            residual = ''
                        } else {
                            residual = clean
                        }
                    }
                }
            }
        }

        splits = splits.sort((a, b) => a - b);

        pageSplits[i] = [...splits]
    }
    console.log(pageSplits)
    return [pageSplits, [minX, maxX], pdf.numPages];
}
function isBlack(r, g, b, a, threshold = 1) {
    if (a === 0) return false; // fully transparent, not black

    // Normalize brightness (0=black, 1=white)
    const brightness = (r + g + b) / (3 * 255);

    // Accept if brightness is below (1 - threshold)
    return brightness <= (1 - threshold);
}
// Use pdf.js to extract horizontal "special lines"
export async function extractPageSplits(pdfPath, srcDoc, board) {
    const newDoc = await PDFDocument.create();
    const [srcPage] = await newDoc.copyPages(srcDoc, [1]);
    let encoded = false;
    const fileDataf = new Uint8Array(await fs.readFile(pdfPath));
    const pdff = await pdfjsLib.getDocument({ data: fileDataf }).promise;

    let questionCounter = 1;
    const pageSplits = {};

    let minX = 0;
    let maxX = 1;
    let fontName = ''
    let endTrue = false
    let endBound = 1
    for (let i = 2; i <= pdff.numPages; i++) {
        const fileData = new Uint8Array(await fs.readFile(pdfPath));
        const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;

        const page = await pdf.getPage(i);


        const epsilon = (srcPage.getSize().height - srcPage.getCropBox().height)/2;
        const viewport = page.getViewport({ scale: 1 })

        const opList = await page.getOperatorList();
        let splits = [];
        let splitss = []

        let currentTransform = [1, 0, 0, 1, 0, 0];

        let r = 0;
        let g = 0;
        let b = 0;

        const textContent = await page.getTextContent();

        if (board.includes('ocr-mei')) {
            const { canvas, viewport } = await renderPageToCanvas(pdfPath, i, 1.0);

            const ctx = canvas.getContext("2d");

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({canvasContext: ctx, viewport}).promise;
            for (const item of textContent.items) {
                const text = (item.str || "").toLowerCase();
                if (text.includes('copyright information') && i >= pdf.numPages) {
                    const rect = getTextItemRect(item, viewport, ctx);
                    endBound = (rect.top - 40 - epsilon) / viewport.height;
                }
                if (text.includes("end of question paper")) {
                    endTrue = true;
                    const rect = getTextItemRect(item, viewport, ctx);
                    splits.push((rect.top- epsilon) / viewport.height);
                }
            }




            const cropX = 49;
            const cropWidth = 5; // (50 - 10)
            const cropHeight = canvas.height;

            const imageData = ctx.getImageData(cropX, 0, cropWidth, cropHeight);
            const data = imageData.data;


            const blackYs = [];
            let lastY = -Infinity; // Start with a very negative number
            const cropX2 = 63;
            const cropWidth2 = 6;
            const imageData2 = ctx.getImageData(cropX2, 0, cropWidth2, cropHeight);
            const data2 = imageData2.data;

            // for (let y = 0; y < cropHeight; y++) {
            //     let foundInRow = false;
            //
            //     for (let x = 0; x < cropWidth; x++) {
            //         const idx = (y * cropWidth + x) * 4; // RGBA
            //         const r = data[idx];
            //         const g = data[idx + 1];
            //         const b = data[idx + 2];
            //         const a = data[idx + 3];
            //
            //         if (isBlack(r, g, b, a, 0.8)) {
            //             // Only count this if it's far enough from the last recorded Y
            //             if (y - lastY >= 10) {
            //                 blackYs.push(y);
            //                 lastY = y;
            //             }
            //             foundInRow = true;
            //             break; // No need to keep scanning the rest of this row
            //         }
            //     }
            // }

            for (let y = 0; y < cropHeight; y++) {
                let foundBlack = false;

                // Scan left strip for black
                for (let x = 0; x < cropWidth; x++) {
                    const idx = (y * cropWidth + x) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    const a = data[idx + 3];

                    if (isBlack(r, g, b, a, 0.80)) {
                        foundBlack = true;
                        break;
                    }
                }

                if (foundBlack && y - lastY >= 10) {
                    let blackAtX50 = false;

                    for (let dy = -10; dy <= 10; dy++) {
                        const checkY = y + dy;
                        if (checkY < 0 || checkY >= cropHeight) continue;

                        for (let x2 = 0; x2 < cropWidth2; x2++) {
                            const idx2 = (checkY * cropWidth2 + x2) * 4;
                            const r2 = data2[idx2];
                            const g2 = data2[idx2 + 1];
                            const b2 = data2[idx2 + 2];
                            const a2 = data2[idx2 + 3];

                            if (isBlack(r2, g2, b2, a2, 0.80)) {
                                blackAtX50 = true;
                                break;
                            }
                        }

                        if (blackAtX50) break;
                    }

                    if (!blackAtX50) {
                        blackYs.push(y);
                        lastY = y;
                    }
                }
            }

            console.log("Black pixel Y positions:", blackYs);

            for (const y of blackYs) {
                const bound = (y - 8 - epsilon) / viewport.height
                if (i >= pdf.numPages && bound > endBound) continue

                splits.push(bound);
            }

            splits = splits.sort((a, b) => a - b);
            pageSplits[i] = [...splits]
        } else if (board.includes('ocr')) {
            const { canvas, viewport } = await renderPageToCanvas(pdfPath, i, 1.0);

            const ctx = canvas.getContext("2d");

            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({canvasContext: ctx, viewport}).promise;

            if (i <= 2) {
                for (let j = 0; j < pdf.numPages ; j++) {
                    const fileData2 = new Uint8Array(await fs.readFile(pdfPath));
                    const pdf2 = await pdfjsLib.getDocument({ data: fileData2 }).promise;
                    const page2 = await pdf2.getPage(j+1);
                    const textContent = await page2.getTextContent();
                    if (fontName === '') {
                        for (const item of textContent.items) {
                            const text = (item.str || "").toLowerCase();
                            if (text.includes("end of question paper")) {
                                fontName = item.fontName;
                            }
                        }
                    }
                }
            }
            let residual = ''
            for (const item of textContent.items) {
                if (endTrue) continue
                const text = (item.str || "").toLowerCase();



                if (isValidString(text.trim()) && getTextItemRect(item, viewport, ctx).left < 60) {
                    console.log(item)
                    const clean = text.replace(/\D/g, "")
                    if (parseInt(clean) === questionCounter) {
                        const viewportHeight = viewport.height;
                        const rect = getTextItemRect(item, viewport, ctx);
                        splits.push((rect.top) / viewportHeight);

                        questionCounter++
                    } else {
                        if (questionCounter > 9) {
                            if (parseInt(`${residual}${clean}`) === questionCounter) {
                                const viewportHeight = viewport.height;
                                const rect = getTextItemRect(item, viewport, ctx);
                                splits.push((rect.top) / viewportHeight);

                                questionCounter++;
                                residual = ''
                            } else {
                                residual = clean
                            }
                        }
                    }
                }
                if (text.includes('copyright information') && i >= pdf.numPages) {
                    const rect = getTextItemRect(item, viewport, ctx);
                    endBound = (rect.top - 40 - epsilon) / viewport.height;
                }
                if (text.includes("end of question paper")) {
                    endTrue = true;
                    const rect = getTextItemRect(item, viewport, ctx);
                    splits.push((rect.top- epsilon) / viewport.height);
                }
            }

            splits = splits.sort((a, b) => a - b);
            pageSplits[i] = [...splits]
        } else {
            if (fontName === '') {
                for (const item of textContent.items) {
                    const text = (item.str || "").toLowerCase();
                    if (text.includes("total for question") || text.includes("answer all questions in the spaces provided")) {
                        fontName = item.fontName;
                    }
                }
            }

            if (fontName === '') {
                encoded = true
                const { canvas, viewport } = await renderPageToCanvas(pdfPath, i, 1.0);

                const ctx = canvas.getContext("2d");

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({canvasContext: ctx, viewport}).promise;

                const cropX = 42;
                const cropWidth = 4;
                const cropHeight = canvas.height;

                const imageData = ctx.getImageData(cropX, 0, cropWidth, cropHeight);
                const data = imageData.data;

                const blackYs = [];
                let lastY = -Infinity; // Start with a very negative number

                for (let y = 0; y < cropHeight; y++) {
                    let foundInRow = false;

                    for (let x = 0; x < cropWidth; x++) {
                        const idx = (y * cropWidth + x) * 4; // RGBA
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        const a = data[idx + 3];

                        if (isBlack(r, g, b, a)) {
                            if (y - lastY >= 10) {
                                blackYs.push(y);
                                lastY = y;
                            }
                            foundInRow = true;
                            break;
                        }
                    }
                }

                console.log("Black pixel Y positions:", blackYs, i);

                for (const y of blackYs) {
                    splits.push((y - 8 - epsilon) / viewport.height);
                }
            } else {
                for (const item of textContent.items) {
                    const text = (item.str || "").toLowerCase();
                    if (item.fontName) {
                        const cleaned = text.replace(/[* ]/g, "");
                        if (/^-?\d+$/.test(cleaned)) {
                            if (parseInt(cleaned, 10) === questionCounter) {
                                const viewportHeight = viewport.height;
                                const rect = getTextItemRect(item, viewport, ctx);
                                if (rect.left > 46) continue;
                                questionCounter++;
                                splits.push((rect.top - epsilon) / viewportHeight);
                            }
                        }
                    }
                }
            }

            splits = splits.sort((a, b) => a - b);

            let doDoubleSplit = false;

            for (let j = 0; j < opList.fnArray.length; j++) {
                const fn = opList.fnArray[j];
                const args = opList.argsArray[j];

                switch (fn) {
                    case pdfjsLib.OPS.setStrokeRGBColor:
                        r = parseInt(args[0].slice(1, 3), 16);
                        g = parseInt(args[0].slice(3, 5), 16);
                        b = parseInt(args[0].slice(5, 7), 16);
                        break;
                    case 12:
                        currentTransform = args;
                        break;

                    case 91:
                        if (
                            args[2][0] === 0 &&
                            args[2][1] === 0 &&
                            Math.round(args[2][2]) === 510 &&
                            args[2][3] === 0
                        ) {
                            if (r+g+b < 150) break;
                            if (minX === 0) minX = pdfLeftToViewportLeft(currentTransform[4], viewport) / viewport.width
                            if (maxX === 0) maxX = pdfLeftToViewportLeft(510 + currentTransform[4], viewport) / viewport.width;

                            const lineY = currentTransform[5]; // translation Y
                            const viewportHeight = viewport.height;
                            splitss.push((pdfTopToViewportTop(lineY, viewport) - epsilon) / viewportHeight);
                            doDoubleSplit = true;
                        }
                        break;
                }
            }
            splitss = splitss.sort((a, b) => a - b);

            pageSplits[i] = [...splits, ...splitss]
        }
        pdf.destroy();
    }

    if (board.includes('ocr') && !endTrue) {
        pageSplits[pdff.numPages-1] = 1;
    }

    return [pageSplits, [minX, maxX], encoded];
}

export function buildClips(pageDict) {
    const clips = [];
    let residual = null;
    const pages = Object.keys(pageDict).map(Number).sort((a, b) => a - b);

    for (const page of pages) {
        const coords = [...pageDict[page]];
        if (coords.length === 0) continue;

        if (residual) {
            const endY = coords.shift();
            clips.push({ startPage: residual.page, startY: residual.y, endPage: page, endY });
            residual = null;
        }

        if (coords.length === 1) {
            residual = { page, y: coords[0] };
            continue;
        }

        const half = Math.floor(coords.length / 2);
        const starts = coords.slice(0, half);
        const ends = coords.slice(half);
        for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
            clips.push({ startPage: page, startY: starts[i], endPage: page, endY: ends[i] });
        }
        if (coords.length % 2 === 1) {
            residual = { page, y: coords[coords.length - 1] };
        }
    }

    return clips;
}

function findWhiteGaps(canvas, threshold = 250, minGapHeight = 100, marg = 10) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);

    let whiteRuns = [];
    let runStart = null;

    for (let y = 0; y < height; y++) {
        let rowWhite = true;
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = imageData.data[idx];
            const g = imageData.data[idx + 1];
            const b = imageData.data[idx + 2];

            if (r < threshold || g < threshold || b < threshold) {
                rowWhite = false;
                break;
            }
        }

        if (rowWhite) {
            if (runStart === null) runStart = y;
        } else {
            if (runStart !== null) {
                if (y - runStart >= minGapHeight) {
                    whiteRuns.push({ from: runStart + marg, to: y - marg });
                }
                runStart = null;
            }
        }
    }

    // last run
    if (runStart !== null && height - runStart >= minGapHeight) {
        whiteRuns.push({ from: runStart + marg, to: height - marg });
    }

    return whiteRuns;
}


// Minimal NodeCanvasFactory for pdfjs rendering (same idea you used)
class NodeCanvasFactory {
    create(width, height) {
        if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
        const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
        const context = canvas.getContext("2d");
        return { canvas, context };
    }
    reset(canvasAndContext, width, height) {
        canvasAndContext.canvas.width = Math.ceil(width);
        canvasAndContext.canvas.height = Math.ceil(height);
    }
    destroy(canvasAndContext) {
        // help GC
        canvasAndContext.context = null;
        canvasAndContext.canvas = null;
    }
}


// Helper: render page to node-canvas and return canvas + pdfjs viewport
async function renderPageToCanvas(pdfPath, pageIndex = 1, scale = 1.0) {
    const loadingTask = pdfjsLib.getDocument(pdfPath);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageIndex); // 1-based for pdfjs
    const viewport = page.getViewport({ scale });

    const factory = new NodeCanvasFactory();
    const { canvas, context } = factory.create(viewport.width, viewport.height);

    await page.render({
        canvasContext: context,
        viewport,
        canvasFactory: factory,
    }).promise;

    // return canvas and viewport (we need viewport.width/height to convert pixel->pdf points)
    return { canvas, viewport, page };
}




export async function removeWhiteBands(inputPath, outputPath, {
    pageIndex = 1,
    threshold = 250,
    minGapHeight = 100,
    pdfjsScale = 1.0
} = {}) {
    // detect gaps
    const { canvas, viewport } = await renderPageToCanvas(inputPath, pageIndex, pdfjsScale);
    const whiteRunsPx = findWhiteGaps(canvas, threshold, minGapHeight);

    if (!whiteRunsPx.length) {
        await fs.copyFile(inputPath, outputPath);
        return;
    }

    const srcBytes = await fs.readFile(inputPath);
    const srcPdf = await PDFDocument.load(srcBytes);
    const srcPage = srcPdf.getPage(pageIndex - 1);
    const { width: pdfWidth, height: pdfHeight } = srcPage.getSize();

    const scaleFactor = viewport.width / pdfWidth;

    // pixel → points
    const whiteRunsPts = whiteRunsPx.map(r => {
        const fromPts = (viewport.height - r.to) / scaleFactor;
        const toPts   = (viewport.height - r.from) / scaleFactor;
        return { from: fromPts, to: toPts };
    });

    // merge
    whiteRunsPts.sort((a,b)=> a.from - b.from);
    const merged = [];
    for (const run of whiteRunsPts) {
        if (!merged.length) merged.push(run);
        else {
            const last = merged[merged.length-1];
            if (run.from <= last.to + 0.01) last.to = Math.max(last.to, run.to);
            else merged.push(run);
        }
    }

    // kept
    const segments = [];
    let cur = 0;
    for (const run of merged) {
        if (run.from > cur + 0.0001) segments.push({ from: cur, to: run.from });
        cur = Math.max(cur, run.to);
    }
    if (cur < pdfHeight - 0.0001) segments.push({ from: cur, to: pdfHeight });

    if (!segments.length) throw new Error("All content removed.");

    // output
    const outPdf = await PDFDocument.create();

    for (const seg of segments.reverse()) {
        const segHeight = seg.to - seg.from;

        // copy source page
        const [copy] = await outPdf.copyPages(srcPdf, [pageIndex - 1]);
        // crop box is bottom-left origin
        copy.setCropBox(0, seg.from, pdfWidth, segHeight);
        outPdf.addPage(copy);
    }

    const outBytes = await outPdf.save();
    await fs.writeFile(outputPath, outBytes);
    console.log(`Saved vector PDF with ${segments.length} cropped pages to ${outputPath}`);
}

export async function stackPdfVertically(inputPath, outputPath) {
    // Load input
    const pdfBytes = await fs.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Get all cropped pages
    const pages = pdfDoc.getPages();

    // Measure using crop boxes, not full page sizes
    const widths = pages.map(p => p.getCropBox().width);
    const heights = pages.map(p => p.getCropBox().height);

    // New PDF
    const newPdf = await PDFDocument.create();

    // Total height = sum of cropped heights
    const totalHeight = heights.reduce((a, b) => a + b, 0);
    const maxWidth = Math.max(...widths);

    // Create one tall page
    const stackedPage = newPdf.addPage([maxWidth, totalHeight]);

    // Draw cropped pages one by one
    let currentY = totalHeight;
    for (const page of pages) {
        const cropBox = page.getCropBox();
        const cropWidth = cropBox.width;
        const cropHeight = cropBox.height;

        const [embedded] = await newPdf.embedPages([page], [{
            left: cropBox.x,
            bottom: cropBox.y,
            right: cropBox.x + cropWidth,
            top: cropBox.y + cropHeight,
        }]);

        currentY -= cropHeight;

        stackedPage.drawPage(embedded, {
            x: 0,
            y: currentY,
            width: cropWidth,
            height: cropHeight,
        });
    }

    // Save to file
    const newPdfBytes = await newPdf.save();
    await fs.writeFile(outputPath, newPdfBytes);
}
export async function stitchClip(srcDoc, clip, outPath, outPath2, minXp, maxXp, isMs=false) {
    let { startPage, endPage, startY, endY } = clip;

    const newDoc = await PDFDocument.create();
    const fragments = [];
    let totalHeight = 0;
    let maxWidth = 0;

    for (let p = parseInt(startPage); p <= parseInt(endPage); p++) {
        const [srcPage] = await newDoc.copyPages(srcDoc, [p - 1]);

        // get crop size
        const { width, height } = srcPage.getCropBox();

        let top, bottom;

        const minX = isMs || minXp === 0
            ? 0
            : (minXp * width + (srcPage.getSize().width - srcPage.getCropBox().width) / 2);

        const maxX = isMs || maxXp === 1
            ? width
            : ((maxXp - 0.07) * width + (srcPage.getSize().width - srcPage.getCropBox().width) / 2);

        const epsilon = (srcPage.getSize().height - srcPage.getCropBox().height) / 2;

        if (parseInt(startPage )=== parseInt(endPage)) {
            top = fracFromTopToPdfY(startY, height);
            bottom = fracFromTopToPdfY(endY, height);
        } else if (parseInt(p) === parseInt(startPage)) {
            top = fracFromTopToPdfY(startY, height);
            bottom = (isMs ? 0 : 100) + epsilon;
        } else if (parseInt(p) === parseInt(endPage)) {
            top = height - 20 - 20 + epsilon;
            bottom = fracFromTopToPdfY(endY, height);
        } else {
            top = height - 20 - 20 + epsilon;
            bottom = (isMs ? 0 : 100) + epsilon;
        }

        top = Math.min(Math.max(top, 0), height);
        bottom = Math.min(Math.max(bottom, 0), height);

        const fragHeight = top - bottom;
        console.log(fragHeight)
        if (fragHeight <= 0) continue;

        const embedded = await newDoc.embedPage(srcPage, {
            left: minX,
            bottom:  bottom,
            right:  maxX,
            top:  top,
        });

        fragments.push({ embedded, width: maxX - minX, height:  fragHeight });
        totalHeight += fragHeight;
        maxWidth = Math.max(maxWidth, maxX - minX);
    }

    if (fragments.length === 0) {
        console.warn("No fragments for clip", clip);
        return;
    }

    const stitched = newDoc.addPage([maxWidth, totalHeight]);

    let yOffset = totalHeight;
    for (const frag of fragments) {
        yOffset -= frag.height;
        stitched.drawPage(frag.embedded, {
            x: 0,
            y: yOffset,
            width: frag.width,
            height: frag.height,
        });
    }

    const outBytes = await newDoc.save();
    await fs.writeFile(outPath, outBytes);

    if (!isMs) {
        await removeWhiteBands(outPath, outPath);
        await stackPdfVertically(outPath, outPath2);
    }

    console.log("✅ Saved", outPath);
}