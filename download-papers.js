import fs from "fs/promises";
import path from "path";
import { PrismaClient } from "./generated/prisma/index.js";

const prisma = new PrismaClient();

const examBoard = "Edexcel";
const subject = "Physics";
const papers = ["Paper-1", "Paper-2", "Paper-3"];
const years = Array.from({ length: 2024 - 2017 + 1 }, (_, i) => 2017 + i);



const FILENAME_REGEX = /^([a-z0-9]+)-([a-z0-9]+)-(.+)-(\d{4})-(qp|ms)\.pdf$/i;

async function scanAndInsert(folder) {
    const files = await fs.readdir(folder);

    for (const file of files) {
        const match = file.match(FILENAME_REGEX);
        if (!match) {
            console.warn(`⚠️ Skipping unrecognized file: ${file}`);
            continue;
        }

        const [ , examBoard, subject, paper, year, document ] = match;
        const outputPath = path.join(folder, file);

        await prisma.examPaper.upsert({
            where: { path: outputPath },
            update: {}, // do nothing if already exists
            create: {
                examBoard,
                subject,
                paper,
                year: parseInt(year, 10),
                document,
                path: outputPath,
            },
        });

        console.log(`📂 Inserted existing file: ${file}`);
    }
}

async function downloadPDF(url, outputPath) {
    const res = await fetch(url);
    if (!res.ok) {
        console.warn(`⚠️ Skipping: ${url} (status ${res.status})`);
        return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
    return true;
}

async function main() {
    const folder = path.resolve("./papers");
    await fs.mkdir(folder, { recursive: true });
    await scanAndInsert(folder)
    // for (const year of years) {
    //     for (const paper of papers) {
    //         const pdfLink = `https://pmt.physicsandmathstutor.com/download/${subject}/A-level/Past-Papers/${examBoard}/${paper}/QP/June%20${year}%20QP.pdf`;
    //         const filename = `${examBoard.toLowerCase()}-${subject.toLowerCase()}-${paper.toLowerCase()}-${year}-qp.pdf`;
    //         const outputPath = path.join(folder, filename);
    //
    //         console.log(`⬇️ Downloading: ${pdfLink}`);
    //         const success = await downloadPDF(pdfLink, outputPath);
    //
    //         if (success) {
    //             await prisma.examPaper.upsert({
    //                 where: { path: outputPath },
    //                 update: {}, // do nothing if already exists
    //                 create: {
    //                     examBoard: examBoard.toLowerCase(),
    //                     subject: subject.toLowerCase(),
    //                     paper: paper.toLowerCase(),
    //                     year,
    //                     document: 'qp',
    //                     path: outputPath,
    //                 },
    //             });
    //             console.log(`✅ Saved & inserted: ${filename}`);
    //         }
    //     }
    // }
}

main()
    .catch(err => console.error("❌ Error:", err))
    .finally(async () => {
        // await prisma.$disconnect();
        console.log("🎉 Done!");
    });
