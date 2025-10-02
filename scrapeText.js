import { PrismaClient } from "./generated/prisma/index.js";
const prisma = new PrismaClient();
import fs from "fs/promises";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

import { spawn } from "child_process";
import { promisify } from "util";
import { exec as execCb } from "child_process";
import path from "path";
import { createWorker } from "tesseract.js";

const exec = promisify(execCb);

async function getMagickCommand() {
    try {
        await exec("magick -version");
        return "magick";
    } catch {
        return "convert"; // fallback for Linux
    }
}

async function convertPdfToPng(pdfPath, outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
    const magickCmd = await getMagickCommand();

    return new Promise((resolve, reject) => {
        const outputPattern = path.join(outputDir, "page-%d.png");
        const args = ["-density", "300", pdfPath, outputPattern];
        const magick = spawn(magickCmd, args);

        magick.on("error", reject);
        magick.on("close", async (code) => {
            if (code !== 0) return reject(new Error(`${magickCmd} exited with code ${code}`));

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

    const where =         {
        document: 'qp',
        examBoard: 'ocr-a',
        subject: 'biology',
        // paper: 'paper-1',
        // year: 2017\
        // paper: {
        //     in: [
        //         'mechanics-minor',
        //         'mechanics-major',
        //         'statistics-major',
        //         'pure-core',
        //         'statistics-minor'
        //     ]
        // },
    }

    const questions = await prisma.examQuestion.findMany({
        where
    })
    const questionIds = questions.map(eq => eq.id);

// step 2: delete linked QuestionTexts
    if (questionIds.length > 0) {
        await prisma.questionText.deleteMany({
            where: {
                questionId: { in: questionIds },
            },
        });
    }
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
        const cleanedText = fullText
            .trim()
            .replace(/\.{2,}/g, "")          // remove long runs of dots
            .replace(/\s+/g, " ")            // normalize spaces
            .replace(/\u0000/g, "")          // remove null bytes
            .replace(/[\x00-\x1F\x7F]/g, "") // optional: strip all control chars
            .trim();
        await prisma.questionText.create({
            data: {
                questionId: id,
                content: cleanedText,
            },
        });
    }
}


main().catch(console.error);