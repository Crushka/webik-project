const VIEWBOX_WIDTH   = 246;
const CONNECTOR_TOP_Y = -5;

const BLOCK_INFO = {
    'default': { topX: 44,  botX: 44,  botY: 125.5, h: 148 },
    'cyco':    { topX: 44,  botX: 203, botY: 125.5, h: 148 },
    'end':     { topX: 203, botX: 44,  botY: 62.5,  h: 85  },
};

const SNAP_DISTANCE_Y = 60;
const SNAP_DISTANCE_X = 80;

// ─── Вспомогательные функции ──────────────────────────────────────────────────

const getSidebarWidth = () => document.getElementById('aside').offsetWidth;
const getHeaderHeight = () => document.getElementById('header').offsetHeight;

function getBlockType(el) {
    const id = el.id || el.getAttribute('data-original-id') || '';
    if (id === 'the-end_code_block') return 'end';
    if (id === 'cy-co_code_block')   return 'cyco';
    return 'default';
}

function getInfo(el) {
    return BLOCK_INFO[getBlockType(el)];
}

function getScale(el) {
    return el.getBoundingClientRect().width / VIEWBOX_WIDTH;
}

function getConnectors(el) {
    const rect  = el.getBoundingClientRect();
    const info  = getInfo(el);
    const scale = rect.width / VIEWBOX_WIDTH;
    return {
        topX: rect.left + info.topX * scale,
        topY: rect.top  + CONNECTOR_TOP_Y * scale,
        botX: rect.left + info.botX * scale,
        botY: rect.top  + info.botY * scale,
    };
}

const blockLinks = new Map();

function ensureLink(el) {
    if (!blockLinks.has(el)) blockLinks.set(el, { prev: null, next: null });
}

function unlinkBlock(el) {
    if (!blockLinks.has(el)) return;
    const lnk = blockLinks.get(el);
    if (lnk.prev) blockLinks.get(lnk.prev).next = null;
    if (lnk.next) blockLinks.get(lnk.next).prev = null;
    blockLinks.set(el, { prev: null, next: null });
}

function chainHead(el) {
    let cur = el;
    while (blockLinks.get(cur)?.prev) cur = blockLinks.get(cur).prev;
    return cur;
}

function chainFrom(head) {
    const arr = [];
    let cur = head;
    while (cur) { arr.push(cur); cur = blockLinks.get(cur)?.next || null; }
    return arr;
}

function isInChain(root, candidate) {
    let cur = root;
    while (cur) { if (cur === candidate) return true; cur = blockLinks.get(cur)?.next || null; }
    cur = root;
    while (cur) { if (cur === candidate) return true; cur = blockLinks.get(cur)?.prev || null; }
    return false;
}

function findSnapTarget(draggedEl) {
    const dc = getConnectors(draggedEl);
    let best = null, bestDist = SNAP_DISTANCE_Y, bestType = null;

    droppedBlocks.forEach(({ element: el }) => {
        if (el === draggedEl || isInChain(draggedEl, el)) return;

        const tc = getConnectors(el);

        const dY1 = Math.abs(dc.botY - tc.topY);
        const dX1 = Math.abs(dc.botX - tc.topX);
        if (dY1 < bestDist && dX1 < SNAP_DISTANCE_X) {
            bestDist = dY1; best = el; bestType = 'bot-to-top';
        }

        const dY2 = Math.abs(dc.topY - tc.botY);
        const dX2 = Math.abs(dc.topX - tc.botX);
        if (dY2 < bestDist && dX2 < SNAP_DISTANCE_X) {
            bestDist = dY2; best = el; bestType = 'top-to-bot';
        }
    });

    return { target: best, snapType: bestType };
}

function snapBlocks(draggedEl, targetEl, snapType) {
    const dInfo  = getInfo(draggedEl);
    const tInfo  = getInfo(targetEl);
    const dScale = getScale(draggedEl);
    const tScale = getScale(targetEl);

    const tLeft = parseFloat(targetEl.style.left) || 0;
    const tTop  = parseFloat(targetEl.style.top)  || 0;

    let newLeft, newTop;

    if (snapType === 'bot-to-top') {
        newLeft = tLeft + tInfo.topX * tScale - dInfo.botX * dScale;
        newTop  = tTop  + CONNECTOR_TOP_Y * tScale - dInfo.botY * dScale;
    } else {
        newLeft = tLeft + tInfo.botX * tScale - dInfo.topX * dScale;
        newTop  = tTop  + tInfo.botY * tScale - CONNECTOR_TOP_Y * dScale;
    }

    const head  = chainHead(draggedEl);
    const chain = chainFrom(head);
    const dx = newLeft - (parseFloat(draggedEl.style.left) || 0);
    const dy = newTop  - (parseFloat(draggedEl.style.top)  || 0);

    chain.forEach(el => {
        el.style.left = (parseFloat(el.style.left) + dx) + 'px';
        el.style.top  = (parseFloat(el.style.top)  + dy) + 'px';
    });

    chain.forEach(el => {
        const bd = droppedBlocks.find(b => b.element === el);
        if (bd) {
            bd.xPercent = parseFloat(el.style.left) / window.innerWidth  * 100;
            bd.yPercent = parseFloat(el.style.top)  / window.innerHeight * 100;
        }
    });

    ensureLink(draggedEl);
    ensureLink(targetEl);
    if (snapType === 'bot-to-top') {
        blockLinks.get(draggedEl).next = targetEl;
        blockLinks.get(targetEl).prev  = draggedEl;
    } else {
        blockLinks.get(targetEl).next  = draggedEl;
        blockLinks.get(draggedEl).prev = targetEl;
    }
}

let droppedBlocks   = [];
let draggedElement  = null;
let offsetX = 0, offsetY = 0;
let isOriginalBlock = false;

const originalBlocks = document.querySelectorAll('.blocks');

originalBlocks.forEach(block => {
    block.style.cursor   = 'grab';
    block.style.position = 'absolute';
    block.classList.add('original-block');
    block.addEventListener('mousedown', startDragFromSidebar);
});

function startDragFromSidebar(e) {
    const original = e.currentTarget;
    const rect = original.getBoundingClientRect();

    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    isOriginalBlock = true;

    const clone = original.cloneNode(true);
    clone.style.position = 'absolute';
    clone.style.left     = rect.left + 'px';
    clone.style.top      = rect.top  + 'px';
    clone.style.width    = rect.width + 'px';
    clone.style.opacity  = '0.7';
    clone.style.cursor   = 'grabbing';
    clone.style.zIndex   = '1000';
    clone.classList.remove('original-block', 'blocks');
    clone.classList.add('dragging-clone');
    clone.setAttribute('data-original-id', original.id);

    document.body.appendChild(clone);
    draggedElement = clone;

    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
}

function startDragExistingBlock(e) {
    draggedElement = e.currentTarget;
    const rect = draggedElement.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    isOriginalBlock = false;

    draggedElement.style.cursor  = 'grabbing';
    draggedElement.style.opacity = '0.7';
    draggedElement.style.zIndex  = '1000';

    unlinkBlock(draggedElement);

    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
}

function drag(e) {
    if (!draggedElement) return;

    const newX = e.clientX - offsetX;
    const newY = e.clientY - offsetY;

    const head  = chainHead(draggedElement);
    const chain = chainFrom(head);
    const dx = newX - (parseFloat(draggedElement.style.left) || 0);
    const dy = newY - (parseFloat(draggedElement.style.top)  || 0);

    chain.forEach(el => {
        el.style.left = (parseFloat(el.style.left) + dx) + 'px';
        el.style.top  = (parseFloat(el.style.top)  + dy) + 'px';
    });
}

function stopDrag(e) {
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);

    if (!draggedElement) return;

    const inSidebar = e.clientX <= getSidebarWidth();
    const inHeader  = e.clientY <= getHeaderHeight();

    if (isOriginalBlock) {
        if (!inSidebar && !inHeader) {
            draggedElement.style.opacity = '1';
            draggedElement.style.cursor  = 'move';
            draggedElement.style.zIndex  = '2';
            draggedElement.classList.remove('dragging-clone');
            draggedElement.classList.add('dropped-block');

            ensureLink(draggedElement);

            const snap = findSnapTarget(draggedElement);
            if (snap.target) snapBlocks(draggedElement, snap.target, snap.snapType);

            droppedBlocks.push({
                element:  draggedElement,
                xPercent: parseFloat(draggedElement.style.left) / window.innerWidth  * 100,
                yPercent: parseFloat(draggedElement.style.top)  / window.innerHeight * 100,
            });

            draggedElement.addEventListener('mousedown', startDragExistingBlock);
            draggedElement.addEventListener('dblclick', function () {
                unlinkBlock(this);
                blockLinks.delete(this);
                droppedBlocks = droppedBlocks.filter(b => b.element !== this);
                this.remove();
            });
        } else {
            draggedElement.remove();
        }
    } else {
        if (inSidebar || inHeader) {
            unlinkBlock(draggedElement);
            blockLinks.delete(draggedElement);
            droppedBlocks = droppedBlocks.filter(b => b.element !== draggedElement);
            draggedElement.remove();
        } else {
            draggedElement.style.opacity = '1';
            draggedElement.style.cursor  = 'move';
            draggedElement.style.zIndex  = '2';

            const snap = findSnapTarget(draggedElement);
            if (snap.target) snapBlocks(draggedElement, snap.target, snap.snapType);

            chainFrom(chainHead(draggedElement)).forEach(el => {
                const bd = droppedBlocks.find(b => b.element === el);
                if (bd) {
                    bd.xPercent = parseFloat(el.style.left) / window.innerWidth  * 100;
                    bd.yPercent = parseFloat(el.style.top)  / window.innerHeight * 100;
                }
            });
        }
    }

    draggedElement  = null;
    isOriginalBlock = false;
}

function initializeBlockPositions() {
    const sidebarWidth    = getSidebarWidth();
    const headerHeight    = getHeaderHeight();
    const asideBlockH     = document.getElementById('aside_block').offsetHeight;
    const availableHeight = window.innerHeight - headerHeight - asideBlockH - 60;

    const blockWidth = window.innerWidth * 0.18;
    const leftPos    = (sidebarWidth - blockWidth) / 2;

    const blockHeights = Array.from(originalBlocks).map(block =>
        getInfo(block).h * (blockWidth / VIEWBOX_WIDTH)
    );

    const totalH  = blockHeights.reduce((s, h) => s + h, 0);
    const spacing = Math.min(20, (availableHeight - totalH) / (originalBlocks.length + 1));
    let currentTop = headerHeight + spacing;

    originalBlocks.forEach((block, i) => {
        block.style.left = leftPos + 'px';
        block.style.top  = currentTop + 'px';
        currentTop += blockHeights[i] + spacing;
    });
}

function repositionDroppedBlocks() {
    const processedHeads = new Set();

    droppedBlocks.forEach(({ element: el }) => {
        if (!el || !document.body.contains(el)) return;

        const head = chainHead(el);
        if (processedHeads.has(head)) return;
        processedHeads.add(head);

        const headData = droppedBlocks.find(b => b.element === head);
        if (!headData) return;

        head.style.left = headData.xPercent / 100 * window.innerWidth  + 'px';
        head.style.top  = headData.yPercent / 100 * window.innerHeight + 'px';

        const chain = chainFrom(head);
        for (let i = 1; i < chain.length; i++) {
            const prev      = chain[i - 1];
            const cur       = chain[i];
            const prevInfo  = getInfo(prev);
            const curInfo   = getInfo(cur);
            const prevScale = getScale(prev);
            const curScale  = getScale(cur);

            cur.style.left = (parseFloat(prev.style.left)
                              + prevInfo.botX * prevScale
                              - curInfo.topX  * curScale) + 'px';

            cur.style.top  = (parseFloat(prev.style.top)
                              + prevInfo.botY * prevScale
                              - CONNECTOR_TOP_Y * curScale) + 'px';

            const bd = droppedBlocks.find(b => b.element === cur);
            if (bd) {
                bd.xPercent = parseFloat(cur.style.left) / window.innerWidth  * 100;
                bd.yPercent = parseFloat(cur.style.top)  / window.innerHeight * 100;
            }
        }
    });
}

window.addEventListener('load',   initializeBlockPositions);
window.addEventListener('resize', () => {
    initializeBlockPositions();
    repositionDroppedBlocks();
});