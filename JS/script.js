const VIEWBOX_WIDTH = 246;

const BLOCK_INFO = {
    'begin':    { topX: 44,  topY: -5,   botX: 44,  botY: 62.5,  h: 85,  hasTop: false, hasBot: true  },
    'default':  { topX: 44,  topY: -5,   botX: 44,  botY: 125.5, h: 148, hasTop: true,  hasBot: true  },
    'cyco':     { topX: 44,  topY: -5,   botX: 203, botY: 125.5, h: 148, hasTop: true,  hasBot: true  },
    'cycleend': { topX: 203, topY: -5,   botX: 44,  botY: 62.5,  h: 85,  hasTop: true,  hasBot: true  },
    'end':      { topX: 43,  topY: -5,   botX: 43,  botY: 22.5,  h: 65,  hasTop: true,  hasBot: false },
};

const SNAP_DIST_Y = 55;
const SNAP_DIST_X = 70;

let canvas;
let canvasOffsetX = 0;
let canvasOffsetY = 0;

function applyCanvasTransform() {
    canvas.style.transform = `translate(${canvasOffsetX}px, ${canvasOffsetY}px)`;
}

let isPanning = false, panStartX = 0, panStartY = 0;
let spaceHeld = false;

function startPan(e) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    document.body.style.cursor = 'grabbing';
    e.preventDefault();
}
function stopPan() {
    if (!isPanning) return;
    isPanning = false;
    document.body.style.cursor = spaceHeld ? 'grab' : '';
}

window.addEventListener('mousedown', e => { if (e.button === 1) startPan(e); });
window.addEventListener('mousemove', e => {
    if (!isPanning) return;
    canvasOffsetX += e.clientX - panStartX;
    canvasOffsetY += e.clientY - panStartY;
    panStartX = e.clientX;
    panStartY = e.clientY;
    applyCanvasTransform();
});
window.addEventListener('mouseup', e => { if (e.button === 1) stopPan(); });

window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !spaceHeld && !draggedEl) {
        spaceHeld = true;
        document.body.style.cursor = 'grab';
        e.preventDefault();
    }
});
window.addEventListener('keyup', e => {
    if (e.code === 'Space') {
        spaceHeld = false;
        stopPan();
        document.body.style.cursor = '';
    }
});
window.addEventListener('mousedown', e => {
    if (e.button === 0 && spaceHeld && !draggedEl) startPan(e);
});
window.addEventListener('mouseup', e => { if (e.button === 0) stopPan(); });

function getBlockType(el) {
    return el.getAttribute('data-block-type') || 'default';
}

function getInfo(el) {
    return BLOCK_INFO[getBlockType(el)];
}

function getScale(el) {
    return el.getBoundingClientRect().width / VIEWBOX_WIDTH;
}

function getConnectors(el) {
    const r = el.getBoundingClientRect();
    const info = getInfo(el);
    const s = r.width / VIEWBOX_WIDTH;
    return {
        topX: r.left + info.topX * s,
        topY: r.top  + info.topY * s,
        botX: r.left + info.botX * s,
        botY: r.top  + info.botY * s,
    };
}

const links = new Map();

function ensureLink(el) {
    if (!links.has(el)) links.set(el, { prev: null, next: null });
}

function unlinkBlock(el) {
    if (!links.has(el)) return;
    const lnk = links.get(el);
    if (lnk.prev && links.has(lnk.prev)) links.get(lnk.prev).next = null;
    if (lnk.next && links.has(lnk.next)) links.get(lnk.next).prev = null;
    links.set(el, { prev: null, next: null });
}

function chainHead(el) {
    let cur = el;
    while (links.get(cur)?.prev) cur = links.get(cur).prev;
    return cur;
}

function chainFrom(head) {
    const arr = [];
    let cur = head;
    while (cur) { arr.push(cur); cur = links.get(cur)?.next || null; }
    return arr;
}

function isInChain(root, candidate) {
    let cur = root;
    while (cur) { if (cur === candidate) return true; cur = links.get(cur)?.next || null; }
    cur = links.get(root)?.prev || null;
    while (cur) { if (cur === candidate) return true; cur = links.get(cur)?.prev || null; }
    return false;
}

function findSnap(draggedEl) {
    const dc = getConnectors(draggedEl);
    const di = getInfo(draggedEl);
    let best = null, bestDist = SNAP_DIST_Y, bestType = null;

    droppedBlocks.forEach(el => {
        if (el === draggedEl || isInChain(draggedEl, el)) return;
        const tc = getConnectors(el);
        const ti = getInfo(el);

        if (di.hasBot && ti.hasTop) {
            const dy = Math.abs(dc.botY - tc.topY);
            const dx = Math.abs(dc.botX - tc.topX);
            if (dy < bestDist && dx < SNAP_DIST_X) { bestDist = dy; best = el; bestType = 'B2T'; }
        }
        if (di.hasTop && ti.hasBot) {
            const dy = Math.abs(dc.topY - tc.botY);
            const dx = Math.abs(dc.topX - tc.botX);
            if (dy < bestDist && dx < SNAP_DIST_X) { bestDist = dy; best = el; bestType = 'T2B'; }
        }
    });
    return { target: best, type: bestType };
}

function snapBlocks(dEl, tEl, snapType) {
    const di = getInfo(dEl);
    const ti = getInfo(tEl);
    const ds = getScale(dEl);
    const ts = getScale(tEl);
    const tLeft = parseFloat(tEl.style.left) || 0;
    const tTop  = parseFloat(tEl.style.top)  || 0;

    let newLeft, newTop;
    if (snapType === 'B2T') {
        newLeft = tLeft + ti.topX * ts - di.botX * ds;
        newTop  = tTop  + ti.topY * ts - di.botY * ds;
    } else {
        newLeft = tLeft + ti.botX * ts - di.topX * ds;
        newTop  = tTop  + ti.botY * ts - di.topY * ds;
    }

    const head = chainHead(dEl);
    const chain = chainFrom(head);
    const dx = newLeft - (parseFloat(dEl.style.left) || 0);
    const dy = newTop  - (parseFloat(dEl.style.top)  || 0);
    chain.forEach(el => {
        el.style.left = (parseFloat(el.style.left) + dx) + 'px';
        el.style.top  = (parseFloat(el.style.top)  + dy) + 'px';
    });

    ensureLink(dEl); ensureLink(tEl);
    if (snapType === 'B2T') {
        links.get(dEl).next = tEl;
        links.get(tEl).prev = dEl;
    } else {
        links.get(tEl).next = dEl;
        links.get(dEl).prev = tEl;
    }
}

let droppedBlocks = [];
let draggedEl     = null;
let dragOffX = 0, dragOffY = 0;
let draggingFromSidebar = false;

const sidebarWidth = () => document.getElementById('aside').offsetWidth;
const headerHeight = () => document.getElementById('header').offsetHeight;

document.querySelectorAll('#sidebar-scroll .block-wrapper').forEach(block => {
    block.addEventListener('mousedown', onSidebarMousedown);
});

function onSidebarMousedown(e) {
    if (e.button !== 0) return;
    if (spaceHeld) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    const original = e.currentTarget;
    const rect = original.getBoundingClientRect();

    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;
    draggingFromSidebar = true;

    const clone = original.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.left   = rect.left + 'px';
    clone.style.top    = rect.top  + 'px';
    clone.style.width  = rect.width + 'px';
    clone.style.opacity = '0.75';
    clone.style.zIndex  = '1000';
    clone.classList.add('dragging-clone');
    document.body.appendChild(clone);
    draggedEl = clone;

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup',   onDragEnd);
    e.preventDefault();
}

function onCanvasMousedown(e) {
    if (e.button !== 0) return;
    if (spaceHeld) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    draggedEl = e.currentTarget;
    draggingFromSidebar = false;

    const rect = draggedEl.getBoundingClientRect();
    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;

    const cl = parseFloat(draggedEl.style.left) || 0;
    const ct = parseFloat(draggedEl.style.top)  || 0;
    draggedEl.style.position = 'fixed';
    draggedEl.style.left = (cl + canvasOffsetX) + 'px';
    draggedEl.style.top  = (ct + canvasOffsetY) + 'px';
    draggedEl.style.zIndex = '1000';
    draggedEl.style.opacity = '0.75';
    document.body.appendChild(draggedEl);

    unlinkBlock(draggedEl);

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup',   onDragEnd);
    e.preventDefault();
}

function onDragMove(e) {
    if (!draggedEl) return;
    const nx = e.clientX - dragOffX;
    const ny = e.clientY - dragOffY;
    const head = chainHead(draggedEl);
    const chain = chainFrom(head);
    const dx = nx - parseFloat(draggedEl.style.left);
    const dy = ny - parseFloat(draggedEl.style.top);
    chain.forEach(el => {
        el.style.left = (parseFloat(el.style.left) + dx) + 'px';
        el.style.top  = (parseFloat(el.style.top)  + dy) + 'px';
    });
}

function onDragEnd(e) {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup',   onDragEnd);
    if (!draggedEl) return;

    const sw = sidebarWidth();
    const hh = headerHeight();
    const inSidebar = e.clientX <= sw;
    const inHeader  = e.clientY <= hh;

    function adoptOnCanvas(el) {
        const vl = parseFloat(el.style.left) || 0;
        const vt = parseFloat(el.style.top)  || 0;
        el.style.position = 'absolute';
        el.style.left = (vl - canvasOffsetX) + 'px';
        el.style.top  = (vt - canvasOffsetY) + 'px';
        el.style.width = '18vw';
        canvas.appendChild(el);
    }

    if (draggingFromSidebar) {
        if (!inSidebar && !inHeader) {
            draggedEl.style.opacity = '1';
            draggedEl.style.zIndex  = '2';
            draggedEl.classList.remove('dragging-clone');
            draggedEl.classList.add('dropped-block');
            adoptOnCanvas(draggedEl);
            ensureLink(draggedEl);
            droppedBlocks.push(draggedEl);

            const snap = findSnap(draggedEl);
            if (snap.target) snapBlocks(draggedEl, snap.target, snap.type);

            draggedEl.addEventListener('mousedown', onCanvasMousedown);
            draggedEl.addEventListener('dblclick', removeBlock);
        } else {
            draggedEl.remove();
        }
    } else {
        if (inSidebar || inHeader) {
            removeBlock.call(draggedEl);
        } else {
            draggedEl.style.opacity = '1';
            draggedEl.style.zIndex  = '2';
            adoptOnCanvas(draggedEl);

            const snap = findSnap(draggedEl);
            if (snap.target) snapBlocks(draggedEl, snap.target, snap.type);
        }
    }

    draggedEl = null;
    draggingFromSidebar = false;
}

function removeBlock() {
    const el = this;
    unlinkBlock(el);
    links.delete(el);
    droppedBlocks = droppedBlocks.filter(b => b !== el);
    el.remove();
}

function deleteAllBlocks() {
    droppedBlocks.forEach(el => { if (el?.parentNode) el.remove(); });
    droppedBlocks = [];
    links.clear();
}

window.addEventListener('load', () => {
    canvas = document.createElement('div');
    canvas.id = 'canvas';
    canvas.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 0; height: 0;
        overflow: visible;
        z-index: 1;
    `;
    document.body.appendChild(canvas);
});