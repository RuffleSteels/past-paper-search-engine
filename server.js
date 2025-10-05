import express from 'express';
import { PrismaClient } from "./generated/prisma/index.js";
import path from "path";
import {PDFDocument} from "pdf-lib";
import fs from "fs";

const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3000;
app.set("query parser", "simple");
app.use(express.static('public'));

app.get("/print/:filename", async (req, res) => {
    try {
        const { filename } = req.params;

        const qpPath = path.join( "merged", `${filename}`);
        const msPath = path.join( "merged", `${filename.replace('-qp-', '-ms-')}`);

        if (!fs.existsSync(qpPath) || !fs.existsSync(msPath)) {
            return res.status(404).send("Missing PDF files");
        }

        // Load both PDFs
        const qpPdf = await PDFDocument.load(fs.readFileSync(qpPath));
        const msPdf = await PDFDocument.load(fs.readFileSync(msPath));

        const merged = await PDFDocument.create();

        const A4_WIDTH = 595.28; // 210mm
        const A4_HEIGHT = 841.89; // 297mm
        const MARGIN = 20;

        // --- Embed and measure all pages ---
        const allEmbeddedPages = [];
        const embedAllPages = async (srcPdf) => {
            for (let i = 0; i < srcPdf.getPageCount(); i++) {
                const [embeddedPage] = await merged.embedPages([srcPdf.getPage(i)]);
                allEmbeddedPages.push(embeddedPage);
            }
        };

        await embedAllPages(qpPdf);
        await embedAllPages(msPdf);

        // --- Compute total height needed ---
        let totalHeight = MARGIN;
        const scaledData = [];

        for (const page of allEmbeddedPages) {
            const { width, height } = page;
            const scale = (A4_WIDTH - MARGIN * 2) / width;
            const scaledHeight = height * scale;
            scaledData.push({ page, scale, scaledHeight });
            totalHeight += scaledHeight + MARGIN;
        }

        // --- Create one large page with custom height ---
        const finalPage = merged.addPage([A4_WIDTH, totalHeight]);

        // --- Draw all pages stacked vertically ---
        let y = totalHeight - MARGIN;
        for (const { page, scale, scaledHeight } of scaledData) {
            y -= scaledHeight;
            finalPage.drawPage(page, {
                x: MARGIN,
                y,
                xScale: scale,
                yScale: scale,
            });
            y -= MARGIN;
        }

        // --- Save tall PDF ---
        const tallBytes = await merged.save();

        // --- Load tall PDF and slice into A4 pages ---
        const tallPdf = await PDFDocument.load(tallBytes);
        const output = await PDFDocument.create();

        const [tallPage] = await output.embedPages([tallPdf.getPage(0)]);
        const tallHeight = tallPage.height;
        const totalPages = Math.ceil(tallHeight / A4_HEIGHT);

        for (let i = 0; i < totalPages; i++) {
            const page = output.addPage([A4_WIDTH, A4_HEIGHT]);
            const yOffset = tallHeight - (i + 1) * A4_HEIGHT;

            // Draw the slice starting from top going downward
            page.drawPage(tallPage, {
                x: 0,
                y: -yOffset,
            });
        }

        // --- Output paginated PDF ---
        const finalBytes = await output.save();
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename=${filename}.pdf`);
        res.send(Buffer.from(finalBytes));
    } catch (err) {
        console.error(err);
        res.status(500).send("Error combining PDFs");
    }
});

app.get('/api/search', async (req, res) => {
    const page = Number(req.query.p) || 1;

    const rawFilters = req.query.f ? JSON.parse(req.query.f) : {};
    const pageSize = 10;

    // Normalize filter values
    const filters = {
        examBoard: rawFilters.examBoard || [],
        subject: rawFilters.subject || [],
        paper: rawFilters.paper || [],
        year: rawFilters.year ? rawFilters.year.map(Number).filter(y => !isNaN(y)) : [],
        document: rawFilters.document || [],
        label: rawFilters.label || [],
    };

    const where = {
        content: {
            contains: req.query.q || "",
            mode: "insensitive",
        },
        question: {
            examBoard: filters.examBoard.length ? { in: filters.examBoard } : undefined,
            subject: filters.subject.length ? { in: filters.subject } : undefined,
            paper: filters.paper.filter(p => p !== null).length
                ? { in: filters.paper.filter(p => p !== null) }
                : undefined,
            year: filters.year.length ? { in: filters.year } : undefined,
            document: filters.document.length ? { in: filters.document } : undefined,
            label: filters.label.length ? { in: filters.label } : undefined,
        },
    };

    const totalCount = await prisma.questionText.count({ where });

    const results = await prisma.questionText.findMany({
        where,
        select: {
            question: {
                select: {
                    path: true,
                    examBoard: true,
                    subject: true,
                    year: true,
                    paper: true,
                    document: true,
                    question: true,
                    label: true,
                },
            },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
    });

    const pdfNames = results.map(item => {
        const fullPath = item.question.path;
        item.question.path = fullPath.split(`/`).pop();
        return item.question;
    });

    res.json({
        success: true,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        data: pdfNames
    });
});
async function getDistinctValues(fields, curFilters) {
    const result = {};

    // --- Base where: only examBoard + subject (the "universe") ---
    const baseWhere = {
        QuestionText: { isNot: null },
    };

    if (curFilters.examBoard?.length > 0) {
        baseWhere.examBoard = { in: curFilters.examBoard };
    }
    if (curFilters.subject?.length > 0) {
        baseWhere.subject = { in: curFilters.subject };
    }

    // Fetch all records matching base filters
    const baseRecords = await prisma.examQuestion.findMany({
        where: baseWhere,
        select: Object.fromEntries(fields.map(f => [f, true])),
    });

    // --- Full where: all filters ---
    const fullWhere = { ...baseWhere };

    for (const [filterField, filterValues] of Object.entries(curFilters)) {
        if (filterValues.length > 0 && filterField !== "examBoard" && filterField !== "subject") {
            if (filterField === "year") {
                fullWhere.year = {
                    in: filterValues.map(y => (y ? parseInt(y, 10) : null)),
                };
            } else {
                fullWhere[filterField] = { in: filterValues };
            }
        }
    }

    // Fetch records matching *all* filters
    const fullRecords = await prisma.examQuestion.findMany({
        where: fullWhere,
        select: Object.fromEntries(fields.map(f => [f, true])),
    });

    // --- Build results ---
    for (const field of fields) {
        if (field === "examBoard") {
            // Always ALL distinct examBoards
            const examBoards = await prisma.examQuestion.findMany({
                where: { QuestionText: { isNot: null } },
                select: { examBoard: true },
                distinct: ["examBoard"],
            });
            result[field] = examBoards.map(r => r.examBoard).filter(v => v !== null);
        }
        else if (field === "subject") {
            // Subject distincts only within full filters (so it narrows as you pick)
            const subjects = await prisma.examQuestion.findMany({
                where: { QuestionText: { isNot: null } },
                select: { subject: true },
                distinct: ["subject"],
            });
            result[field] = subjects.map(r => r.subject).filter(v => v !== null);
        }
        else {
            // Other fields: distincts always based on base filters (examBoard + subject only)
            result[field] = [
                ...new Set(baseRecords.map(r => r[field]).filter(v => v !== null)),
            ];
        }
    }

    return result;
}

app.get('/api/filters', async (req, res) => {
    const rawFilters = req.query.c ? JSON.parse(req.query.c) : {};
    const distinct = await getDistinctValues(['examBoard', 'subject', 'paper', 'year', 'document', 'label'], rawFilters);
    distinct.year = distinct.year.filter(y=>y)
    res.json({success: true, data:distinct});
});
app.use('/question', express.static('./merged'));
app.use('/preview', express.static('./out'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
