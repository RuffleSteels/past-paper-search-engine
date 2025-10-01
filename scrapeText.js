import { PrismaClient } from "./generated/prisma/index.js";
const prisma = new PrismaClient();
import fs from "fs/promises";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { spawn } from "child_process";
import path from "path";
import { createWorker } from "tesseract.js";

async function convertPdfToPng(pdfPath, outputDir) {
    await fs.mkdir(outputDir, { recursive: true });

    return new Promise((resolve, reject) => {
        // Run `magick -density 300 input.pdf output/page.png`
        const outputPattern = path.join(outputDir, "page.png");
        const magick = spawn("magick", ["-density", "300", pdfPath, outputPattern]);

        magick.on("error", reject);
        magick.on("close", async (code) => {
            if (code !== 0) return reject(new Error(`magick exited with code ${code}`));

            const files = (await fs.readdir(outputDir))
                .filter((f) => f.startsWith("page") && f.endsWith(".png"))
                .map((f) => path.join(outputDir, f));

            resolve(files);
        });
    });
}

async function pdfToText(pdfPath) {
    const outputDir = "./tmp";
    const pngFiles = await convertPdfToPng(pdfPath, outputDir);

    const worker = await createWorker("eng");
    let fullText = "";

    for (const file of pngFiles) {
        console.log(`OCR processing: ${file}`);
        const { data: { text } } = await worker.recognize(file);
        fullText += text + "\n";
    }

    await worker.terminate();
    return fullText.trim();
}



GlobalWorkerOptions.workerSrc = "pdfjs-dist/build/pdf.worker.mjs";
const originalWarn = console.warn;
console.warn = function (...args) {
    if (args[0] && args[0].toString().includes("standardFontDataUrl")) return;
    originalWarn.apply(console, args);
};

async function main() {
    await prisma.questionText.deleteMany()
    const where =         {
        document: 'qp',
        examBoard: 'edexcel',
        subject: 'physics',
        // paper: 'paper-1',
        // year: 2017
    }

    const questions = await prisma.examQuestion.findMany({
        where
    })

    for (const question of questions) {
        const {path, id, encoded} = question

        let fullText = "";
        if (encoded) {
            fullText = await pdfToText(path)
            console.log(path)
        } else {
            const fileData = new Uint8Array(await fs.readFile(path));
            const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();

                // Extract just the text strings
                const pageText = textContent.items
                    .map((item) => item.str)
                    .join(" ");

                fullText += pageText + "\n"; // keep pages separated
            }
        }
        const cleanedText = fullText.trim().replace(/\.{2,}/g, "").replace(/\s+/g, " ").trim()
        await prisma.questionText.create({
            data: {
                questionId: id,
                content: cleanedText,
            },
        });
    }
}


main().catch(console.error);