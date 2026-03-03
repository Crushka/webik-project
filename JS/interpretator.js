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
    if (wrapper && !wrapper.classList.contains('open')) {
        wrapper.classList.add('open');
    }
}

function toggleConsole() {
    const wrapper = document.getElementById('console-wrapper');
    if (!wrapper) return;
    wrapper.classList.toggle('open');
}

function main() {
    const consoleBody = document.getElementById('console-body');
    if (consoleBody) consoleBody.innerHTML = '';
    openConsole();

    let program = {
        type: "program",
        body: [
            {
                type: "set",
                name: "arr",
                value: {
                    type: "array",
                    elements: [
                        { type: "number", value: 5 },
                        { type: "number", value: 2 },
                        { type: "number", value: 8 }
                    ]
                }
            },
            {
                type: "print",
                value: {
                    type: "array_get",
                    array: "arr",
                    index: { type: "number", value: 1 }
                }
            }
        ]
    };

    let instructions = [];

    compileProgram(program, instructions);
    run(instructions);
}

function compileProgram(node, instructions) {
        for (let i = 0; i < node.body.length; i++) {
        let current = node.body[i];

        if (current.type === "if") {
            compileExpression(current.condition, instructions);

            let jumpIfFalseIndex = instructions.length;
            instructions.push({ type: "jump_if_false", address: null });

            current.body.forEach(stmt =>
                compileStatement(stmt, instructions)
            );
            let next = node.body[i + 1];
            if (next && next.type === "else") {
                let jumpIndex = instructions.length;
                instructions.push({ type: "jump", address: null });
                instructions[jumpIfFalseIndex].address = instructions.length;

                next.body.forEach(stmt =>
                    compileStatement(stmt, instructions)
                );
                instructions[jumpIndex].address = instructions.length;
                i++;
            } else {
                instructions[jumpIfFalseIndex].address = instructions.length;
            }

        } else if (current.type === "else") {
            siteLog("Ошибка: else без if", true);
        } else {
            compileStatement(current, instructions);
        }
    }
}

function compileExpression(node, instructions) {
    switch (node.type) {
        case "number":
            instructions.push({type: "push", value: node.value});
            break;
        case "variable":
            instructions.push({type: "load", name: node.name});
            break;
        case "array":
            node.elements.forEach(el =>
                compileExpression(el, instructions)
            );
            instructions.push({type: "array_create", count: node.elements.length});
            break;
        case "array_get":
            instructions.push({ type: "load", name: node.array });
            compileExpression(node.index, instructions);
            instructions.push({ type: "array_get" });
            break;
        case "array_set":
            instructions.push({ type: "load", name: node.array });
            compileExpression(node.index, instructions);
            compileExpression(node.value, instructions);
            instructions.push({
                type: "array_set",
                name: node.array
            });
            break;
        case "array_length":
            instructions.push({ type: "load", name: node.array });
            instructions.push({ type: "array_length" });
            break;
        case "add":
            compileExpression(node.left, instructions);
            compileExpression(node.right, instructions);                
            instructions.push({type: "add"});
            break;
        case "sub":
            compileExpression(node.left, instructions);
            compileExpression(node.right, instructions);
            instructions.push({type: "sub"});
            break;
        case "multiply":
            compileExpression(node.left, instructions);
            compileExpression(node.right, instructions);
            instructions.push({type: "multiply"});
            break;
        case "division":
            compileExpression(node.left, instructions);
            compileExpression(node.right, instructions);
            instructions.push({type: "division"});
            break;

        case "less":
            compileExpression(node.left, instructions);
            compileExpression(node.right, instructions);
            instructions.push({type: "less"});
            break;
        case "more":
            compileExpression(node.left, instructions);
            compileExpression(node.right, instructions);
            instructions.push({type: "more"});
            break;
        case "equal":
            compileExpression(node.left, instructions);
            compileExpression(node.right, instructions);
            instructions.push({type: "equal"});
            break;
        case "less or equal":
            compileExpression(node.left, instructions);
            compileExpression(node.right, instructions);
            instructions.push({type: "less or equal"});
            break;
        case "more or equal":
            compileExpression(node.left, instructions);
            compileExpression(node.right, instructions);
            instructions.push({type: "more or equal"});
            break;
    }
}

function compileStatement(node, instructions) {
    switch (node.type) {
        case "set":
            compileExpression(node.value, instructions);
            instructions.push({type: "store", name: node.name});
            break;
        case "print":
            compileExpression(node.value, instructions);
            instructions.push({type: "print"});
            break;
    }
}

function run(instructions) {
    let stack = [];
    let variables = {};
    let ip = 0;

    while (ip < instructions.length) {
        let instr = instructions[ip];
        let b, a;
        switch (instr.type) {
            case "jump":
                ip = instr.address;
                continue;

            case "jump_if_false":
                let condition = stack.pop();
                if (!condition) {
                    ip = instr.address;
                    continue;
                }
                break;

            case "push":
                stack.push(instr.value);
                break;
            case "load":
                stack.push(variables[instr.name]);
                break;
            case "store":
                variables[instr.name] = stack.pop();
                break;

            // МАССИВЫ
            case "array_create":
                let newArray = [];
                for (let i = 0; i < instr.count; i++) {
                    newArray.unshift(stack.pop());
                }
                stack.push(newArray);
                break;
            case "array_get":
                let index = stack.pop();
                let array = stack.pop();
                stack.push(array[index]);
                break;
            case "array_set":
                let value = stack.pop();
                let idx = stack.pop();
                let arr = stack.pop();
                arr[idx] = value;
                variables[instr.name] = arr;
                break;
            case "array_length":
                let a = stack.pop();
                stack.push(a.length);
                break;

            // АРИФМЕТИЧЕСКИЕ ОПЕРАЦИИ
            case "add":
                b = stack.pop();
                a = stack.pop();
                stack.push(a + b);
                break;
            case "sub":
                b = stack.pop();
                a = stack.pop();
                stack.push(a - b);
                break;
            case "multiply":
                b = stack.pop();
                a = stack.pop();
                stack.push(a * b);
                break;
            case "division":
                b = stack.pop();
                a = stack.pop();
                stack.push(a / b);
                break;

            // ОПЕРАТОРЫ СРАВНЕНИЯ
            case "less":
                b = stack.pop();
                a = stack.pop();
                stack.push(a < b);
                break;
            case "more":
                b = stack.pop();
                a = stack.pop();
                stack.push(a > b);
                break;
            case "equal":
                b = stack.pop();
                a = stack.pop();
                stack.push(a == b);
                break;
            case "less or equal":
                b = stack.pop();
                a = stack.pop();
                stack.push(a <= b);
                break;
            case "more or equal":
                b = stack.pop();
                a = stack.pop();
                stack.push(a >= b);
                break;
                
            case "print":
                siteLog(stack.pop());
                break;
        }

        ip++;
    }
}