import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import path from "path";
import { PrismaClient } from "./generated/prisma/index.js";
import fs from "fs/promises";

const prisma = new PrismaClient();
function parsePaperUrl(url) {
    const decoded = decodeURIComponent(url);

    // Capture subject, level, and the rest of the path
    const re = /download\/(?<subject>[^/]+)\/(?<level>[^/]+)\/Past-Papers\/(?<board>[^/]+)\/(?<paper>[^/]+)\/(?<docType>[^/]+)\/(?<filename>[^/]+)$/i;
    const m = decoded.match(re);
    if (!m) return null;

    const { subject, level, board, paper, docType, filename } = m.groups;

    // Remove extension
    const base = filename.replace(/\.pdf$/i, "").trim();

    // Split into words
    const parts = base.split(/\s+/);

    let year = null;

    // Extract 4-digit year if present
    for (let i = 0; i < parts.length; i++) {
        if (/^\d{4}$/.test(parts[i])) {
            year = parts[i];
            parts.splice(i, 1); // remove the year
            break;
        }
    }

    // Last part is always the docKey (e.g. "QP", "MS")
    const docKey = parts.pop();

    // Everything else makes up the label
    const label = parts.join(" ");

    return {
        subject,  // e.g. "Maths"
        level,    // e.g. "GCSE"
        board,    // e.g. "Edexcel"
        paper,    // e.g. "Paper-3H"
        docType,  // e.g. "QP"
        label,    // e.g. "Specimen 1", "Nov", "Sample"
        year,     // e.g. "2023" or null
    };
}

async function downloadPDF(url, outputPath) {
    const res = await fetch(url);
    if (!res.ok) {
        console.warn(`⚠️ Skipping: ${url} (status ${res.status})`);
        return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(outputPath, buffer);
    return true;
}

async function scrape() {
    const folder = path.resolve("./papers");
    const res = await fetch("https://www.physicsandmathstutor.com/past-papers/gcse-maths/");
    const html = await res.text();

    const dom = new JSDOM(html);
    const document = dom.window.document;

    const results = [];

    document.querySelectorAll(".post-entry .dropshadowboxes-container").forEach(container => {
        const parent = container.parentNode // get parent div of container
        if (parent && parent.textContent.includes("Edexcel")) {
            parent.querySelectorAll("a").forEach(a => {
                const parts = a.href.split('/');
                const last = parts.filter(Boolean).pop();
                if (!results.includes(a.href) && (last.split('-')[1].includes('paper')))
                    results.push(
                         a.href
                    );
            });
        }
    });

    const links = []

    for (const link of results) {
        const res2 = await fetch(link);

        const html2 = await res2.text();

        const dom2 = new JSDOM(html2);
        const document2 = dom2.window.document;

        const body = document2.querySelector('.post-entry');

        const questionPapersDiv = Array.from(body.querySelectorAll('*'))

        for (let div of questionPapersDiv) {
            if (div.textContent.includes("QP") && !div.textContent.includes("Mock")) {
                if (div.href && !links.includes(div.href))
                links.push(div.href);
            }
        }
    }

    for (const link of links) {
        const {subject, level, board, paper, docType, label, year} = parsePaperUrl(link)

        const filename = `${level.toLowerCase()}-${board.toLowerCase()}-${subject.toLowerCase()}-${paper.toLowerCase()}-${label.trim().replace(/\s+/g, '-').toLowerCase()}${year ? `-${year}` : ''}-${docType.toLowerCase()}.pdf`;
        const outputPath = path.join(folder, filename);

        console.log(`⬇️ Downloading: ${link}`);
        const success = await downloadPDF(link, outputPath);

        if (success) {
            await prisma.examPaper.upsert({
                where: { path: outputPath },
                update: {}, // do nothing if already exists
                create: {
                    examBoard: board.toLowerCase(),
                    subject: subject.toLowerCase(),
                    paper: paper.toLowerCase(),
                    year: year ? parseInt(year) : null,
                    document: docType.toLowerCase(),
                    level: level.toLowerCase(),
                    label: label.trim().replace(/\s+/g, '-').toLowerCase(),
                    path: outputPath,
                },
            });
            console.log(`✅ Saved & inserted: ${filename}`);
        }
    }
}

scrape();