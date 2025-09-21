import express from 'express';
import { PrismaClient } from "./generated/prisma/index.js";
const prisma = new PrismaClient();

const app = express();
const PORT = 3000;

app.use(express.static('public'));

app.get('/api/search', async (req, res) => {
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
                    examBoard:true,
                    subject: true,
                    year: true,
                    paper: true,
                    document: true,
                    question: true,
                },
            },
        },
    });
    const pdfNames = results.map(item => {
        const fullPath = item.question.path;
        item.question.path = fullPath.split('/').pop()
        return item.question;
    });

    console.log(pdfNames);

    res.json({success: true, data: pdfNames});
});

app.use('/question', express.static('./out'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
