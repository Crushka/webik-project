function siteLog(msg, isError = false) {
    const body = document.getElementById('console-body');
    if (!body) return;
    const line = document.createElement('div');
    line.className = 'console-line' + (isError ? ' console-error' : '');
    line.innerHTML = '<span class="console-prefix">&gt;</span>' + String(msg);
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
}

function openConsole() {
    const wrapper = document.getElementById('console-wrapper');
    if (wrapper && !wrapper.classList.contains('open')) wrapper.classList.add('open');
}

function toggleConsole() {
    const wrapper = document.getElementById('console-wrapper');
    if (wrapper) wrapper.classList.toggle('open');
}

function getField(blockEl, fieldName) {
    const inp = blockEl.querySelector(`[data-field="${fieldName}"]`);
    return inp ? inp.value.trim() : '';
}

function collectBlocks() {
    const begin = droppedBlocks.find(b => {
        const img = b.querySelector('img');
        return img && img.alt === 'Begin';
    });
    if (!begin) return null;
    const result = [];
    let cur = begin;
    while (cur) {
        result.push(cur);
        cur = links.get(cur)?.next || null;
    }
    return result;
}

function blockKind(el) {
    const img = el.querySelector('img');
    return img ? img.alt : '';
}

function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
        if (/\s/.test(expr[i])) { i++; continue; }

        if (expr[i] === '"' || expr[i] === "'") {
            const q = expr[i]; let s = q; i++;
            while (i < expr.length && expr[i] !== q) s += expr[i++];
            s += q; i++;
            tokens.push({ type: 'string', value: s.slice(1, -1) });
            continue;
        }

        if (expr[i] === '[') {
            let depth = 0, s = '';
            while (i < expr.length) {
                s += expr[i];
                if (expr[i] === '[') depth++;
                else if (expr[i] === ']') { depth--; if (depth === 0) { i++; break; } }
                i++;
            }
            tokens.push({ type: 'array_literal', raw: s });
            continue;
        }

        if (/[0-9]/.test(expr[i]) || (expr[i] === '.' && /[0-9]/.test(expr[i+1]))) {
            let s = '';
            while (i < expr.length && /[0-9.]/.test(expr[i])) s += expr[i++];
            tokens.push({ type: 'number', value: parseFloat(s) });
            continue;
        }

        if (i + 1 < expr.length) {
            const two = expr[i] + expr[i+1];
            if (['**', '<=', '>=', '==', '!='].includes(two)) {
                tokens.push({ type: 'op', value: two }); i += 2; continue;
            }
        }

        if ('+-*/%()<>,'.includes(expr[i])) {
            tokens.push({ type: expr[i] === '(' ? 'lparen' : expr[i] === ')' ? 'rparen' : expr[i] === ',' ? 'comma' : 'op', value: expr[i] });
            i++; continue;
        }

        if (/[a-zA-Z_]/.test(expr[i])) {
            let s = '';
            while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) s += expr[i++];
            tokens.push({ type: 'ident', value: s });
            continue;
        }
        i++;
    }
    return tokens;
}

function parseExpr(tokens) {
    let pos = 0;

    function peek() { return tokens[pos]; }
    function consume() { return tokens[pos++]; }
    function expect(val) { if (peek()?.value === val) return consume(); throw new Error(`Expected "${val}"`); }

    function parseComparison() { // 0 уровень приоритета наименьший (==, !=, <, >, <=, >=)
        let left = parseAdditive();
        const t = peek();
        if (t && t.type === 'op' && ['==','!=','<','>','<=','>='].includes(t.value)) {
            consume();
            const right = parseAdditive();
            const opMap = { '==': 'equal', '!=': 'not equal', '<': 'less', '>': 'more', '<=': 'less or equal', '>=': 'more or equal' };
            return { type: opMap[t.value], left, right };
        }
        return left;
    }

    function parseAdditive() { // 1 уровень приоритета (+, -)
        let left = parseMultiplicative();
        while (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) {
            const op = consume().value;
            const right = parseMultiplicative();
            left = { type: op === '+' ? 'add' : 'sub', left, right };
        }
        return left;
    }

    function parseMultiplicative() { // 2 уровень приоритета (*, /, %)
        let left = parseUnary();
        while (peek()?.type === 'op' && ['*', '/', '%'].includes(peek().value)) {
            const op = consume().value;
            const right = parseUnary();
            left = { type: op === '*' ? 'multiply' : op === '/' ? 'division' : 'mod', left, right };
        }
        return left;
    }

    function parseUnary() { // 3 уроень приоритета (унарный знак "-" перед числом)
        if (peek()?.type === 'op' && peek().value === '-') {
            consume();
            const operand = parseUnary();
            return { type: 'negate', operand };
        }
        return parsePower();
    }

    function parsePower() { // 4 уровень приоритета (степень)
        let base = parseVariable();
        if (peek()?.type === 'op' && peek().value === '**') {
            consume();
            const exp = parseUnary();
            return { type: 'power', left: base, right: exp };
        }
        return base;
    }

    function parseVariable() { // 5 уровень приоритета наивысший (числа, переменные, скобки)
        const t = peek();
        if (!t) throw new Error('Неожиданный конец выражения');

        if (t.type === 'number') { consume(); return { type: 'number', value: t.value }; }
        if (t.type === 'string') { consume(); return { type: 'string', value: t.value }; }

        if (t.type === 'array_literal') {
            consume();
            const inner = t.raw.slice(1, -1).trim();
            if (inner === '') return { type: 'array', elements: [] };
            const parts = splitTopLevelCommas(inner);
            const elements = parts.map(p => {
                const toks = tokenize(p.trim());
                return parseExpr(toks);
            });
            return { type: 'array', elements };
        }

        if (t.type === 'lparen') {
            consume();
            const node = parseComparison();
            expect(')');
            return node;
        }

        if (t.type === 'ident') {
            consume();
            if (peek()?.type === 'lparen') {
                consume();
                const args = [];
                if (peek()?.type !== 'rparen') {
                    args.push(parseComparison());
                    while (peek()?.type === 'comma') { consume(); args.push(parseComparison()); }
                }
                expect(')');
                return { type: 'call', name: t.value, args };
            }
            return { type: 'variable', name: t.value };
        }

        throw new Error(`Неожиданный токен: ${t.value}`);
    }

    const result = parseComparison();
    if (pos < tokens.length) throw new Error(`Лишние символы: ${tokens.slice(pos).map(x=>x.value).join('')}`);
    return result;
}

function splitTopLevelCommas(str) {
    const parts = []; let depth = 0; let cur = '';
    for (const ch of str) {
        if (ch === '[' || ch === '(') depth++;
        else if (ch === ']' || ch === ')') depth--;
        if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; }
        else cur += ch;
    }
    if (cur) parts.push(cur);
    return parts;
}

function parseValueExpr(str) {
    if (!str && str !== '0') return null;
    try {
        const tokens = tokenize(str);
        return parseExpr(tokens);
    } catch(e) {
        return null;
    }
}

function parseCondition(str) {
    return parseValueExpr(str);
}

function buildAST(blocks, startIndex) {
    const body = [];
    let i = startIndex;

    while (i < blocks.length) {
        const el = blocks[i];
        const kind = blockKind(el);

        if (kind === 'Begin') { i++; continue; }
        if (kind === 'End') { return { body, error: null, nextIndex: i + 1 }; }

        if (kind === 'Create array') {
            const varName = getField(el, 'varName');
            const sizeRaw = getField(el, 'size');
            if (!varName) return { body: null, error: 'Create array: пустое имя переменной', nextIndex: i };
            const sizeNode = parseValueExpr(sizeRaw);
            if (!sizeNode) return { body: null, error: `Create array: неверный размер "${sizeRaw}"`, nextIndex: i };
            body.push({ type: 'create_array', name: varName, size: sizeNode });
            i++; continue;
        }

        if (kind === 'Create matrix') {
            const varName = getField(el, 'varName');
            const rowsRaw = getField(el, 'rows');
            const colsRaw = getField(el, 'cols');
            if (!varName) return { body: null, error: 'Create matrix: пустое имя переменной', nextIndex: i };
            const rowsNode = parseValueExpr(rowsRaw);
            const colsNode = parseValueExpr(colsRaw);
            if (!rowsNode) return { body: null, error: `Create matrix: неверное число строк "${rowsRaw}"`, nextIndex: i };
            if (!colsNode) return { body: null, error: `Create matrix: неверное число столбцов "${colsRaw}"`, nextIndex: i };
            body.push({ type: 'create_matrix', name: varName, rows: rowsNode, cols: colsNode });
            i++; continue;
        }

        if (kind === 'Set') {
            const varName = getField(el, 'varName');
            const rawVal = getField(el, 'value');
            if (!varName) return { body: null, error: 'Set: пустое имя переменной', nextIndex: i };
            const valNode = parseValueExpr(rawVal);
            if (!valNode) return { body: null, error: `Set: неверное значение "${rawVal}"`, nextIndex: i };
            body.push({ type: 'set', name: varName, value: valNode });
            i++; continue;
        }

        if (kind === 'Get') {
            const rawVar = getField(el, 'varName');
            if (!rawVar) return { body: null, error: 'Get: пустое поле', nextIndex: i };
            const valNode = parseValueExpr(rawVar);
            if (!valNode) return { body: null, error: `Get: неверное значение "${rawVar}"`, nextIndex: i };
            body.push({ type: 'print', value: valNode });
            i++; continue;
        }

        if (kind === 'Get array length') {
            const varName = getField(el, 'varName');
            const arrName = getField(el, 'arrName');
            if (!varName || !arrName) return { body: null, error: 'Get array length: пустые поля', nextIndex: i };
            body.push({ type: 'set', name: varName, value: { type: 'array_length', array: arrName } });
            i++; continue;
        }

        if (kind === 'Swap') {
            const arrName = getField(el, 'arrName');
            const idx1Raw = getField(el, 'index1');
            const idx2Raw = getField(el, 'index2');
            if (!arrName || !idx1Raw || !idx2Raw) return { body: null, error: 'Swap: пустые поля', nextIndex: i };
            const idx1 = parseValueExpr(idx1Raw);
            const idx2 = parseValueExpr(idx2Raw);
            if (!idx1 || !idx2) return { body: null, error: 'Swap: неверные индексы', nextIndex: i };
            body.push({ type: 'swap', array: arrName, index1: idx1, index2: idx2 });
            i++; continue;
        }

        if (kind === 'Get array value') {
            const varName = getField(el, 'varName');
            const arrName = getField(el, 'arrName');
            const idxRaw = getField(el, 'index');
            if (!varName || !arrName || !idxRaw) return { body: null, error: 'Get array value: пустые поля', nextIndex: i };
            const idx = parseValueExpr(idxRaw);
            if (!idx) return { body: null, error: 'Get array value: неверный индекс', nextIndex: i };
            body.push({ type: 'set', name: varName, value: { type: 'array_get', array: arrName, index: idx } });
            i++; continue;
        }

        if (kind === 'Set array value') {
            const arrName = getField(el, 'arrName');
            const idxRaw = getField(el, 'index');
            const valRaw = getField(el, 'value');
            if (!arrName || !idxRaw || !valRaw) return { body: null, error: 'Set array value: пустые поля', nextIndex: i };
            const idx = parseValueExpr(idxRaw);
            const val = parseValueExpr(valRaw);
            if (!idx) return { body: null, error: 'Set array value: неверный индекс', nextIndex: i };
            if (!val) return { body: null, error: `Set array value: неверное значение "${valRaw}"`, nextIndex: i };
            body.push({ type: 'array_set_value', array: arrName, index: idx, value: val });
            i++; continue;
        }

        if (kind === 'Get matrix value') {
            const varName = getField(el, 'varName');
            const matName = getField(el, 'matName');
            const idx1Raw = getField(el, 'index1');
            const idx2Raw = getField(el, 'index2');
            if (!varName || !matName || !idx1Raw || !idx2Raw) return { body: null, error: 'Get matrix value: пустые поля', nextIndex: i };
            const idx1 = parseValueExpr(idx1Raw);
            const idx2 = parseValueExpr(idx2Raw);
            if (!idx1 || !idx2) return { body: null, error: 'Get matrix value: неверные индексы', nextIndex: i };
            body.push({ type: 'set', name: varName, value: { type: 'matrix_get', matrix: matName, index1: idx1, index2: idx2 } });
            i++; continue;
        }

        if (kind === 'Set matrix value') {
            const matName = getField(el, 'matName');
            const idx1Raw = getField(el, 'index1');
            const idx2Raw = getField(el, 'index2');
            const valRaw = getField(el, 'value');
            if (!matName || !idx1Raw || !idx2Raw || !valRaw) return { body: null, error: 'Set matrix value: пустые поля', nextIndex: i };
            const idx1 = parseValueExpr(idx1Raw);
            const idx2 = parseValueExpr(idx2Raw);
            const val = parseValueExpr(valRaw);
            if (!idx1 || !idx2) return { body: null, error: 'Set matrix value: неверные индексы', nextIndex: i };
            if (!val) return { body: null, error: `Set matrix value: неверное значение "${valRaw}"`, nextIndex: i };
            body.push({ type: 'matrix_set_value', matrix: matName, index1: idx1, index2: idx2, value: val });
            i++; continue;
        }

        if (kind === 'Get matrix length') {
            const varName = getField(el, 'varName');
            const matName = getField(el, 'matName');
            const dimension = getField(el, 'dimension');
            if (!varName || !matName) return { body: null, error: 'Get matrix size: пустые поля', nextIndex: i };
            body.push({ type: 'set', name: varName, value: { type: 'matrix_size', matrix: matName, dimension: dimension || 'rows' } });
            i++; continue;
        }

        if (kind === 'If') {
            const condRaw = getField(el, 'condition');
            const condNode = parseCondition(condRaw);
            if (!condNode) return { body: null, error: `If: неверное условие "${condRaw}"`, nextIndex: i };
            const inner = buildAST(blocks, i + 1);
            if (inner.error) return inner;
            let elseBody = null;
            let afterIndex = inner.nextIndex;
            if (afterIndex < blocks.length && blockKind(blocks[afterIndex]) === 'Else') {
                const elseInner = buildAST(blocks, afterIndex + 1);
                if (elseInner.error) return elseInner;
                elseBody = elseInner.body;
                afterIndex = elseInner.nextIndex;
            }
            body.push({ type: 'if', condition: condNode, body: inner.body, elseBody });
            i = afterIndex; continue;
        }

        if (kind === 'Condition End') { return { body, error: null, nextIndex: i + 1 }; }
        if (kind === 'Else') { return { body, error: null, nextIndex: i }; }

        if (kind === 'While') {
            const condRaw = getField(el, 'condition');
            const condNode = parseCondition(condRaw);
            if (!condNode) return { body: null, error: `While: неверное условие "${condRaw}"`, nextIndex: i };
            const inner = buildAST(blocks, i + 1);
            if (inner.error) return inner;
            body.push({ type: 'while', condition: condNode, body: inner.body });
            i = inner.nextIndex; continue;
        }

        if (kind === 'For') {
            const forVar  = getField(el, 'forVar');
            const fromRaw = getField(el, 'from');
            const toRaw  = getField(el, 'to');
            if (!forVar) return { body: null, error: 'For: пустое имя переменной', nextIndex: i };
            const fromNode = parseValueExpr(fromRaw !== '' ? fromRaw : '0');
            const toNode   = parseValueExpr(toRaw);
            if (!fromNode || !toNode) return { body: null, error: 'For: неверный диапазон', nextIndex: i };
            const inner = buildAST(blocks, i + 1);
            if (inner.error) return inner;
            body.push({ type: 'for', var: forVar, from: fromNode, to: toNode, body: inner.body });
            i = inner.nextIndex; continue;
        }

        if (kind === 'Cycle End') { return { body, error: null, nextIndex: i + 1 }; }

        i++;
    }

    return { body, error: null, nextIndex: i };
}

function compileProgram(body, instructions) {
    for (let i = 0; i < body.length; i++) compileStatement(body[i], instructions);
}

function compileExpression(node, instructions) {
    switch (node.type) {
        case 'number':
            instructions.push({ type: 'push', value: node.value });
            break;
        case 'string':
            instructions.push({ type: 'push', value: node.value });
            break;
        case 'variable':
            instructions.push({ type: 'load', name: node.name });
            break;
        case 'array':
            node.elements.forEach(el => compileExpression(el, instructions));
            instructions.push({ type: 'array_literal', count: node.elements.length });
            break;
        case 'array_get':
            instructions.push({ type: 'load', name: node.array });
            compileExpression(node.index, instructions);
            instructions.push({ type: 'array_get' });
            break;
        case 'array_length':
            instructions.push({ type: 'load', name: node.array });
            instructions.push({ type: 'array_length' });
            break;
        case 'matrix_get':
            instructions.push({ type: 'load', name: node.matrix });
            compileExpression(node.index1, instructions);
            compileExpression(node.index2, instructions);
            instructions.push({ type: 'matrix_get' });
            break;
        case 'matrix_size':
            instructions.push({ type: 'load', name: node.matrix });
            instructions.push({ type: 'matrix_size', dimension: node.dimension });
            break;
        case 'negate':
            compileExpression(node.operand, instructions);
            instructions.push({ type: 'negate' });
            break;
        case 'call':
            node.args.forEach(a => compileExpression(a, instructions));
            instructions.push({ type: 'call', name: node.name, argc: node.args.length });
            break;
        case 'add':
        case 'sub':
        case 'multiply':
        case 'division':
        case 'power':
        case 'mod':
        case 'less':
        case 'more':
        case 'equal':
        case 'not equal':
        case 'less or equal':
        case 'more or equal':
            compileExpression(node.left, instructions);
            compileExpression(node.right, instructions);
            instructions.push({ type: node.type });
            break;
    }
}

function compileStatement(node, instructions) {
    switch (node.type) {
        case 'create_array':
            compileExpression(node.size, instructions);
            instructions.push({ type: 'create_array', name: node.name });
            break;

        case 'create_matrix':
            compileExpression(node.rows, instructions);
            compileExpression(node.cols, instructions);
            instructions.push({ type: 'create_matrix', name: node.name });
            break;

        case 'set':
            if (node.value.type === 'array') {
                node.value.elements.forEach(el => compileExpression(el, instructions));
                instructions.push({ type: 'set_array_from_literal', name: node.name, count: node.value.elements.length });
            } else {
                compileExpression(node.value, instructions);
                instructions.push({ type: 'store', name: node.name });
            }
            break;

        case 'print':
            compileExpression(node.value, instructions);
            instructions.push({ type: 'print' });
            break;

        case 'swap': {
            instructions.push({ type: 'load', name: node.array });
            compileExpression(node.index1, instructions);
            instructions.push({ type: 'array_get' });
            instructions.push({ type: 'store', name: '__swap_tmp__' });
            instructions.push({ type: 'load', name: node.array });
            compileExpression(node.index1, instructions);
            instructions.push({ type: 'load', name: node.array });
            compileExpression(node.index2, instructions);
            instructions.push({ type: 'array_get' });
            instructions.push({ type: 'array_set', name: node.array });
            instructions.push({ type: 'load', name: node.array });
            compileExpression(node.index2, instructions);
            instructions.push({ type: 'load', name: '__swap_tmp__' });
            instructions.push({ type: 'array_set', name: node.array });
            break;
        }

        case 'array_set_value': {
            instructions.push({ type: 'load', name: node.array });
            compileExpression(node.index, instructions);
            compileExpression(node.value, instructions);
            instructions.push({ type: 'array_set', name: node.array });
            break;
        }

        case 'matrix_set_value': {
            instructions.push({ type: 'load', name: node.matrix });
            compileExpression(node.index1, instructions);
            compileExpression(node.index2, instructions);
            compileExpression(node.value, instructions);
            instructions.push({ type: 'matrix_set', name: node.matrix });
            break;
        }

        case 'if': {
            compileExpression(node.condition, instructions);
            const jifIdx = instructions.length;
            instructions.push({ type: 'jump_if_false', address: null });
            compileProgram(node.body, instructions);
            if (node.elseBody) {
                const jIdx = instructions.length;
                instructions.push({ type: 'jump', address: null });
                instructions[jifIdx].address = instructions.length;
                compileProgram(node.elseBody, instructions);
                instructions[jIdx].address = instructions.length;
            } else {
                instructions[jifIdx].address = instructions.length;
            }
            break;
        }

        case 'while': {
            const loopStart = instructions.length;
            compileExpression(node.condition, instructions);
            const jifIdx = instructions.length;
            instructions.push({ type: 'jump_if_false', address: null });
            compileProgram(node.body, instructions);
            instructions.push({ type: 'jump', address: loopStart });
            instructions[jifIdx].address = instructions.length;
            break;
        }

        case 'for': {
            compileExpression(node.from, instructions);
            instructions.push({ type: 'store', name: node.var });
            const loopStart = instructions.length;
            instructions.push({ type: 'load', name: node.var });
            compileExpression(node.to, instructions);
            instructions.push({ type: 'less' });
            const jifIdx = instructions.length;
            instructions.push({ type: 'jump_if_false', address: null });
            compileProgram(node.body, instructions);
            instructions.push({ type: 'load', name: node.var });
            instructions.push({ type: 'push', value: 1 });
            instructions.push({ type: 'add' });
            instructions.push({ type: 'store', name: node.var });
            instructions.push({ type: 'jump', address: loopStart });
            instructions[jifIdx].address = instructions.length;
            break;
        }
    }
}

function run(instructions) {
    const stack = [];
    const variables = {};
    let ip = 0;
    const MAX_STEPS = 1_000_000;
    let steps = 0;

    while (ip < instructions.length) {
        if (++steps > MAX_STEPS) {
            siteLog('Ошибка: превышен лимит итераций (бесконечный цикл?)', true);
            return;
        }
        const instr = instructions[ip];
        let a, b;

        switch (instr.type) {
            case 'jump':
                ip = instr.address; continue;

            case 'jump_if_false': {
                const cond = stack.pop();
                if (!cond) { ip = instr.address; continue; }
                break;
            }

            case 'push':
                stack.push(instr.value); break;

            case 'load':
                if (!(instr.name in variables)) {
                    siteLog(`Ошибка: переменная "${instr.name}" не определена`, true); return;
                }
                stack.push(variables[instr.name]); break;

            case 'store':
                variables[instr.name] = stack.pop(); break;

            case 'create_array': {
                const size = stack.pop();
                if (!Number.isInteger(size) || size < 0) {
                    siteLog(`Ошибка: некорректный размер массива "${instr.name}"`, true); return;
                }
                variables[instr.name] = new Array(size).fill(0);
                break;
            }

            case 'create_matrix': {
                const cols = stack.pop();
                const rows = stack.pop();
                if (!Number.isInteger(rows) || rows < 0 || !Number.isInteger(cols) || cols < 0) {
                    siteLog(`Ошибка: некорректные размеры матрицы "${instr.name}"`, true); return;
                }
                const matrix = [];
                for (let i = 0; i < rows; i++) {
                    matrix.push(new Array(cols).fill(0));
                }
                variables[instr.name] = matrix;
                break;
            }

            case 'set_array_from_literal': {
                const count = instr.count;
                const vals = [];
                for (let i = 0; i < count; i++) vals.unshift(stack.pop());
                if (!(instr.name in variables)) {
                    siteLog(`Ошибка: массив "${instr.name}" не объявлен. Используйте блок Create array`, true); return;
                }
                const existing = variables[instr.name];
                if (!Array.isArray(existing)) {
                    siteLog(`Ошибка: "${instr.name}" не является массивом`, true); return;
                }
                if (vals.length > existing.length) {
                    siteLog(`Ошибка: Некорректная длина массива ${instr.name}`, true); return;
                }

                const newArr = [...vals];
                while (newArr.length < existing.length) newArr.push(0);
                variables[instr.name] = newArr;
                break;
            }

            case 'array_literal': {
                const arr = [];
                for (let i = 0; i < instr.count; i++) arr.unshift(stack.pop());
                stack.push(arr);
                break;
            }

            case 'array_get': {
                const idx = stack.pop();
                const arr = stack.pop();
                if (!Array.isArray(arr)) { siteLog('Ошибка: не является массивом', true); return; }
                stack.push(arr[idx]); break;
            }
            case 'array_set': {
                const val = stack.pop();
                const idx = stack.pop();
                const arr = stack.pop();
                if (!Array.isArray(arr)) { siteLog('Ошибка: не является массивом', true); return; }
                if (!Number.isInteger(idx) || idx < 0) {
                    siteLog(`Ошибка: индекс массива "${instr.name}" должен быть неотрицательным целым числом (получено: ${idx})`, true); return;
                }
                if (idx >= arr.length) {
                    siteLog(`Ошибка: индекс ${idx} выходит за пределы массива "${instr.name}" (длина: ${arr.length}, допустимые индексы: 0–${arr.length - 1})`, true); return;
                }
                arr[idx] = val;
                variables[instr.name] = arr; break;
            }
            case 'matrix_get': {
                const idx2 = stack.pop();
                const idx1 = stack.pop();
                const mat = stack.pop();
                if (!Array.isArray(mat) || mat.length === 0 || !Array.isArray(mat[0])) {
                    siteLog('Ошибка: не является матрицей', true); return;
                }
                if (!Number.isInteger(idx1) || idx1 < 0 || !Number.isInteger(idx2) || idx2 < 0) {
                    siteLog(`Ошибка: индексы матрицы должны быть неотрицательными целыми числами`, true); return;
                }
                if (idx1 >= mat.length) {
                    siteLog(`Ошибка: индекс строки ${idx1} выходит за пределы матрицы (строк: ${mat.length})`, true); return;
                }
                if (idx2 >= mat[idx1].length) {
                    siteLog(`Ошибка: индекс столбца ${idx2} выходит за пределы матрицы (столбцов: ${mat[idx1].length})`, true); return;
                }
                stack.push(mat[idx1][idx2]); break;
            }
            case 'matrix_set': {
                const val = stack.pop();
                const idx2 = stack.pop();
                const idx1 = stack.pop();
                const mat = stack.pop();
                if (!Array.isArray(mat) || mat.length === 0 || !Array.isArray(mat[0])) {
                    siteLog('Ошибка: не является матрицей', true); return;
                }
                if (!Number.isInteger(idx1) || idx1 < 0 || !Number.isInteger(idx2) || idx2 < 0) {
                    siteLog(`Ошибка: индексы матрицы должны быть неотрицательными целыми числами`, true); return;
                }
                if (idx1 >= mat.length) {
                    siteLog(`Ошибка: индекс строки ${idx1} выходит за пределы матрицы (строк: ${mat.length})`, true); return;
                }
                if (idx2 >= mat[idx1].length) {
                    siteLog(`Ошибка: индекс столбца ${idx2} выходит за пределы матрицы (столбцов: ${mat[idx1].length})`, true); return;
                }
                mat[idx1][idx2] = val;
                variables[instr.name] = mat; break;
            }
            case 'matrix_size': {
                const mat = stack.pop();
                if (!Array.isArray(mat) || mat.length === 0 || !Array.isArray(mat[0])) {
                    siteLog('Ошибка: не является матрицей', true); return;
                }
                if (instr.dimension === 'cols') {
                    stack.push(mat[0].length);
                } else {
                    stack.push(mat.length);
                }
                break;
            }
            case 'array_length': {
                const arr = stack.pop();
                if (!Array.isArray(arr)) { siteLog('Ошибка: не является массивом', true); return; }
                stack.push(arr.length); break;
            }

            case 'negate': {
                const v = stack.pop(); stack.push(-v); break;
            }

            case 'call': {
                const args = [];
                for (let i = 0; i < instr.argc; i++) args.unshift(stack.pop());
                let result;
                switch (instr.name) {
                    case 'sqrt': result = Math.sqrt(args[0]); break;
                    case 'abs': result = Math.abs(args[0]); break;
                    case 'floor': result = Math.floor(args[0]); break;
                    case 'ceil': result = Math.ceil(args[0]); break;
                    case 'round': result = Math.round(args[0]); break;
                    case 'min': result = Math.min(...args); break;
                    case 'max': result = Math.max(...args); break;
                    case 'len': result = Array.isArray(args[0]) ? args[0].length : String(args[0]).length; break;
                    default:
                        siteLog(`Ошибка: неизвестная функция "${instr.name}"`, true); return;
                }
                stack.push(result); break;
            }

            case 'add': b = stack.pop(); a = stack.pop(); stack.push(a + b); break;
            case 'sub': b = stack.pop(); a = stack.pop(); stack.push(a - b); break;
            case 'multiply': b = stack.pop(); a = stack.pop(); stack.push(a * b); break;
            case 'division':
                b = stack.pop(); a = stack.pop();
                if (b === 0) { siteLog('Ошибка: деление на ноль', true); return; }
                stack.push(a / b); break;
            case 'power': b = stack.pop(); a = stack.pop(); stack.push(Math.pow(a, b)); break;
            case 'mod':
                b = stack.pop(); a = stack.pop();
                if (b === 0) { siteLog('Ошибка: деление на ноль (mod)', true); return; }
                stack.push(a % b); break;

            case 'less': b = stack.pop(); a = stack.pop(); stack.push(a < b);  break;
            case 'more': b = stack.pop(); a = stack.pop(); stack.push(a > b);  break;
            case 'equal': b = stack.pop(); a = stack.pop(); stack.push(a == b); break;
            case 'not equal': b = stack.pop(); a = stack.pop(); stack.push(a != b); break;
            case 'less or equal': b = stack.pop(); a = stack.pop(); stack.push(a <= b); break;
            case 'more or equal': b = stack.pop(); a = stack.pop(); stack.push(a >= b); break;

            case 'print': {
                const val = stack.pop();
                siteLog(Array.isArray(val) ? JSON.stringify(val) : String(val));
                break;
            }
        }

        ip++;
    }
}

function main() {
    const consoleBody = document.getElementById('console-body');
    if (consoleBody) consoleBody.innerHTML = '';
    openConsole();

    const hasBegin = droppedBlocks.some(b => blockKind(b) === 'Begin');
    const hasEnd = droppedBlocks.some(b => blockKind(b) === 'End');
    if (!hasBegin) { siteLog('Ошибка: отсутствует блок Begin', true); return; }
    if (!hasEnd) { siteLog('Ошибка: отсутствует блок End', true);   return; }

    const blockList = collectBlocks();
    if (!blockList) { siteLog('Ошибка: цепочка блоков не начинается с Begin', true); return; }

    const { body, error } = buildAST(blockList, 0);
    if (error) { siteLog('Ошибка: ' + error, true); return; }

    const instructions = [];
    compileProgram(body, instructions);
    run(instructions);
}