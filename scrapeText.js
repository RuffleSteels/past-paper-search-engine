import { PrismaClient } from "./generated/prisma/index.js";
const prisma = new PrismaClient();
import fs from "fs/promises";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = "pdfjs-dist/build/pdf.worker.mjs";
const originalWarn = console.warn;
console.warn = function (...args) {
    if (args[0] && args[0].toString().includes("standardFontDataUrl")) return;
    originalWarn.apply(console, args);
};

async function main() {

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
        const {path, id} = question

        const fileData = new Uint8Array(await fs.readFile(path));
        const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;

        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Extract just the text strings
            const pageText = textContent.items
                .map((item) => item.str)
                .join(" ");

            fullText += pageText + "\n"; // keep pages separated
        }

        const cleanedText = fullText.trim().replace(/\.{2,}/g, "").replace(/\s+/g, " ").trim()
        await prisma.questionText.create({
            data: {
                questionId: id, // link to the ExamQuestion
                content: cleanedText,
            },
        });
    }
}


main().catch(console.error);