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
                name: "x",
                value: {
                    type: "sub",
                    left: {
                        type: "division",
                        left: {type: "number", value: 6},
                        right: {type: "number", value: 2}
                    },
                    right: {type: "number", value: 2}
                }
            },
            {
                type: "print",
                value: {type: "variable", name: "x"}
            }
        ]
    };

    let instructions = [];

    compileProgram(program, instructions);
    run(instructions);
}

function compileProgram(node, instructions) {
    node.body.forEach(statement => 
        compileStatement(statement, instructions)
    );
}

function compileExpression(node, instructions) {
    switch (node.type) {
        case "number":
            instructions.push({type: "push", value: node.value});
            break;
        case "variable":
            instructions.push({type: "load", name: node.name});
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
            case "push":
                stack.push(instr.value);
                break;
            case "load":
                stack.push(variables[instr.name]);
                break;
            case "store":
                variables[instr.name] = stack.pop();
                break;
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
            case "print":
                siteLog(stack.pop());
                break;
        }

        ip++;
    }
}