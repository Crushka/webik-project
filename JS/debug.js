let debugActive       = false;
let debugVariables    = {};
let debugFlatList     = [];
let debugPointer      = 0;
let debugControlStack = [];

function getBlockType(el) { return el.getAttribute('data-block-type') || 'default'; }
function blockKindDebug(el) { return el.querySelector('img')?.alt || ''; }

function getFields(block) {
    const f = {};
    block.querySelectorAll('[data-field]').forEach(el => { f[el.getAttribute('data-field')] = el.value; });
    return f;
}

function transpileExprDebug(expr) {
    const result = [];
    let i = 0;
    while (i < expr.length) {
        if (expr[i] === '"' || expr[i] === "'") {
            const q = expr[i];
            result.push(q); i++;
            while (i < expr.length && expr[i] !== q) {
                result.push(expr[i]); i++;
            }
            if (i < expr.length) { result.push(q); i++; }
            continue;
        }
        if (/[a-zA-Z_]/.test(expr[i])) {
            let word = '';
            const start = i;
            while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) { word += expr[i]; i++; }
            if      (word === 'and') result.push('&&');
            else if (word === 'or')  result.push('||');
            else if (word === 'not') result.push('!');
            else                     result.push(word);
            continue;
        }

        result.push(expr[i]); i++;
    }
    return result.join('');
}

function evalExprDebug(expr) {
    if (expr === undefined || expr === null || expr === '') return 0;
    try {
        const transpiled = transpileExprDebug(expr);
        const names  = Object.keys(debugVariables);
        const values = names.map(k => debugVariables[k]);
        return new Function(...names, `"use strict"; return (${transpiled});`)(...values);
    } catch (e) { throw new Error(`Не удалось вычислить: ${expr}`); }
}

function formatVal(val) { return Array.isArray(val) ? JSON.stringify(val) : String(val); }

function debugLog(msg, isError = false) {
    const body = document.getElementById('console-body');
    if (!body) return;
    const line = document.createElement('div');
    line.className = 'console-line' + (isError ? ' console-error' : '');
    line.innerHTML = '<span class="console-prefix">[debug/]</span>' + String(msg);
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
    openConsole();
}

function highlightDebugBlock(block) {
    clearAllHighlight();
    if (!block) return;
    block.classList.add('debug-active');
    const rect = block.getBoundingClientRect();
    if (rect.top < 100 || rect.bottom > window.innerHeight - 100)
        block.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function markErrorBlock(block) {
    clearAllHighlight();
    if (block) block.classList.add('debug-error');
}

function clearAllHighlight() {
    debugFlatList.forEach(b => b.classList.remove('debug-active', 'debug-error'));
}

function findCycleEnd(startIdx) {
    let depth = 1;
    for (let i = startIdx + 1; i < debugFlatList.length; i++) {
        const k = blockKindDebug(debugFlatList[i]);
        if (k === 'While' || k === 'For') depth++;
        else if (k === 'Cycle End') { depth--; if (depth === 0) return i; }
    }
    return -1;
}

function findIfBranches(ifIdx) {
    let depth = 1, elseIdx = -1, endIdx = -1;
    for (let i = ifIdx + 1; i < debugFlatList.length; i++) {
        const k = blockKindDebug(debugFlatList[i]);
        if (k === 'If') depth++;
        else if (k === 'Condition End') {
            depth--;
            if (depth === 0) { endIdx = i; break; }
        } else if (k === 'Else' && depth === 1) {
            elseIdx = i;
        }
    }
    return { elseIdx, endIdx };
}

function findTopLoop() {
    for (let i = debugControlStack.length - 1; i >= 0; i--) {
        const t = debugControlStack[i].type;
        if (t === 'while' || t === 'for') return debugControlStack[i];
    }
    return null;
}

function startDebug() {
    if (droppedBlocks.length === 0) { alert('Нет блоков для отладки!'); return; }

    const beginBlock = droppedBlocks.find(b => getBlockType(b) === 'begin');
    if (!beginBlock) { alert('Отсутствует блок Begin!'); return; }

    debugFlatList = [];
    let cur = beginBlock;
    while (cur) { debugFlatList.push(cur); cur = links.get(cur)?.next || null; }

    debugActive       = true;
    debugVariables    = {};
    debugPointer      = 0;
    debugControlStack = [];

    const consoleBody = document.getElementById('console-body');
    if (consoleBody) consoleBody.innerHTML = '';
    openConsole();

    highlightDebugBlock(debugFlatList[0]);
    showDebugPanel();
    updateStepInfo();
}

function stopDebug() {
    debugActive = false;
    const list = [...debugFlatList];
    for (let i = list.length - 1; i >= 0; i--)
        setTimeout(() => list[i].classList.remove('debug-active', 'debug-error'), (list.length - 1 - i) * 40);
    hideDebugPanel();
}

function nextStep() {
    if (!debugActive) return;

    const block = debugFlatList[debugPointer];
    const kind  = blockKindDebug(block);

    if (kind === 'End') return;

    let nextPtr;
    try {
        nextPtr = computeNextPointer(debugPointer);
    } catch(e) {
        markErrorBlock(block);
        debugLog('Ошибка: ' + e.message, true);
        debugActive = false;
        updateStepInfo();
        return;
    }

    debugPointer = nextPtr;

    if (debugPointer >= debugFlatList.length) {
        debugActive = false;
        updateStepInfo();
        return;
    }

    const nextBlock = debugFlatList[debugPointer];
    highlightDebugBlock(nextBlock);

    try {
        executeBlockEffect(nextBlock);
    } catch(e) {
        markErrorBlock(nextBlock);
        debugLog('Ошибка: ' + e.message, true);
        debugActive = false;
    }

    updateStepInfo();
}

function computeNextPointer(ptr) {
    const block = debugFlatList[ptr];
    const kind  = blockKindDebug(block);
    const type  = getBlockType(block);

    if (kind === 'Begin' || type === 'default') return ptr + 1;

    if (kind === 'End') return ptr;

    if (kind === 'Cycle End') {
        const frame = findTopLoop();
        if (!frame) return ptr + 1;

        if (frame.type === 'while') {
            const cond = evalExprDebug(frame.condition);
            debugLog(`while (${frame.condition}) → ${cond}`);
            if (cond) {
                return frame.startIdx + 1;
            } else {
                debugControlStack.pop();
                return ptr + 1;
            }
        }

        if (frame.type === 'for') {
            debugVariables[frame.forVar]++;
            const cond = debugVariables[frame.forVar] < frame.toVal;
            debugLog(`${frame.forVar}++ = ${debugVariables[frame.forVar]}, продолжить: ${cond}`);
            if (cond) {
                return frame.startIdx + 1;
            } else {
                debugControlStack.pop();
                return ptr + 1;
            }
        }

        return ptr + 1;
    }

    if (kind === 'Condition End') {
        for (let i = debugControlStack.length - 1; i >= 0; i--) {
            if (debugControlStack[i].type === 'if') { debugControlStack.splice(i, 1); break; }
        }
        return ptr + 1;
    }

    if (kind === 'Else') {
        const ceIdx = findIfBranches(ptr).endIdx;
        let depth = 1;
        for (let i = ptr + 1; i < debugFlatList.length; i++) {
            const k = blockKindDebug(debugFlatList[i]);
            if (k === 'If') depth++;
            else if (k === 'Condition End') { depth--; if (depth === 0) return i; }
        }
        return ptr + 1;
    }

    if (kind === 'If') {
        const fields = getFields(block);
        const cond   = evalExprDebug(fields.condition);
        debugLog(`if (${fields.condition}) → ${cond}`);
        const { elseIdx, endIdx } = findIfBranches(ptr);

        if (cond) {
            debugControlStack.push({ type: 'if', elseIdx, endIdx });
            return ptr + 1;
        } else {
            debugControlStack.push({ type: 'if', elseIdx, endIdx });
            if (elseIdx !== -1) {
                debugLog('→ else');
                return elseIdx + 1;
            }
            return endIdx !== -1 ? endIdx : ptr + 1;
        }
    }

    if (kind === 'While') {
        const fields       = getFields(block);
        const cond         = evalExprDebug(fields.condition);
        const cycleEndIdx  = findCycleEnd(ptr);
        debugLog(`while (${fields.condition}) → ${cond}`);

        if (cond) {
            debugControlStack.push({ type: 'while', condition: fields.condition, startIdx: ptr, cycleEndIdx });
            return ptr + 1;
        } else {
            return cycleEndIdx !== -1 ? cycleEndIdx + 1 : ptr + 1;
        }
    }

    if (kind === 'For') {
        const fields      = getFields(block);
        const fromVal     = evalExprDebug(fields.from !== '' ? fields.from : '0');
        const toVal       = evalExprDebug(fields.to);
        const cycleEndIdx = findCycleEnd(ptr);
        debugVariables[fields.forVar] = fromVal;
        debugLog(`for ${fields.forVar} = ${fromVal} .. ${toVal - 1}`);

        if (fromVal < toVal) {
            debugControlStack.push({ type: 'for', forVar: fields.forVar, toVal, startIdx: ptr, cycleEndIdx });
            return ptr + 1;
        } else {
            return cycleEndIdx !== -1 ? cycleEndIdx + 1 : ptr + 1;
        }
    }

    return ptr + 1;
}

function executeBlockEffect(block) {
    const type   = getBlockType(block);
    const kind   = blockKindDebug(block);
    const fields = getFields(block);

    if (type !== 'default') return;

    switch (kind) {
        case 'Set': {
            if (!fields.varName) throw new Error('Не указана переменная');
            debugVariables[fields.varName] = evalExprDebug(fields.value || '0');
            debugLog(`${fields.varName} := ${formatVal(debugVariables[fields.varName])}`);
            break;
        }
        case 'Get': {
            if (!fields.varName) throw new Error('Не указана переменная');
            let val;
            try { val = evalExprDebug(fields.varName); } catch(e) { val = debugVariables[fields.varName]; }
            debugLog(`get ${fields.varName} = ${formatVal(val)}`);
            break;
        }
        case 'Create array': {
            if (!fields.varName) throw new Error('Не указана переменная массива');
            const size = Math.floor(evalExprDebug(fields.size));
            if (size < 0) throw new Error('Размер массива не может быть отрицательным');
            debugVariables[fields.varName] = new Array(size).fill(0);
            debugLog(`create array ${fields.varName}[${size}]`);
            break;
        }
        case 'Get array length': {
            if (!fields.varName || !fields.arrName) throw new Error('Не указаны переменные');
            const arr = debugVariables[fields.arrName];
            if (!Array.isArray(arr)) throw new Error(`"${fields.arrName}" не является массивом`);
            debugVariables[fields.varName] = arr.length;
            debugLog(`${fields.varName} := length(${fields.arrName}) = ${arr.length}`);
            break;
        }
        case 'Get array value': {
            if (!fields.varName || !fields.arrName || !fields.index) throw new Error('Не указаны параметры');
            const idx = evalExprDebug(fields.index);
            const arr = debugVariables[fields.arrName];
            if (!Array.isArray(arr)) throw new Error(`"${fields.arrName}" не является массивом`);
            if (idx < 0 || idx >= arr.length) throw new Error(`Индекс ${idx} выходит за пределы`);
            debugVariables[fields.varName] = arr[idx];
            debugLog(`${fields.varName} := ${fields.arrName}[${idx}] = ${arr[idx]}`);
            break;
        }
        case 'Set array value': {
            if (!fields.arrName || fields.index === undefined || !fields.value) throw new Error('Не указаны параметры');
            const idx = evalExprDebug(fields.index);
            const val = evalExprDebug(fields.value);
            const arr = debugVariables[fields.arrName];
            if (!Array.isArray(arr)) throw new Error(`"${fields.arrName}" не является массивом`);
            if (idx < 0 || idx >= arr.length) throw new Error(`Индекс ${idx} выходит за пределы`);
            arr[idx] = val;
            debugLog(`${fields.arrName}[${idx}] := ${val}`);
            break;
        }
        case 'Swap': {
            if (!fields.arrName || !fields.index1 || !fields.index2) throw new Error('Не указаны параметры');
            const i1 = evalExprDebug(fields.index1), i2 = evalExprDebug(fields.index2);
            const arr = debugVariables[fields.arrName];
            if (!Array.isArray(arr)) throw new Error(`"${fields.arrName}" не является массивом`);
            [arr[i1], arr[i2]] = [arr[i2], arr[i1]];
            debugLog(`swap ${fields.arrName}[${i1}] ↔ [${i2}]`);
            break;
        }
        case 'Create matrix': {
            if (!fields.varName || !fields.rows || !fields.cols) throw new Error('Не указаны параметры');
            const rows = Math.floor(evalExprDebug(fields.rows));
            const cols = Math.floor(evalExprDebug(fields.cols));
            if (rows < 0 || cols < 0) throw new Error('Размеры матрицы не могут быть отрицательными');
            debugVariables[fields.varName] = Array(rows).fill(null).map(() => Array(cols).fill(0));
            debugLog(`create matrix ${fields.varName}[${rows}x${cols}]`);
            break;
        }
        case 'Get matrix value': {
            if (!fields.varName || !fields.matName || !fields.index1 || !fields.index2) throw new Error('Не указаны параметры');
            const i1 = evalExprDebug(fields.index1), i2 = evalExprDebug(fields.index2);
            const mat = debugVariables[fields.matName];
            if (!Array.isArray(mat) || !Array.isArray(mat[0])) throw new Error(`"${fields.matName}" не является матрицей`);
            if (i1 < 0 || i1 >= mat.length) throw new Error(`Индекс строки ${i1} выходит за пределы`);
            if (i2 < 0 || i2 >= mat[0].length) throw new Error(`Индекс столбца ${i2} выходит за пределы`);
            debugVariables[fields.varName] = mat[i1][i2];
            debugLog(`${fields.varName} := ${fields.matName}[${i1}][${i2}] = ${mat[i1][i2]}`);
            break;
        }
        case 'Set matrix value': {
            if (!fields.matName || !fields.index1 || !fields.index2 || !fields.value) throw new Error('Не указаны параметры');
            const i1 = evalExprDebug(fields.index1), i2 = evalExprDebug(fields.index2);
            const val = evalExprDebug(fields.value);
            const mat = debugVariables[fields.matName];
            if (!Array.isArray(mat) || !Array.isArray(mat[0])) throw new Error(`"${fields.matName}" не является матрицей`);
            if (i1 < 0 || i1 >= mat.length) throw new Error(`Индекс строки ${i1} выходит за пределы`);
            if (i2 < 0 || i2 >= mat[0].length) throw new Error(`Индекс столбца ${i2} выходит за пределы`);
            mat[i1][i2] = val;
            debugLog(`${fields.matName}[${i1}][${i2}] := ${val}`);
            break;
        }
        case 'Get matrix length': {
            if (!fields.varName || !fields.matName) throw new Error('Не указаны параметры');
            const mat = debugVariables[fields.matName];
            if (!Array.isArray(mat) || !Array.isArray(mat[0])) throw new Error(`"${fields.matName}" не является матрицей`);
            const result = fields.dimension === 'cols' ? mat[0].length : mat.length;
            debugVariables[fields.varName] = result;
            debugLog(`${fields.varName} := ${fields.dimension === 'cols' ? 'cols' : 'rows'}(${fields.matName}) = ${result}`);
            break;
        }
    }
}

function prevStep() {
    if (!debugActive || debugPointer === 0) return;
    debugPointer--;
    highlightDebugBlock(debugFlatList[debugPointer]);
    updateStepInfo();
}

function showDebugPanel() {
    let panel = document.getElementById('debug-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'debug-panel';
        panel.innerHTML = `
            <button onclick="prevStep()">⬆ Назад</button>
            <button onclick="nextStep()">⬇ Вперёд</button>
            <div id="debug-info">
                <span id="debug-step-text">Шаг: 0</span>
                <span id="debug-block-name">Begin</span>
            </div>
            <button onclick="stopDebug()">⏹ Стоп</button>`;
        document.body.appendChild(panel);
    }
    panel.style.display = 'flex';
    updateStepInfo();
}

function hideDebugPanel() {
    const p = document.getElementById('debug-panel');
    if (p) p.style.display = 'none';
}

function updateStepInfo() {
    const s = document.getElementById('debug-step-text');
    const n = document.getElementById('debug-block-name');
    if (s) s.textContent = `Шаг: ${debugPointer}`;
    if (n) {
        const b = debugFlatList[debugPointer];
        n.textContent = b ? (blockKindDebug(b) || getBlockType(b)) : '—';
    }
}

window.addEventListener('load', () => {});