import express from 'express';
import { PrismaClient } from "./generated/prisma/index.js";
const prisma = new PrismaClient();

const app = express();
const PORT = 3000;
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
async function getDistinctValues(fields) {
    const result = {};

    for (const field of fields) {
        const values = await prisma.examQuestion.groupBy({
            by: [field],
            where: {
                QuestionText: {
                    isNot: null // only examQuestions WITH a linked QuestionText
                },
            },
        });

        result[field] = values.map(v => v[field]);
    }

    return result;
}

app.get('/api/filters', async (req, res) => {
    const distinct = await getDistinctValues(['examBoard', 'subject', 'paper', 'year', 'document', 'label']);
    distinct.year = distinct.year.filter(y=>y)
    res.json({success: true, data:distinct});
});
app.use('/question', express.static('./merged'));
app.use('/preview', express.static('./out'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
