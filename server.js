import express from 'express';
import { PrismaClient } from "./generated/prisma/index.js";
const prisma = new PrismaClient();

const app = express();
const PORT = 3000;

app.use(express.static('public'));

app.get('/api/search', async (req, res) => {
    const page = Number(req.query.p) || 1;
    const pageSize = 10;

    const totalCount = await prisma.questionText.count({
        where: {
            content: {
                contains: req.query.q,
                mode: "insensitive",
            },
        },
    });

    const results = await prisma.questionText.findMany({
        where: {
            content: {
                contains: req.query.q,
                mode: "insensitive",
            },
        },
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
                },
            },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
    });
    const pdfNames = results.map(item => {
        const fullPath = item.question.path;
        item.question.path = fullPath.split(`/`).pop()
        return item.question;
    });

    res.json({success: true, totalCount, totalPages: Math.ceil(totalCount / pageSize), data: pdfNames});
});

app.use('/question', express.static('./merged'));
app.use('/preview', express.static('./out'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
