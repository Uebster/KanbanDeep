import { getCurrentUser } from './auth.js';
import { 
    getUserProfile, saveUserProfile,
    getFullBoardData,
    getCard, 
    saveCard, 
    getColumn, 
    saveColumn, 
    getBoard, 
    saveBoard, 
    getGroup, // <-- CORREÇÃO: Adiciona a importação que faltava
    saveGroup, // <-- CORREÇÃO: Adiciona a importação que faltava
    deleteBoard, // <-- CORREÇÃO: Adiciona a importação que faltava
    deleteCard, 
    hardDeleteColumn,
    hardDeleteBoard,  // <-- Usar a nova função
    getAllUsers,
    universalLoad
} from './storage.js';
import { showConfirmationDialog, showFloatingMessage, showDialogMessage } from './ui-controls.js';
import { t, initTranslations } from './translations.js';

let currentUser = null;
let allUsers = [];
let allArchivedItems = { cards: [], columns: [], boards: [] };

export async function initArchivePage() {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.href = 'list-users.html';
        return;
    }

    await initTranslations();

    allUsers = await getAllUsers();
    await loadAllArchivedItems();
    renderAllLists();
    setupEventListeners();
}

async function loadAllArchivedItems() {
    allArchivedItems = { cards: [], columns: [], boards: [] };
    const allFileNames = await window.electronAPI.listFiles();
    
    const itemKeys = {
        cards: allFileNames.filter(name => name.startsWith('card_')),
        columns: allFileNames.filter(name => name.startsWith('column_')),
        boards: allFileNames.filter(name => name.startsWith('board_'))
    };

    const loadItems = async (keys) => {
        return (await Promise.all(keys.map(key => universalLoad(key)))).filter(item => item && item.isArchived);
    };

    allArchivedItems.cards = await loadItems(itemKeys.cards);
    allArchivedItems.columns = await loadItems(itemKeys.columns);
    allArchivedItems.boards = await loadItems(itemKeys.boards);
}

async function renderAllLists() {
    const lists = {
        archivedBoards: document.getElementById('archived-boards-list'),
        archivedCards: document.getElementById('archived-cards-list'),
        archivedColumns: document.getElementById('archived-columns-list'),
        trashBoards: document.getElementById('trash-boards-list'),
        trashCards: document.getElementById('trash-cards-list'),
        trashColumns: document.getElementById('trash-columns-list'),
    };

    for (const key in lists) {
        if(lists[key]) lists[key].innerHTML = '';
    }

    const filterAndRender = async (type, items) => {
        const typeCap = type.charAt(0).toUpperCase() + type.slice(1);
        const archivedContainer = lists[`archived${typeCap}s`];
        const trashContainer = lists[`trash${typeCap}s`];

        for (const item of items) {
            const element = await createItemElement(item, type);
            if (item.archiveReason === 'deleted') {
                if(trashContainer) trashContainer.appendChild(element);
            } else {
                if(archivedContainer) archivedContainer.appendChild(element);
            }
        }
    };

    await filterAndRender('board', allArchivedItems.boards);
    await filterAndRender('column', allArchivedItems.columns);
    await filterAndRender('card', allArchivedItems.cards);
}


async function createItemElement(item, type) {
    const itemEl = document.createElement('div');
    itemEl.className = 'archive-item';
    itemEl.dataset.itemId = item.id;

    const archivedAt = new Date(item.archivedAt || Date.now()).toLocaleString();
    const archivedBy = (allUsers.find(u => u.id === item.archivedBy) || { name: 'Unknown' }).name;
    
    let metaText = '';
    const boardName = item.boardTitle || (item.boardId ? (await getBoard(item.boardId))?.title : null) || t('archive.unknownBoard');

    if (type === 'card') {
        const columnName = item.columnTitle || (item.columnId ? (await getColumn(item.columnId))?.title : null) || t('archive.unknownColumn');
        metaText = t('archive.meta.card', { boardName, columnName, date: archivedAt, user: archivedBy });
    } else if (type === 'column') {
        metaText = t('archive.meta.column', { boardName, date: archivedAt, user: archivedBy });
    } else if (type === 'board') {
        metaText = t('archive.meta.board', { date: archivedAt, user: archivedBy });
    }

    const isTrash = item.archiveReason === 'deleted';
    let actionsHtml = `<button class="btn restore-btn">${t('archive.buttons.restore')}</button>`;
    if (isTrash) {
        actionsHtml += `<button class="btn danger delete-btn">${t('archive.buttons.delete')}</button>`;
    } else {
        actionsHtml += `<button class="btn alternative1 move-to-trash-btn">${t('archive.buttons.moveToTrash')}</button>`;
    }

    itemEl.innerHTML = `
        <div class="item-details">
            <p class="item-title">${item.title}</p>
            <p class="item-meta">${metaText}</p>
        </div>
        <div class="item-actions">${actionsHtml}</div>
    `;

    itemEl.querySelector('.restore-btn').addEventListener('click', () => {
        if (type === 'card') handleRestoreCard(item.id);
        if (type === 'column') handleRestoreColumn(item.id);
        if (type === 'board') handleRestoreBoard(item.id);
    });

    if (isTrash) {
        itemEl.querySelector('.delete-btn').addEventListener('click', () => {
            if (type === 'card') handleDeleteCard(item.id);
            if (type === 'column') handleDeleteColumn(item.id);
            if (type === 'board') handleDeleteBoard(item.id);
        });
    } else {
        itemEl.querySelector('.move-to-trash-btn').addEventListener('click', () => handleMoveToTrash(item.id, type));
    }
    return itemEl;
}

// --- INTELLIGENT RESTORE LOGIC ---

/**
 * ETAPA 3: Restauração Inteligente de Coluna
 * Verifica o estado do quadro pai e oferece opções de restauração contextual.
 */
async function handleRestoreColumn(columnId) {
    const column = await getColumn(columnId);
    if (!column) {
        showFloatingMessage(t('archive.feedback.itemNotFound'), 'error');
        return;
    }

    // Se a coluna estiver na lixeira, a restauração a moverá diretamente para o Kanban,
    // então não precisamos da etapa intermediária de "mover para arquivados".
    // A lógica abaixo já lida com todos os cenários.
    
    // Ação 1: Se estiver na lixeira, move para os arquivos primeiro.
    if (column.archiveReason === 'deleted') {
        delete column.archiveReason;
        await saveColumn(column);
        showFloatingMessage(t('archive.feedback.restoredFromTrash'), 'success');
        await loadAllArchivedItems();
        renderAllLists();
        return;
    }

    // Ação 2: Tenta restaurar para o quadro original.
    const originalBoard = await getBoard(column.boardId); // Busca o quadro pai

    // Cenário 1: O quadro pai existe e está ativo.
    if (originalBoard && !originalBoard.isArchived) {
        showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
            column.isArchived = false;
            delete column.archivedAt;
            delete column.archivedBy;
            // Garante que a coluna seja adicionada de volta à lista de colunas ativas do quadro.
            if (!originalBoard.columnIds) originalBoard.columnIds = [];
            if (!originalBoard.columnIds.includes(column.id)) originalBoard.columnIds.push(column.id);
            
            await saveColumn(column);
            await saveBoard(originalBoard);

            showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        });
    // Cenário 2: O quadro pai existe, mas está no arquivo ou na lixeira.
    } else if (originalBoard && originalBoard.isArchived) {
        const location = originalBoard.archiveReason === 'deleted' ? t('archive.tabs.trash') : t('archive.tabs.archived');
        showConfirmationDialog(
            t('archive.confirm.restoreParent', { itemName: originalBoard.title, location: location }),
            async (dialog) => {
                // Restaura o quadro pai primeiro
                originalBoard.isArchived = false;
                delete originalBoard.archiveReason; delete originalBoard.archivedAt; delete originalBoard.archivedBy;
                // Adiciona a referência do quadro de volta à sua origem
                const ownerProfile = await getUserProfile(originalBoard.ownerId);
                if (originalBoard.groupId) {
                    const group = await getGroup(originalBoard.groupId);
                    if (group && !group.boardIds.includes(originalBoard.id)) group.boardIds.push(originalBoard.id);
                    await saveGroup(group);
                } else if (ownerProfile && !ownerProfile.boardIds.includes(originalBoard.id)) {
                    ownerProfile.boardIds.push(originalBoard.id);
                    await saveUserProfile(ownerProfile);
                }
                // Restaura a coluna e a adiciona ao quadro pai
                column.isArchived = false;

                // Adiciona log de restauração
                if (!column.activityLog) column.activityLog = [];
                column.activityLog.push({
                    action: 'restored',
                    userId: currentUser.id,
                    timestamp: new Date().toISOString(),
                    from: location
                });

                delete column.archiveReason; delete column.archivedAt; delete column.archivedBy;
                if (!originalBoard.columnIds) originalBoard.columnIds = [];
                if (!originalBoard.columnIds.includes(column.id)) originalBoard.columnIds.push(column.id);
                
                await saveBoard(originalBoard);
                await saveColumn(column);

                showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
                await loadAllArchivedItems(); renderAllLists();
                return true;
            }
        );
    // Cenário 3: O quadro pai foi excluído permanentemente.
    } else {
        // Cenário 2: O quadro pai foi excluído permanentemente (não existe mais).
        const boardTitleForRestore = column.boardTitle || t('archive.unknownBoard');
        showConfirmationDialog(
            t('archive.confirm.restoreToNewBoard', { boardName: boardTitleForRestore }),
            async (dialog) => {
                // Cria um novo quadro para abrigar a coluna.
                const newBoard = await saveBoard({
                    title: t('archive.restoredBoardName', { oldName: boardTitleForRestore }),
                    ownerId: currentUser.id,
                    columnIds: [column.id]
                });

                column.isArchived = false;
                delete column.archiveReason;
                delete column.archivedAt; delete column.archivedBy;
                column.boardId = newBoard.id;
                await saveColumn(column);

                showDialogMessage(dialog, t('archive.feedback.restoredToNewBoard'), 'success');
                await loadAllArchivedItems();
                renderAllLists();
                return true;
            }
        );
    }
}

/**
 * ETAPA 3: Restauração Inteligente de Cartão
 * Verifica o estado dos pais (coluna e quadro) e oferece opções de restauração contextual.
 */
async function handleRestoreCard(cardId) {
    const card = await getCard(cardId);
    if (!card) return showFloatingMessage(t('archive.feedback.itemNotFound'), 'error');

    // Ação 2: Tenta encontrar os pais originais.
    const originalBoard = await getBoard(card.boardId);
    const originalColumn = await getColumn(card.columnId);

    // Função auxiliar para restaurar o cartão em uma coluna de destino.
    const restoreCardToColumn = async (targetColumnId, targetBoardId) => {
        card.isArchived = false;

        // Adiciona log de restauração
        const fromLocation = card.archiveReason === 'deleted' ? t('archive.tabs.trash') : t('archive.tabs.archived');
        if (!card.activityLog) card.activityLog = [];
        card.activityLog.push({
            action: 'restored',
            userId: currentUser.id,
            timestamp: new Date().toISOString(),
            from: fromLocation
        });

        delete card.archiveReason; delete card.archivedAt; delete card.archivedBy;
        card.columnId = targetColumnId;
        card.boardId = targetBoardId;
        
        const targetColumn = await getColumn(targetColumnId);
        if (targetColumn) {
            if (!targetColumn.cardIds) targetColumn.cardIds = [];
            if (!targetColumn.cardIds.includes(card.id)) targetColumn.cardIds.push(card.id);
            await saveColumn(targetColumn);
        }
        await saveCard(card);
    };

    // Cenário 1: A coluna e o quadro originais existem e estão ativos.
    if (originalBoard && !originalBoard.isArchived && originalColumn && !originalColumn.isArchived) {
        showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
            await restoreCardToColumn(originalColumn.id, originalBoard.id);
            showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
            await loadAllArchivedItems(); renderAllLists();
            return true;
        });
        return;
    }

    // Cenário 2: O pai (coluna) existe, mas está no arquivo ou na lixeira.
    if (originalColumn && originalColumn.isArchived) {
        const location = originalColumn.archiveReason === 'deleted' ? t('archive.tabs.trash') : t('archive.tabs.archived');
        showConfirmationDialog(
            t('archive.confirm.restoreParent', { itemName: originalColumn.title, location: location }),
            async (dialog) => {
                // CORREÇÃO: Restaura a coluna e o cartão em uma única operação.
                // 1. Restaura a coluna pai. A função handleRestoreColumn já é inteligente o suficiente
                //    para lidar com a restauração do quadro, se necessário.
                await handleRestoreColumn(originalColumn.id);

                // 2. Após a coluna (e potencialmente o quadro) ser restaurada,
                //    buscamos os dados mais recentes para restaurar o cartão.
                const restoredColumn = await getColumn(originalColumn.id);
                const restoredBoard = await getBoard(restoredColumn.boardId);
                
                // 3. Executa a restauração final do cartão, que agora está em um estado "ativo".
                await restoreCardToColumn(restoredColumn.id, restoredBoard.id);

                showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
                await loadAllArchivedItems();
                renderAllLists();
                return true;
            }
        );
        return;
    }

    // Cenário 2: O quadro original foi excluído permanentemente.
    if (!originalBoard || originalBoard.isArchived) {
        showConfirmationDialog(t('archive.confirm.restoreToNewBoardAndColumn'), async (dialog) => {
            const boardTitle = t('archive.restoredBoardName', { oldName: card.boardTitle || t('archive.unknownBoard') });
            const columnTitle = card.columnTitle || t('archive.restoredColumnName');

            const newBoard = await saveBoard({ title: boardTitle, ownerId: currentUser.id, columnIds: [] });
            const newColumn = await saveColumn({ title: columnTitle, boardId: newBoard.id, cardIds: [] });
            
            newBoard.columnIds.push(newColumn.id);
            await saveBoard(newBoard);

            await restoreCardToColumn(newColumn.id, newBoard.id);
            showDialogMessage(dialog, t('archive.feedback.restoredToNewBoard'), 'success'); // Mensagem genérica de sucesso
            await loadAllArchivedItems(); renderAllLists();
            return true;
        });
        return;
    }

    // Cenário 3: O quadro original existe, mas a coluna original não (ou está arquivada).
    const boardColumns = (await getFullBoardData(originalBoard.id)).columns.filter(c => !c.isArchived);

    // Cenário 3a: O quadro não tem nenhuma coluna ativa.
    if (boardColumns.length === 0) {
        showConfirmationDialog(t('archive.confirm.restoreToNewColumn', { boardName: originalBoard.title }), async (dialog) => {
            const newColumn = await saveColumn({ title: t('archive.restoredColumnName'), boardId: originalBoard.id, cardIds: [] });
            originalBoard.columnIds.push(newColumn.id);
            await saveBoard(originalBoard);
            await restoreCardToColumn(newColumn.id, originalBoard.id);
            showDialogMessage(dialog, t('archive.feedback.restoredToNewColumn'), 'success');
            await loadAllArchivedItems(); renderAllLists();
            return true;
        });
        return;
    }

    // Cenário 3b: O quadro tem colunas ativas, então oferece para restaurar na primeira.
    if (boardColumns.length > 0) {
        const firstColumn = boardColumns[0];
        showConfirmationDialog(t('archive.confirm.restoreToFirstColumn', { boardName: originalBoard.title }), async (dialog) => {
            await restoreCardToColumn(firstColumn.id, originalBoard.id);
            showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
            await loadAllArchivedItems(); renderAllLists();
            return true;
        });
        return;
    }
}

/**
 * ETAPA 3: Restauração de Quadro
 * A restauração de um quadro é simples, pois ele não tem pais.
 */
async function handleRestoreBoard(boardId) {
    const board = await getBoard(boardId);
    if (!board) return showFloatingMessage(t('archive.feedback.itemNotFound'), 'error');

    if (board.archiveReason === 'deleted') {
        delete board.archiveReason;
        await saveBoard(board);
        showFloatingMessage(t('archive.feedback.restoredFromTrash'), 'success');
        await loadAllArchivedItems();
        renderAllLists();
        return;
    }

    showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
        const userProfile = await getUserProfile(currentUser.id);
        const group = board.groupId ? await getGroup(board.groupId) : null;

        // Remove o status de arquivado do quadro.
        board.isArchived = false;
        delete board.archivedAt; delete board.archivedBy;
        
        // Adiciona a referência de volta à sua origem (grupo ou perfil pessoal).
        if (group) {
            if (!group.boardIds) group.boardIds = [];
            if (!group.boardIds.includes(boardId)) group.boardIds.push(boardId);
            await saveGroup(group);
        } else if (userProfile) {
            if (!userProfile.boardIds) userProfile.boardIds = [];
            if (!userProfile.boardIds.includes(boardId)) userProfile.boardIds.push(boardId);
            await saveUserProfile(userProfile);
        }
        
        await saveBoard(board);

        showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
        await loadAllArchivedItems(); renderAllLists();
        return true;
    });
}

// --- OTHER FUNCTIONS (UNCHANGED) ---

async function handleMoveToTrash(itemId, type) {
    let item;
    if (type === 'card') item = await getCard(itemId);
    else if (type === 'column') item = await getColumn(itemId);
    else if (type === 'board') item = await getBoard(itemId);

    if (!item) return;

    item.archiveReason = 'deleted';
    if (type === 'card') await saveCard(item);
    if (type === 'column') await saveColumn(item);
    else if (type === 'board') await saveBoard(item);

    showFloatingMessage(t('archive.feedback.movedToTrash'), 'info');
    await loadAllArchivedItems();
    renderAllLists();
}

async function handleDeleteCard(cardId) {
    showConfirmationDialog(t('archive.confirm.delete'), async (dialog) => {
        if (await deleteCard(cardId)) {
            showDialogMessage(dialog, t('archive.feedback.deleted'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        }
        return false;
    }, null, t('ui.yesDelete'));
}

async function handleDeleteColumn(columnId) {
    showConfirmationDialog(t('archive.confirm.delete'), async (dialog) => {
        // CORREÇÃO: Usa deleteColumn para apagar apenas a coluna, não seus filhos.
        // hardDeleteColumn é reservado para a função "Esvaziar Lixeira".
        if (await deleteColumn(columnId)) {
            showDialogMessage(dialog, t('archive.feedback.deleted'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        }
        return false;
    }, null, t('ui.yesDelete'));
}

async function handleDeleteBoard(boardId) {
    showConfirmationDialog(t('archive.confirm.delete'), async (dialog) => {
        // CORREÇÃO: Usa deleteBoard para apagar apenas o quadro, não seus filhos.
        // hardDeleteBoard é reservado para a função "Esvaziar Lixeira".
        if (await deleteBoard(boardId)) {
            showDialogMessage(dialog, t('archive.feedback.deleted'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
        }
        return true;
    }, null, t('ui.yesDelete'));
}

function setupEventListeners() {
    document.querySelectorAll('.showcase-navbar .nav-item').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.showcase-navbar .nav-item').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.getElementById(e.currentTarget.dataset.tab).classList.add('active');
        });
    });

    document.getElementById('empty-trash-btn')?.addEventListener('click', handleEmptyTrash);
}

async function handleEmptyTrash() {
    const trashItems = [
        ...allArchivedItems.cards.filter(c => c.archiveReason === 'deleted'),
        ...allArchivedItems.columns.filter(c => c.archiveReason === 'deleted'),
        ...allArchivedItems.boards.filter(b => b.archiveReason === 'deleted')
    ];

    if (trashItems.length === 0) {
        showFloatingMessage(t('archive.feedback.trashEmpty'), 'info');
        return;
    }
    showConfirmationDialog(
        t('archive.confirm.emptyTrash', { count: trashItems.length }),
        async (dialog) => {
            // CORREÇÃO FINAL: Lógica simplificada e direta para esvaziar a lixeira.
            // Itera sobre todos os itens e chama a função de exclusão apropriada.
            // A inteligência de cascata está nas funções `hardDelete`.
            await Promise.all(trashItems.map(item => {
                if (item.id.startsWith('board_')) return hardDeleteBoard(item.id);
                if (item.id.startsWith('column_')) return hardDeleteColumn(item.id);
                if (item.id.startsWith('card_')) return deleteCard(item.id);
            }));

            showDialogMessage(dialog, t('archive.feedback.trashEmptied'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        },
        null,
        t('ui.yesDelete')
    );
}