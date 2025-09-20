import { PrismaClient } from "./generated/prisma/index.js";
const prisma = new PrismaClient();

const results = await prisma.questionText.findMany({
    where: {
        content: {
            contains: "space",
            mode: "insensitive",
        },
    },
    select: {
        question: {
            select: {
                path: true, // ✅ only fetch path
            },
        },
    },
});

console.log(results)