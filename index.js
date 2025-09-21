// splitAndCut.js
import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { PrismaClient } from "./generated/prisma/index.js";
import {extractPageSplits, buildClips, stitchClip, removeWhiteBands} from "./utils.js"

const prisma = new PrismaClient();
const outDir = "./out";

async function processPaper(paper) {
    const { examBoard, subject, paper: paperType, year, path: pdfPath } = paper;

    console.log(`📄 Processing ${examBoard}-${subject}-${paperType}-${year}`);

    // make sure output dir exists
    await fs.mkdir(outDir, { recursive: true });
    const fileBytes = await fs.readFile(pdfPath);
    const srcDoc = await PDFDocument.load(fileBytes);
    // extract split points
    const result = await extractPageSplits(pdfPath, srcDoc);
    const pageSplits= result[0]
    // console.log(pageSplits)
    const minX = result[1][0]
    const maxX = result[1][1]

    // load source PDF


    // generate clips
    const clips = buildClips(pageSplits);

    // stitch each clip and insert into DB
    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const outPath = path.join(
            outDir,
            `${examBoard}-${subject}-${paperType}-${year}-Q${i + 1}.pdf`
        );

        await stitchClip(srcDoc, clip, outPath, minX, maxX);

        await prisma.examQuestion.upsert({
            where: { path: outPath },
            update: {}, // no update
            create: {
                examBoard,
                subject,
                paper: paperType,
                year: parseInt(year),
                path: outPath,
                document: 'qp',
                question: i + 1,
            },
        });

        console.log(`✅ Saved & inserted: ${outPath}`);
    }
}

async function main() {
    // fetch list of exam papers from DB
    const where =         {
        document: 'qp',
            examBoard: 'edexcel',
            subject: 'physics',
        paper: 'paper-2',
        year: 2017
    }
    const papers = await prisma.examPaper.findMany({
        where
    });
    // //
    // // await prisma.examQuestion.deleteMany({
    // //     where
    // // })
    //
    for (const paper of papers) {
        try {
            await processPaper(paper);
        } catch (err) {
            console.error(`❌ Failed processing ${paper.path}`, err);
        }
    }
    //
    // console.log("🎉 All papers processed");

    // await removeWhiteBands("./out/edexcel-physics-paper-2-2018-Q19.pdf", "outt.pdf")
}

main().catch(console.error);