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
function loadPage(pageNum, viewer, query) {
    return pdfDocument.getPage(pageNum).then((pdfPage) => {
        const page = viewer.querySelector(`#pageContainer${pageNum}`);
        const wrapper = page.querySelector(".canvasWrapper");
        const container = page.querySelector(".textLayer");

        const unscaledViewport = pdfPage.getViewport({ scale: 1 });
        const scale = viewer.clientWidth / unscaledViewport.width;
        const viewport = pdfPage.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);

        page.style.width = "100%";
        page.style.height = "auto";
        wrapper.style.width = "100%";
        wrapper.style.height = "auto";
        container.style.width = "100%";
        container.style.height = "auto";

        // create an offscreen canvas (not appended to DOM)
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = viewport.width * outputScale;
        canvas.height = viewport.height * outputScale;

        const renderTask = pdfPage.render({
            canvasContext: ctx,
            viewport,
            transform: [outputScale, 0, 0, outputScale, 0, 0],
        });

        return renderTask.promise.then(() => {
            // Convert canvas to image
            const img = document.createElement("img");
            img.src = canvas.toDataURL("image/png"); // compress with "image/jpeg" for lighter size
            img.style.width = "100%";
            img.style.height = "auto";

            // clear wrapper, then append image
            wrapper.innerHTML = "";
            wrapper.appendChild(img);

            // render text layer on top (for selection/search)
            return pdfPage.getTextContent().then(textContent => {
                return pdfjsLib.renderTextLayer({
                    textContent,
                    container,
                    viewport,
                    textDivs: [],
                }).promise;
            });
        });
    });
}

// function loadPage(pageNum,viewer, query) {
//     return pdfDocument.getPage(pageNum).then((pdfPage) => {
//         const page = viewer.querySelector(`#pageContainer${pageNum}`);
//         const canvas = page.querySelector("canvas");
//         const wrapper = page.querySelector(".canvasWrapper");
//         const container = page.querySelector(".textLayer");
//         const canvasContext = canvas.getContext("2d");
//         const unscaledViewport = pdfPage.getViewport({ scale: 1 });
//         const scale = viewer.clientWidth / unscaledViewport.width;
//         const viewport = pdfPage.getViewport({ scale });
//         const outputScale = Math.min(window.devicePixelRatio || 1, 2);
//         canvas.width = viewport.width * outputScale;
//         canvas.height = viewport.height * outputScale;
//         canvas.style.width = "100%";
//         canvas.style.height = "auto";
//
//         page.style.width = "100%";
//         page.style.height = "auto";
//         wrapper.style.width = "100%";
//         wrapper.style.height = "auto";
//         container.style.width = "100%";
//         container.style.height = "auto";
//
//         // Render PDF page into canvas
//         const renderTask = pdfPage.render({
//             canvasContext,
//             viewport,
//             transform: [outputScale, 0, 0, outputScale, 0, 0],
//         });
//
//         const textPromise = pdfPage.getTextContent().then(textContent => {
//             return pdfjsLib.renderTextLayer({
//                 textContent,
//                 container,
//                 viewport,
//                 textDivs: [],
//             }).promise; // 👈 return this promise
//         });
//
//         return Promise.all([textPromise]).then(() => pdfPage);
//     });
// }
function highlightWordInTextLayer(word, container, viewer, path) {
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

    if (firstMatchNode) {
        const matchRect = firstMatchNode.getBoundingClientRect();
        const viewerRect = container.closest(".questionContainer").getBoundingClientRect();
        return matchRect.top - viewerRect.top + viewer.scrollTop;
    }

    return -1;
}
function fullSize(e) {
    const container = e.parentNode.parentNode
    container.classList.toggle("fullSize")
}
async function renderQuestion(data, query, q) {
    const { path, examBoard, paper, label, subject, year, question } = data;
    const pdf = await pdfjsLib.getDocument('preview/' + path).promise;
    pdfDocument = pdf;

    const wrapper = document.createElement("div");
    wrapper.className = "questionWrapper";

    wrapper.innerHTML = `
    <div class="questionTitle">
        <h4 class="subheader">
        ${label} ${year ? year : ''} ${paper} Q${question}
        </h4>        <a href="${'question/' + path.split('.')[0] + '-ms.pdf'}" target="_blank" rel="noopener noreferrer">
            <h3>
                MS
            </h3>
        </a>
        <a href="${'question/' + path}" target="_blank" rel="noopener noreferrer">

        <svg
        class="externalButton"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M15.6396 7.02527H12.0181V5.02527H19.0181V12.0253H17.0181V8.47528L12.1042 13.3892L10.6899 11.975L15.6396 7.02527Z"
    fill="currentColor"
  />
  <path
    d="M10.9819 6.97473H4.98193V18.9747H16.9819V12.9747H14.9819V16.9747H6.98193V8.97473H10.9819V6.97473Z"
    fill="currentColor"
  />
</svg>
</a>
        
        <svg
        onclick="fullSize(this)"
  width="24"
  class="minimiseButton"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M7.97867 9.45703L4.40883 9.45423L4.40726 11.4542L11.4073 11.4597L11.4127 4.45972L9.41274 4.45815L9.40992 8.05978L3.09616 1.76935L1.68457 3.18618L7.97867 9.45703Z"
    fill="currentColor"
  />
  <path
    d="M19.5615 14.5521L19.5535 12.5521L12.5536 12.58L12.5814 19.5799L14.5814 19.572L14.5671 15.9706L20.9105 22.2307L22.3153 20.8071L15.9914 14.5663L19.5615 14.5521Z"
    fill="currentColor"
  />
</svg>
        <svg
        onclick="fullSize(this)"
        class="maximiseButton"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M10.1005 4.10052V2.10052H2.10046L2.10046 10.1005H4.10046L4.10046 5.51471L9.87875 11.293L11.293 9.87878L5.51471 4.10052H10.1005Z"
    fill="currentColor"
  />
  <path
    d="M19.8995 13.8995H21.8995V21.8995H13.8995V19.8995H18.4853L12.7071 14.1212L14.1213 12.707L19.8995 18.4853V13.8995Z"
    fill="currentColor"
  />
</svg>
    </div>
`;

    const viewer = document.createElement("div");
    viewer.className = "questionContainer";
    viewer.id = "question" + q;
    wrapper.appendChild(viewer);
    document.getElementById("results").appendChild(wrapper);

    let scrollH = -1;

    // Pre-create containers for all pages
    for (let i = 1; i <= pdf.numPages; i++) {
        viewer.appendChild(createEmptyPage(i));
    }

    // Render all pages in parallel
    const pagePromises = Array.from({ length: pdf.numPages }, async (_, idx) => {
        const pageNum = idx + 1;
        const pageContainer = viewer.querySelector(`#pageContainer${pageNum}`);
        const pdfPage = await loadPage(pageNum, viewer);

        // highlight once text layer is ready
        if (scrollH < 0) {
            const foundScroll = highlightWordInTextLayer(
                query,
                pageContainer.querySelector(".textLayer"),
                viewer,
                path
            );
            if (foundScroll >= 0) {
                scrollH = foundScroll;
                viewer.scrollTop = scrollH;
            }
        }
        return pdfPage;
    });

    // wait for ALL pages + highlighting to finish
    await Promise.all(pagePromises);

    // only after everything is ready
    return true; // signal finished
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}let controller;       // for aborting fetch
let debounceTimer;    // for debouncing
let currentSearchId = 0;
let stop = false;
function debouncedSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(search, 300);
}

let initial = true;
let pageNum = 1;
let maxPages = 1;

async function search(input = true, page = 1) {
    const query = document.getElementById('search').value;

    if (query === '') {
        stop = true;
        if (controller) controller.abort();
        pageNum = 1
        maxPages = 1
        checkNav()
        document.querySelector('.resultsNumWrapper').style.display = 'none';
        document.querySelector('.gradientContainer.second').style.display = 'none';
        document.getElementById('results').innerHTML = '';
        document.querySelector('#noResults').style.display = 'none';
        document.querySelector('#resultsNum').innerHTML = '';
        document.querySelector('#curPage').innerHTML = 1;
        document.querySelector('#pageNum').innerHTML = 1;
        document.querySelector('.pageNav').style.display = 'none';
        return;
    }

    stop = false;

    if (controller) controller.abort();
    controller = new AbortController();
    const signal = controller.signal;

    const searchId = ++currentSearchId;

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&p=${page}&f=${encodeURIComponent(JSON.stringify(window.currentFilters))}`, { signal });
        const data = await res.json();

        if (searchId !== currentSearchId) return;

        document.getElementById('results').innerHTML = '';

        if (data.success && data.data.length > 0) {
            if (input) {
                pageNum = 1;
                maxPages = data?.totalPages || 1;
                document.querySelector('#resultsNum').innerHTML =data?.totalCount || 1
                    checkNav();
                document.querySelector('#curPage').innerHTML = 1;
                initial = false;
                document.querySelector("#pageNum").innerHTML = data?.totalPages || 1;
            }

            document.querySelector('#results').style.opacity = 0
            document.querySelector('#noResults').style.display = 'none';
            const promises = [];

            for (let i = 0; i < data.data.length && i < 10; i++) {
                if (searchId !== currentSearchId || stop) {
                    document.getElementById('results').innerHTML = '';
                    return;
                }
                promises.push(renderQuestion(data.data[i], query, i));
            }

            await Promise.all(promises);
            document.querySelector('.resultsNumWrapper').style.display = 'block';
            document.querySelector('.gradientContainer.second').style.display = 'block';
            document.querySelector('#results').style.opacity = 1
            document.querySelector('.pageNav').style.display = 'flex';
        } else {
            document.querySelector('.gradientContainer.second').style.display = 'none';
            document.querySelector('#noResults').style.display = 'block';
            document.querySelector('.pageNav').style.display = 'none';
            document.querySelector('.resultsNumWrapper').style.display = 'none';
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            return;
        }
        console.error('Search error:', err);
    }
}
function compareArrays(a, b) {
    const normA = Array.from(a, x => x ?? undefined);
    const normB = Array.from(b, x => x ?? undefined);

    return (
        normA.length === normB.length &&
        normA.every((val, i) => val === normB[i])
    );
}
function removeFilter(e,field, specific=null) {
    e.stopPropagation()
    const prev = JSON.parse(JSON.stringify(window.currentFilters[field]))
    if (!specific) window.currentFilters[field] = window.distinct[field]
    else if (window.currentFilters[field].map((i)=>i.toString()).includes(specific)) {
        delete window.currentFilters[field][window.currentFilters[field].map((i)=>i.toString()).indexOf(specific)]
        window.currentFilters[field] = window.currentFilters[field].filter(x => x !== undefined)
    } else {
        window.currentFilters[field].push(specific)
        window.currentFilters[field] = window.currentFilters[field].filter(x => x !== undefined)
    }
    console.log(prev)
    console.log(window.currentFilters[field])
    console.log((!(window.distinct[field].length === 1)))
    updateFilters((!compareArrays(prev, window.currentFilters[field])) && (!(window.distinct[field].length === 1)))
}
let openDrop = null
function openDropdown(e,field) {
    e.stopPropagation()
    for (let f in window.distinct) {
        if (f===field) continue;
        document.querySelector(`.${f}Dropdown`).classList.remove('show')
    }
    if (openDrop === field) {
        openDrop = null
    } else {
        openDrop = field
    }

    document.querySelector(`.${field}Dropdown`).classList.toggle('show')
}
document.addEventListener('click', () => {
    // alert(openDrop)
    if (openDrop) {
        for (let f in window.distinct) {
            document.querySelector(`.${f}Dropdown`).classList.remove('show')
        }
        openDrop = null
    }
})
function cleanText(text) {
    if (text.toString().includes('paper-')) {
        return `Paper ${text.split('paper-')[1]}`
    }
    return text
}
function updateFilters(doSearch = true) {
    if (window?.distinct) {
        const container = document.querySelector('.searchFilterContainer')
        container.innerHTML = ''
        for (let field in window.distinct) {
            const newDiv = document.createElement('div');
            newDiv.classList.add('filterItem');
            let innerText = 'all'

            if (window.currentFilters[field].length === 0) {
                if (window.distinct[field].length === 1) {
                    innerText = cleanText(window.distinct[field][0])
                }
            }
            else if (window.currentFilters[field].length === 1) {
                innerText = cleanText(window.currentFilters[field][0])
            }
            else if (!compareArrays(window.currentFilters[field].map((i)=>i.toString()).sort(),window.distinct[field].map((i)=>i.toString()).sort())) {
                innerText = window.currentFilters[field].map(i=>cleanText(i)).sort().join(', ')
            }
            newDiv.innerHTML = `
                <h6 class="filterText">
                    <div class="${field}Dropdown dropdownWrapper ${openDrop && openDrop===field ? 'show' : ''}">
                        ${window.distinct[field].sort().map((item,i) => {
                        return `<div onclick="removeFilter(event,'${field}', '${item}')" class="dropdownItem ${window.currentFilters[field].map((i)=>i.toString()).includes(item.toString()) ? 'selected' : ''}">
                                    <h6 class="dropdownText">
                                        ${cleanText(item)}
                                    </h6>
                                </div>`
                        }).join('')}
                    </div>
                    ${field}
                    <span onclick="openDropdown(event,'${field}')" class="innerText">
                        ${innerText}
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M11.6603 5L3 20H20.3205L11.6603 5ZM11.6603 11L8.19615 17H15.1244L11.6603 11Z"
                            fill="currentColor"
                          />
                        </svg>
                    </span>
                </h6>
            `
            container.appendChild(newDiv);
        }
        if (doSearch) search()
    }
}

async function fetchFilters() {
    const res = await fetch(`/api/filters`);
    const data = await res.json();

    if (data?.success) {
        window.distinct = data.data

        const currentFilter = {}
        for (let field in data.data) {
            currentFilter[field] = []
        }
        window.currentFilters = currentFilter
        console.log(window.currentFilters)
        console.log(window.distinct)
        updateFilters()
    }
}

fetchFilters()

function checkNav() {
    console.log(pageNum - 1)
    if (pageNum - 1 < 1) {
        document.querySelector('.prevPage').classList.add('greyed');
    } else {
        document.querySelector('.prevPage').classList.remove('greyed');
    }

    if (pageNum + 1 > maxPages) {
        document.querySelector('.nextPage').classList.add('greyed');
    } else {
        document.querySelector('.nextPage').classList.remove('greyed');
    }
}
function prevPage() {
    if (pageNum - 1 < 1) return;
    pageNum--;
    checkNav()

    document.querySelector('#curPage').innerHTML = pageNum;
    search(false,pageNum)
}

function nextPage() {
    if (pageNum + 1 > maxPages) return;

    pageNum += 1;
    checkNav()
    document.querySelector('#curPage').innerHTML = pageNum;
    search(false,pageNum);
}