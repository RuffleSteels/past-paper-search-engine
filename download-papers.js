import fs from "fs";
import path from "path";
import { PrismaClient } from "./generated/prisma/index.js";

const prisma = new PrismaClient();

const examBoard = "Edexcel";
const subject = "Physics";
const papers = ["Paper-1", "Paper-2", "Paper-3"];
const years = Array.from({ length: 2024 - 2017 + 1 }, (_, i) => 2017 + i);

const folder = path.resolve("./papers");
if (!fs.existsSync(folder)) fs.mkdirSync(folder);

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
    for (const year of years) {
        for (const paper of papers) {
            const pdfLink = `https://pmt.physicsandmathstutor.com/download/${subject}/A-level/Past-Papers/${examBoard}/${paper}/QP/June%20${year}%20QP.pdf`;
            const filename = `${examBoard.toLowerCase()}-${subject.toLowerCase()}-${paper.toLowerCase()}-${year}-qp.pdf`;
            const outputPath = path.join(folder, filename);

            console.log(`⬇️ Downloading: ${pdfLink}`);
            const success = await downloadPDF(pdfLink, outputPath);

            if (success) {
                await prisma.examPaper.upsert({
                    where: { path: outputPath },
                    update: {}, // do nothing if already exists
                    create: {
                        examBoard: examBoard.toLowerCase(),
                        subject: subject.toLowerCase(),
                        paper: paper.toLowerCase(),
                        year,
                        document: 'qp',
                        path: outputPath,
                    },
                });
                console.log(`✅ Saved & inserted: ${filename}`);
            }
        }
    }
}

main()
    .catch(err => console.error("❌ Error:", err))
    .finally(async () => {
        await prisma.$disconnect();
        console.log("🎉 Done!");
    });
