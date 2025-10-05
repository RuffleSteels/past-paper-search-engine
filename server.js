import express from 'express';
import { PrismaClient } from "./generated/prisma/index.js";
const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3000;
app.set("query parser", "simple");
app.use(express.static('public'));
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
