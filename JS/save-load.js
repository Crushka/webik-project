function saveBlocks() {
    if (droppedBlocks.length === 0) {
        alert('Нет блоков для сохранения!');
        return;
    }

    const blocksData = droppedBlocks.map(blockEl => {
        const kind = blockEl.querySelector('img')?.alt || '';
        const position = {
            left: parseFloat(blockEl.style.left) || 0,
            top: parseFloat(blockEl.style.top) || 0,
        };

        const fields = {};
        blockEl.querySelectorAll('[data-field]').forEach(field => {
            const fieldName = field.getAttribute('data-field');
            if (field.tagName === 'SELECT') {
                fields[fieldName] = field.value;
            } else {
                fields[fieldName] = field.value;
            }
        });

        const originalBlock = document.querySelector(
            `#sidebar-scroll .block-wrapper img[alt="${kind}"]`
        )?.closest('.block-wrapper');
        const blockId = originalBlock ? originalBlock.id : '';

        return {
            kind,
            blockId,
            type: blockEl.getAttribute('data-block-type'),
            position,
            fields,
        };
    });

    const linksData = [];
    droppedBlocks.forEach((blockEl, index) => {
        const lnk = links.get(blockEl);
        if (lnk && lnk.next) {
            const nextIndex = droppedBlocks.indexOf(lnk.next);
            if (nextIndex !== -1) {
                linksData.push({
                    from: index,
                    to: nextIndex,
                });
            }
        }
    });

    const saveData = {
        blocks: blocksData,
        links: linksData,
        timestamp: new Date().toISOString(),
    };

    const jsonString = JSON.stringify(saveData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `codeblock_save_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function loadBlocks(file) {
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const saveData = JSON.parse(e.target.result);

            deleteAllBlocks();

            const newBlocksMap = {};

            saveData.blocks.forEach((blockData, index) => {
                let originalBlock = null;
                
                if (blockData.blockId) {
                    originalBlock = document.getElementById(blockData.blockId);
                }
                
                if (!originalBlock) {
                    originalBlock = document.querySelector(
                        `#sidebar-scroll .block-wrapper img[alt="${blockData.kind}"]`
                    )?.closest('.block-wrapper');
                }

                if (!originalBlock) {
                    return;
                }

                const newBlock = originalBlock.cloneNode(true);
                newBlock.classList.add('dropped-block');
                newBlock.style.position = 'absolute';
                newBlock.style.left = blockData.position.left + 'px';
                newBlock.style.top = blockData.position.top + 'px';
                newBlock.style.width = '18vw';
                newBlock.style.zIndex = '2';

                Object.entries(blockData.fields).forEach(([fieldName, value]) => {
                    const field = newBlock.querySelector(`[data-field="${fieldName}"]`);
                    if (field) {
                        if (field.tagName === 'SELECT') {
                            field.value = value;
                        } else {
                            field.value = value;
                        }
                    }
                });

                canvas.appendChild(newBlock);
                ensureLink(newBlock);
                droppedBlocks.push(newBlock);

                newBlock.addEventListener('mousedown', onCanvasMousedown);
                newBlock.addEventListener('dblclick', removeBlock);

                newBlocksMap[index] = newBlock;
            });

            saveData.links.forEach(linkData => {
                const fromBlock = newBlocksMap[linkData.from];
                const toBlock = newBlocksMap[linkData.to];

                if (fromBlock && toBlock) {
                    links.get(fromBlock).next = toBlock;
                    links.get(toBlock).prev = fromBlock;
                }
            });

            alert('Блоки успешно загружены!');
        } catch (error) {
            alert('Ошибка при загрузке файла: ' + error.message);
        }
    };

    reader.readAsText(file);
}

function openFileDialog() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';

    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            loadBlocks(file);
        }
    };

    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}