// function drawHighlight(ctx, rect, color = "rgba(0,0,0,0.55)") {
//     const pad = Math.max(1, Math.round(rect.height * 0.08));
//     ctx.fillStyle = color;
//     ctx.fillRect(rect.left - pad, rect.top - pad, rect.width + pad * 2, rect.height + pad * 2);
//
//     ctx.strokeStyle = "rgba(200,140,0,0.9)";
//     ctx.lineWidth = 1;
//     ctx.strokeRect(rect.left - pad, rect.top - pad, rect.width + pad * 2, rect.height + pad * 2);
// }
// function measureTextWidth(ctx, text, fontSize, fontFamily = "sans-serif") {
//     ctx.save();
//     ctx.font = `${fontSize}px ${fontFamily}`;
//     const width = ctx.measureText(text).width;
//     ctx.restore();
//     return width;
// }
// function getTextItemRect(item, viewport, ctx) {
//     const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
//     const fontHeight = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 12;
//     const baselineX = tx[4];
//     const baselineY = tx[5];
//
//     ctx.save();
//     ctx.font = `${fontHeight}px sans-serif`;
//     ctx.textBaseline = "alphabetic";
//     const width = ctx.measureText(item.str).width;
//     ctx.restore();
//
//     const left = baselineX;
//     const top = baselineY - fontHeight;
//
//     return { left, top, width, height: fontHeight };
// }
// // async function renderQuestion(filename, query) {
// //     console.log(filename)
// //     const pageWrapper = document.createElement("div");
// //     pageWrapper.className = "pageWrapper";
// //     const pdfCanvas = document.createElement("canvas");
// //     pdfCanvas.id = "pdf-canvas-" + 0;
// //     pdfCanvas.className = "pdf-canvas";
// //     const overlay = document.createElement("canvas");
// //     overlay.id = "overlay-" + 0;
// //     overlay.className = "overlay";
// //     const ctxOverlay = overlay.getContext("2d");
// //
// //     pageWrapper.appendChild(overlay);
// //     pageWrapper.appendChild(pdfCanvas);
// //     document.getElementById("results").appendChild(pageWrapper);
// //     const pdf = await pdfjsLib.getDocument(`/question/${filename}`).promise;
// //     const page = await pdf.getPage(1);
// //     const viewport = page.getViewport({ scale: 1.5 });
// //
// //     [pdfCanvas, overlay].forEach(c => {
// //         c.width = viewport.width;
// //         c.height = viewport.height;
// //     });
// //
// //     const ctx = pdfCanvas.getContext("2d");
// //     await page.render({ canvasContext: ctx, viewport }).promise;
// //
// //     ctxOverlay.clearRect(0, 0, overlay.width, overlay.height);
// //
// //     textContent.items.forEach(item => {
// //         const str = item.str;
// //         const lower = str.toLowerCase();
// //         let startIndex = 0;
// //         let matchIndex;
// //         while ((matchIndex = lower.indexOf(search, startIndex)) >= 0) {
// //             // We have a match in this item.str from matchIndex to matchIndex + search.length
// //             // We need to calculate the bounding box for that substring.
// //             // Unfortunately item may not split on words, so it might be approximate.
// //             const transform = item.transform; // this along with font metrics gives us positioning
// //             const fontSize = item.height;     // or something like that
// //             // (Exact calculation of substring width is tricky – may need measureText or rely on PDF.js textDivs)
// //
// //             // One simple approx: use the textDiv created for this item in text layer
// //             // get the matching textDiv, then overlay highlight
// //             // For demo:
// //             const div = textLayerDiv.querySelector(`div[data-text-index="${item.index}"]`);
// //             if (div) {
// //                 const rect = div.getBoundingClientRect();
// //                 // For simplicity highlight the whole textDiv
// //                 const highlightDiv = document.createElement('div');
// //                 highlightDiv.className = 'highlight';
// //                 // Use pageDiv as positioning context
// //                 const pageDivRect = pageDiv.getBoundingClientRect();
// //
// //                 highlightDiv.style.left = (rect.left - pageDivRect.left) + 'px';
// //                 highlightDiv.style.top = (rect.top - pageDivRect.top) + 'px';
// //                 highlightDiv.style.width = rect.width + 'px';
// //                 highlightDiv.style.height = rect.height + 'px';
// //                 pageDiv.appendChild(highlightDiv);
// //             }
// //
// //             startIndex = matchIndex + search.length;
// //         }
// //     });
// // }



let PAGE_HEIGHT;
let pdfDocument;
const DEFAULT_SCALE = 1.33;

function createEmptyPage(num) {
    const page = document.createElement("div");
    const canvas = document.createElement("canvas");
    const wrapper = document.createElement("div");
    const textLayerDiv = document.createElement("div");

    page.className = "page";
    wrapper.className = "canvasWrapper";
    textLayerDiv.className = "textLayer";

    page.setAttribute("id", `pageContainer${num}`);
    page.setAttribute("data-loaded", "false");
    page.setAttribute("data-page-number", num);

    canvas.setAttribute("id", `page${num}`);

    page.appendChild(wrapper);
    page.appendChild(textLayerDiv);
    wrapper.appendChild(canvas);

    return page;
}

function loadPage(pageNum,viewer, query) {
    return pdfDocument.getPage(pageNum).then((pdfPage) => {
        const page = viewer.querySelector(`#pageContainer${pageNum}`);
        const canvas = page.querySelector("canvas");
        const wrapper = page.querySelector(".canvasWrapper");
        const container = page.querySelector(".textLayer");
        const canvasContext = canvas.getContext("2d");
        const viewport = pdfPage.getViewport({ scale: DEFAULT_SCALE });

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = viewport.width * outputScale;
        canvas.height = viewport.height * outputScale;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        page.style.width = `${viewport.width}px`;
        page.style.height = `${viewport.height}px`;
        wrapper.style.width = `${viewport.width}px`;
        wrapper.style.height = `${viewport.height}px`;
        container.style.width = `${viewport.width}px`;
        container.style.height = `${viewport.height}px`;

        // Render PDF page into canvas
        const renderTask = pdfPage.render({
            canvasContext,
            viewport,
            transform: [outputScale, 0, 0, outputScale, 0, 0],
        });

        pdfPage.getTextContent().then(textContent => {
            // ensure the text-layer <div> exists and has css class "textLayer"
            // the old helper used to be invoked like this in many examples:
            pdfjsLib.renderTextLayer({
                textContent,
                container: container,
                viewport: viewport,
                textDivs: [],
            });
        });

        page.setAttribute("data-loaded", "true");
        return renderTask.promise.then(() => pdfPage);
    });
}
function highlightWordInTextLayer(word, container, beforeHeight, path) {
    if (!word) return -1;

    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");

    let firstMatchNode = null;

    container.querySelectorAll("span").forEach((node) => {
        if (node.childNodes.length === 1 && node.firstChild.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            if (regex.test(text)) {
                const frag = document.createDocumentFragment();
                let lastIndex = 0;
                text.replace(regex, (match, p1, offset) => {
                    if (offset > lastIndex) {
                        frag.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
                    }
                    const mark = document.createElement("span");
                    mark.className = "highlight";
                    mark.textContent = match;
                    frag.appendChild(mark);

                    console.log("Created mark:", mark.textContent);


                    if (!firstMatchNode) {
                        firstMatchNode = mark;
                    }

                    lastIndex = offset + match.length;
                });
                if (lastIndex < text.length) {
                    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
                }
                node.replaceChild(frag, node.firstChild);
            }
        }
    });

    console.log(firstMatchNode)

    if (firstMatchNode) {
        const matchRect = firstMatchNode.getBoundingClientRect();

        const containerRect = container.getBoundingClientRect();
        console.log(matchRect, containerRect, beforeHeight);
        return beforeHeight + (matchRect.top - containerRect.top)
    }

    return -1;
}
async function renderQuestion(data, query, q) {
    const { path, examBoard, paper, subject, year, question } = data;
    const pdf = await pdfjsLib.getDocument('question/' + path).promise;
    pdfDocument = pdf;

    const wrapper = document.createElement("div");
    wrapper.className = "questionWrapper";

    wrapper.innerHTML = `
    <div class="questionTitle">
        <h4>
        ${year} ${paper} Q${question}
        </h4>
    </div>
`;

    const viewer = document.createElement("div");
    viewer.className = "questionContainer";
    viewer.id = "question" + q;

    document.getElementById("results").appendChild(wrapper);

// Create and load all pages
    let heightBefore = 0;
    let currPageHeight = 0
    let scrollH = -1;
    wrapper.appendChild(viewer);
    for (let i = 1; i <= pdf.numPages; i++) {
        console.log(i)
        const page = createEmptyPage(i);
        viewer.appendChild(page);

        const pdfPage = await loadPage(i, viewer, query)

            const viewport = pdfPage.getViewport({ scale: DEFAULT_SCALE });
            PAGE_HEIGHT = viewport.height;
            currPageHeight = PAGE_HEIGHT
            if (i === 1) {
                document.body.style.width = `${viewport.width}px`;
            }

            heightBefore += PAGE_HEIGHT


        await sleep(10);

        if (scrollH < 0) {
            scrollH = await highlightWordInTextLayer(
                query,
                page.querySelector(".textLayer"),
                heightBefore - PAGE_HEIGHT,
                path
            );
            wrapper.scrollTop = scrollH;
        }



    }


}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
let controller;       // for aborting fetch
let debounceTimer;    // for debouncing
let currentSearchId = 0;
function debouncedSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(search, 300); // wait 500ms after last keystroke
}

async function search() {
    const query = document.getElementById('search').value.trim();
    if (!query) {
        document.getElementById('results').innerHTML = '';
        return;
    }

    if (controller) {
        controller.abort();
    }
    controller = new AbortController();
    const signal = controller.signal;
    const searchId = ++currentSearchId;

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
        const data = await res.json();

        if (searchId !== currentSearchId) return;
        document.getElementById('results').innerHTML = '';
        if (data.success && data.data.length > 0) {

            for (let i = 0; i < data.data.length && i < 10; i++) {
                if (searchId !== currentSearchId) {
                    document.getElementById('results').innerHTML = '';
                    return;
                }
                await renderQuestion(data.data[i], query, i);
            }
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            return;
        }
        console.error('Search error:', err);
    }
}
search();