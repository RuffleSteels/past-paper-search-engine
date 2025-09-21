import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "canvas";
const canvas = createCanvas(1, 1);
const ctx = canvas.getContext("2d");
GlobalWorkerOptions.workerSrc = "pdfjs-dist/build/pdf.worker.mjs";
// Utility: convert TOP-based fraction to pdf-lib Y coord
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


// Use pdf.js to extract horizontal "special lines"
export async function extractPageSplits(pdfPath, srcDoc) {
    const newDoc = await PDFDocument.create();
    const [srcPage] = await newDoc.copyPages(srcDoc, [1]);

    const fileData = new Uint8Array(await fs.readFile(pdfPath));
    const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;

    let questionCounter = 1;
    const pageSplits = {};

    let minX = 0;
    let maxX = 1;
    let fontName = ''
    for (let i = 2; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);

        const epsilon = (srcPage.getSize().height - srcPage.getCropBox().height)/2;
        const viewport = page.getViewport({ scale: 1 })

        const opList = await page.getOperatorList();
        let splits = [];
        let splitss = []

        let currentTransform = [1, 0, 0, 1, 0, 0]; // default CTM

        let r = 0;
        let g = 0;
        let b = 0;

        const textContent = await page.getTextContent();

        if (fontName === '') {
            for (const item of textContent.items) {
                const text = (item.str || "").toLowerCase();
                if (text.includes("total for question") || text.includes("answer all questions in the spaces provided")) {
                    fontName = item.fontName;
                }
            }
        }

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
        splits = splits.sort((a, b) => a - b);

        for (let j = 0; j < opList.fnArray.length; j++) {
            const fn = opList.fnArray[j];
            const args = opList.argsArray[j];

            switch (fn) {
                case pdfjsLib.OPS.setStrokeRGBColor:
                    r = parseInt(args[0].slice(1, 3), 16);
                    g = parseInt(args[0].slice(3, 5), 16);
                    b = parseInt(args[0].slice(5, 7), 16);
                    break;
                case 12: // cm
                    currentTransform = args;
                    break;

                case 91: // like fn=91
                    if (
                        args[2][0] === 0 &&
                        args[2][1] === 0 &&
                        Math.round(args[2][2]) === 510 &&
                        args[2][3] === 0
                    ) {
                        // console.log(r,g,b)
                        if (r+g+b < 150) break;
                        if (minX === 0) minX = pdfLeftToViewportLeft(currentTransform[4], viewport) / viewport.width
                        if (maxX === 0) maxX = pdfLeftToViewportLeft(510 + currentTransform[4], viewport) / viewport.width;

                        const lineY = currentTransform[5]; // translation Y
                        const viewportHeight = viewport.height;
                        splitss.push((pdfTopToViewportTop(lineY, viewport) - epsilon) / viewportHeight);
                    }
                    break;
            }
        }
        splitss = splitss.sort((a, b) => a - b);

        pageSplits[i] = [...splits, ...splitss]
    }

    return [pageSplits, [minX, maxX]];
}

// Convert pageSplits into clip ranges
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

    // if (residual) console.warn("⚠️ leftover residual", residual);
    return clips;
}

// Use pdf-lib to crop & stitch each clip
export async function stitchClip(srcDoc, clip, outPath, minXp, maxXp) {
    let { startPage, endPage, startY, endY } = clip;

    const newDoc = await PDFDocument.create();
    const fragments = [];
    let totalHeight = 0;
    let maxWidth = 0;

    for (let p = startPage; p <= endPage; p++) {
        const [srcPage] = await newDoc.copyPages(srcDoc, [p - 1]);
        // Use CropBox to match pdf.js rendering
        const { width, height } = srcPage.getCropBox();

        let top, bottom;

        const minX = minXp * width + (srcPage.getSize().width - srcPage.getCropBox().width )/2
        const maxX = (maxXp-.07) * width + (srcPage.getSize().width - srcPage.getCropBox().width )/2
        const epsilon = (srcPage.getSize().height - srcPage.getCropBox().height)/2;

        if (startPage === endPage) {
            top = fracFromTopToPdfY(startY, height);
            bottom = fracFromTopToPdfY(endY, height);
        } else if (p === startPage) {
            top = fracFromTopToPdfY(startY, height);
            bottom = 100 + epsilon;
        } else if (p === endPage) {
            top = height - 20 - 20 + epsilon;
            bottom = fracFromTopToPdfY(endY, height);
        } else {
            top = height - 20 - 20 + epsilon;
            bottom = 100 + epsilon;
        }

        top = Math.min(Math.max(top, 0), height);
        bottom = Math.min(Math.max(bottom, 0), height);

        const fragHeight = top - bottom;
        if (fragHeight <= 0) continue;

        const embedded = await newDoc.embedPage(srcPage, {
            left: minX,
            bottom,
            right: maxX,
            top,
        });

        fragments.push({ embedded, width: maxX - minX, height: fragHeight });
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
    console.log("✅ Saved", outPath);
}