function main() {
    let program = {
        type: "program",
        body: [
            {
                type: "set",
                name: "x",
                value: {
                    type: "add",
                    left: {type: "number", value: 10},
                    right: {type: "number", value: 3}
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
    console.log("Compiled Instructions:", instructions);
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
                let b = stack.pop();
                let a = stack.pop();
                stack.push(a + b);
                break;
            case "print":
                console.log(stack.pop());
                break;
        }

        ip++;
    }
}