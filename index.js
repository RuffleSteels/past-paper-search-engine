// splitAndCut.js
import fs from "fs/promises";
import path from "path";
import { PDFDocument, degrees } from "pdf-lib";
import { PrismaClient } from "./generated/prisma/index.js";
import {
    extractPageSplits,
    buildClips,
    stitchClip,
    removeWhiteBands,
    extractPageSplitsMs,
} from "./utils.js"

const prisma = new PrismaClient();
const outDir = "./out";
// Keep original log function
const originalLog = console.log;

console.log = function (...args) {
    if (
        args.some(a =>
            typeof a === "string" &&
            a.includes("UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided")
        )
    ) {
        // Suppress this specific log
        return;
    }
    // Otherwise, print as normal
    originalLog.apply(console, args);
};
async function processPaper(paperr) {
    const { examBoard, label, level, document, subject, paper, year, path: pdfPath } = paperr;

    const filename = `${level.toLowerCase()}-${examBoard.toLowerCase()}-${subject.toLowerCase()}-${paper.toLowerCase()}-${label.trim().replace(/\s+/g, '-').toLowerCase()}${year ? `-${year}` : ''}-${document.toLowerCase()}`
    console.log(`📄 Processing ${filename}.pdf`);

    // make sure output dir exists
    await fs.mkdir(outDir, { recursive: true });
    await fs.mkdir("./merged", { recursive: true });
    const fileBytes = await fs.readFile(pdfPath);
    const srcDoc = await PDFDocument.load(fileBytes);
    const result = await extractPageSplits(pdfPath, srcDoc, examBoard);
    const pageSplits= result[0]
    const minX = result[1][0]
    const maxX = result[1][1]
    console.log(minX, maxX);
    const encoded = result[2]
    let clips = []
    // generate clips
    console.log(pageSplits)
    if (examBoard !== 'edexcel') {
        let prev = 0;
        let prevPage = 0
        for (const split in pageSplits) {
            for (const num of pageSplits[split]) {
                if (prev !== 0) {
                    clips.push({
                        startPage: prevPage,
                        startY: prev,
                        endPage: split,
                        endY: num,
                    })
                }
                prev = num
                prevPage = split
            }
        }
    } else {
        clips = buildClips(pageSplits);
    }


    console.log(clips)
    // stitch each clip and insert into DB
    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const outPath = path.join(
            outDir,
            `${filename}-Q${i + 1}.pdf`
        );
        const outPath2 = path.join(
            "./merged",
            `${filename}-Q${i + 1}.pdf`
        );

        await stitchClip(srcDoc, clip, outPath, outPath2, minX, maxX);

        await prisma.examQuestion.upsert({
            where: { path: outPath },
            update: {}, // no update
            create: {
                examBoard,
                subject,
                paper: paper,
                year: parseInt(year),
                path: outPath,
                document: document,
                question: i + 1,
                level: level,
                label: label,
                encoded
            },
        });

        console.log(`✅ Saved & inserted: ${outPath}`);
    }
}

// import { degrees } from "pdf-lib";

async function rotatePage(srcDoc, pageIndex, angle) {
    const [srcPage] = await srcDoc.copyPages(srcDoc, [pageIndex]);
    const { width, height } = srcPage.getSize();

    let newWidth = width;
    let newHeight = height;

    if (angle % 180 !== 0) {
        newWidth = height;
        newHeight = width;
    }

    // Insert a new blank page at the same index
    const newPage = srcDoc.insertPage(pageIndex, [newWidth, newHeight]);
    const embeddedPage = await srcDoc.embedPage(srcPage);

    if (angle === 90) {
        newPage.drawPage(embeddedPage, {
            x: 0,
            y: newHeight, // shift up
            width,
            height,
            rotate: degrees(-90), // rotate clockwise
        });
    } else if (angle === 270) {
        newPage.drawPage(embeddedPage, {
            x: newWidth, // shift right
            y: 0,
            width,
            height,
            rotate: degrees(90), // rotate counter-clockwise
        });
    } else if (angle === 180) {
        newPage.drawPage(embeddedPage, {
            x: newWidth, // shift right
            y: newHeight, // shift up
            width,
            height,
            rotate: degrees(180),
        });
    } else {
        // 0°: just redraw
        newPage.drawPage(embeddedPage, {
            x: 0,
            y: 0,
            width,
            height,
        });
    }

    // Remove the original page (pushed forward by insertPage)
    srcDoc.removePage(pageIndex + 1);

    return newPage;
}
async function processMs(paperr) {
    const { examBoard, label, level, document, subject, paper, year, path: pdfPath } = paperr;
    console.log(document)
    const filename = `${level.toLowerCase()}-${examBoard.toLowerCase()}-${subject.toLowerCase()}-${paper.toLowerCase()}-${label.trim().replace(/\s+/g, '-').toLowerCase()}${year ? `-${year}` : ''}-${document.toLowerCase()}`
    console.log(`📄 Processing ${filename}.pdf`);

    await fs.mkdir(outDir, { recursive: true });
    await fs.mkdir("./merged", { recursive: true });

    const fileBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(fileBytes);
    let counter = 0;
    for (const page of pdfDoc.getPages()) {
        const { width, height } = page.getCropBox();
        if (width < height) {
            await rotatePage(pdfDoc, counter, 90);
        }
        counter += 1;
    }
     // rotate first page 90° CW
    const pdfBytes = await pdfDoc.save();
    const srcDoc = await PDFDocument.load(pdfBytes);
    const result = await extractPageSplitsMs(pdfPath, srcDoc);

    // console.log(re)

    const pageSplits= result[0]
    const minX = result[1][0]
    const maxX = result[1][1]
    const pageNum = result[2]

    const clips = []

    let prev = 0;
    let prevPage = 0
    for (const split in pageSplits) {
        for (const num of pageSplits[split]) {
            if (prev !== 0) {
                clips.push({
                    startPage: prevPage,
                    startY: prev,
                    endPage: split,
                    endY: num,
                })
            }
            prev = num
            prevPage = split
        }
    }

    clips.push({
        startPage: clips[clips.length - 1].endPage,
        startY: clips[clips.length - 1].endY,
        endPage: pageNum,
        endY: 1,
    })
    console.log(clips)

    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const outPath = path.join(
            outDir,
            `${filename}-Q${i + 1}.pdf`
        );
        const outPath2 = path.join(
            "./merged",
            `${filename}-Q${i + 1}.pdf`
        );

        await stitchClip(srcDoc, clip, outPath2, outPath2, minX, maxX, true);

        await prisma.examQuestion.upsert({
            where: { path: outPath },
            update: {}, // no update
            create: {
                examBoard,
                subject,
                paper: paper,
                year: year ? parseInt(year) : null,
                path: outPath2,
                document: 'ms',
                label,
                question: i + 1,
                level,
                encoded: false
            },
        });

        console.log(`✅ Saved & inserted: ${outPath2}`);
    }
}

async function main() {
    // fetch list of exam papers from DB

    // const where =         {
    //     document: 'qp',
    //         examBoard: 'ocr-mei-further',
    //         subject: 'maths',
    //     paper: {
    //         in: [
    //             'mechanics-minor',
    //             'mechanics-major',
    //             'statistics-major',
    //             'pure-core',
    //             'statistics-minor'
    //         ]
    //     },
    // }
    const where =         {
        document: 'ms',
        examBoard: 'ocr-mei-further',
        subject: 'maths',
            paper: {
                in: [
                    'mechanics-minor',
                    'mechanics-major',
                    'statistics-major',
                    'pure-core',
                    'statistics-minor'
                ]
            },
        // year: 2022,
    }
    const papers = await prisma.examPaper.findMany({
        where
    });
    // //
    await prisma.examQuestion.deleteMany({
        where
    })
    console.log(papers)
    for (const paper of papers) {
        try {
            await processMs(paper);
        } catch (err) {
            console.error(`❌ Failed processing ${paper.path}`, err);
        }
    }
    //
    // console.log("🎉 All papers processed");

    // await removeWhiteBands("./out/edexcel-physics-paper-2-2018-Q19.pdf", "outt.pdf")
}

main().catch(console.error);