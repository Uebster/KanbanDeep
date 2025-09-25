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
    getAllUsers, deleteColumn, deleteItem,
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
        // Na lixeira, temos duas ações: Mover para Arquivados e Restaurar direto.
        actionsHtml = `<button class="btn move-to-archived-btn">${t('archive.buttons.moveToArchived')}</button>
                       <button class="btn confirm restore-btn">${t('archive.buttons.restore')}</button>
                       <button class="btn danger delete-btn">${t('archive.buttons.delete')}</button>`;
    } else {
        // Nos arquivados, o botão é "Restaurar" e "Mover para Lixeira".
        actionsHtml += `<button class="btn alternative1 move-to-trash-btn">${t('archive.buttons.moveToTrash')}</button>`;
    }

    itemEl.innerHTML = `
        <div class="item-details">
            <p class="item-title">${item.title}</p>
            <p class="item-meta">${metaText}</p>
        </div>
        <div class="item-actions">${actionsHtml}</div>
    `;

    // O botão de restaurar sempre aciona a restauração inteligente.
    itemEl.querySelector('.restore-btn').addEventListener('click', () => {
        if (type === 'card') handleRestoreCard(item.id);
        if (type === 'column') handleRestoreColumn(item.id);
        if (type === 'board') handleRestoreBoard(item.id);
    });

    if (isTrash) {
        itemEl.querySelector('.move-to-archived-btn').addEventListener('click', () => handleMoveToArchived(item.id, type));
        itemEl.querySelector('.delete-btn').addEventListener('click', () => {
            if (type === 'card') handleDeleteCard(item.id);
            if (type === 'column') handleDeleteColumn(item.id);
            if (type === 'board') handleDeleteBoard(item.id);
        });
    } else {
        // Botão "Mover para Lixeira"
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

    showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
        await intelligentRestoreColumn(column.id, dialog);
    });
}

/**
 * ETAPA 3: Restauração Inteligente de Cartão
 * Verifica o estado dos pais (coluna e quadro) e oferece opções de restauração contextual.
 */
async function handleRestoreCard(cardId) {
    const card = await getCard(cardId);
    if (!card) return showFloatingMessage(t('archive.feedback.itemNotFound'), 'error');

    showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
        await intelligentRestoreCard(card.id, dialog);
    });
}

/**
 * Função central para a restauração inteligente de uma coluna.
 * @param {string} columnId - O ID da coluna a ser restaurada.
 * @param {HTMLElement} dialog - O diálogo de confirmação original.
 * @returns {Promise<boolean>} - True se a restauração foi bem-sucedida.
 */
async function intelligentRestoreColumn(columnId, dialog) {
    const column = await getColumn(columnId);
    if (!column) {
        showDialogMessage(dialog, t('archive.feedback.itemNotFound'), 'error');
        return false;
    }

    const originalBoard = await getBoard(column.boardId);

    // Cenário 1: O quadro pai existe e está ativo.
    if (originalBoard && !originalBoard.isArchived) {
        column.isArchived = false;
        const fromLocation = column.archiveReason === 'deleted' ? t('archive.tabs.trash') : t('archive.tabs.archived');
        delete column.archiveReason; delete column.archivedAt; delete column.archivedBy;
        if (!originalBoard.columnIds) originalBoard.columnIds = [];
        if (!originalBoard.columnIds.includes(column.id)) originalBoard.columnIds.push(column.id);
        await saveColumn(column);
        await saveBoard(originalBoard);
        showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
        await loadAllArchivedItems(); renderAllLists();
        return true;
    }

    // Cenário 2: O quadro pai existe, mas está no arquivo/lixeira.
    if (originalBoard && originalBoard.isArchived) {
        const location = originalBoard.archiveReason === 'deleted' ? t('archive.tabs.trash') : t('archive.tabs.archived');
        showConfirmationDialog(
            t('archive.confirm.restoreParent', { itemName: originalBoard.title, location: location }),
            async (parentDialog) => {
                const boardRestored = await intelligentRestoreBoard(originalBoard.id, parentDialog, false);
                if (boardRestored) {
                    // Agora que o quadro foi restaurado, restaura a coluna.
                    await intelligentRestoreColumn(column.id, parentDialog);
                    return true;
                }
                return false;
            }
        );
        dialog.close();
        return false;
    }

    // Cenário 3: O quadro pai foi excluído permanentemente.
    const boardTitleForRestore = column.boardTitle || t('archive.unknownBoard');
    showConfirmationDialog(
        t('archive.confirm.restoreToNewBoard', { boardName: boardTitleForRestore }),
        async (newBoardDialog) => {
            const newBoard = await saveBoard({
                title: t('archive.restoredBoardName', { oldName: boardTitleForRestore }),
                ownerId: currentUser.id,
                columnIds: [column.id]
            });
            column.isArchived = false;
            const fromLocation = column.archiveReason === 'deleted' ? t('archive.tabs.trash') : t('archive.tabs.archived');
            if (!column.activityLog) column.activityLog = [];
            column.activityLog.push({ action: 'restored', userId: currentUser.id, timestamp: new Date().toISOString(), from: fromLocation });
            delete column.archiveReason; delete column.archivedAt; delete column.archivedBy;
            column.boardId = newBoard.id;
            await saveColumn(column);
            showDialogMessage(newBoardDialog, t('archive.feedback.restoredToNewBoard'), 'success');
            await loadAllArchivedItems(); renderAllLists();
            return true;
        }
    );
    dialog.close();
    return false;
}

/**
 * Função central para a restauração inteligente de um cartão.
 * @param {string} cardId - O ID do cartão a ser restaurado.
 * @param {HTMLElement} dialog - O diálogo de confirmação original.
 */
async function intelligentRestoreCard(cardId, dialog) {
    const card = await getCard(cardId);
    if (!card) {
        showDialogMessage(dialog, t('archive.feedback.itemNotFound'), 'error');
        return false;
    }

    const originalColumn = await getColumn(card.columnId);

    // Cenário 1: A coluna pai existe e está ativa.
    if (originalColumn && !originalColumn.isArchived) {
        await restoreCardToColumn(card, originalColumn.id, originalColumn.boardId);
        showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
        await loadAllArchivedItems(); renderAllLists();
        return true;
    }

    // Cenário 2: A coluna pai existe, mas está no arquivo/lixeira.
    if (originalColumn && originalColumn.isArchived) {
        const location = originalColumn.archiveReason === 'deleted' ? t('archive.tabs.trash') : t('archive.tabs.archived');
        showConfirmationDialog(
            t('archive.confirm.restoreParent', { itemName: originalColumn.title, location: location }),
            async (parentDialog) => {
                // Restaura a coluna (que por sua vez pode restaurar o quadro).
                const columnRestored = await intelligentRestoreColumn(originalColumn.id, parentDialog);
                if (columnRestored) {
                    // Agora que o pai foi restaurado, restaura o cartão.
                    await restoreCardToColumn(card, originalColumn.id, originalColumn.boardId);
                    showDialogMessage(parentDialog, t('archive.feedback.restored'), 'success');
                    await loadAllArchivedItems(); renderAllLists();
                    return true;
                }
                return false; // Se a restauração do pai falhar, para aqui.
            }
        );
        dialog.close(); // Fecha o diálogo original
        return false; // A ação continua no novo diálogo
    }

    // Cenário 3: A coluna pai foi excluída permanentemente.
    // Tenta encontrar o quadro avô.
    const originalBoard = await getBoard(card.boardId);

    // Cenário 3a: O quadro avô existe e está ativo.
    if (originalBoard && !originalBoard.isArchived) {
        showConfirmationDialog(
            t('archive.confirm.restoreToNewColumn', { boardName: originalBoard.title }),
            async (newColDialog) => {
                const newColumn = await saveColumn({ title: t('archive.restoredColumnName'), boardId: originalBoard.id, cardIds: [] });
                originalBoard.columnIds.push(newColumn.id);
                await saveBoard(originalBoard);
                await restoreCardToColumn(card, newColumn.id, originalBoard.id);
                showDialogMessage(newColDialog, t('archive.feedback.restoredToNewColumn'), 'success');
                await loadAllArchivedItems(); renderAllLists();
                return true;
            }
        );
        dialog.close();
        return false;
    }

    // Cenário 3b: O quadro avô existe, mas está no arquivo/lixeira.
    if (originalBoard && originalBoard.isArchived) {
        const location = originalBoard.archiveReason === 'deleted' ? t('archive.tabs.trash') : t('archive.tabs.archived');
        showConfirmationDialog(
            t('archive.confirm.restoreParent', { itemName: originalBoard.title, location: location }), // Reutiliza a chave
            async (grandParentDialog) => {
                const boardRestored = await intelligentRestoreBoard(originalBoard.id, grandParentDialog, false); // false para não mostrar msg de sucesso ainda
                if (boardRestored) {
                    // Agora que o avô foi restaurado, tenta restaurar o cartão novamente.
                    // A lógica cairá no cenário 3a (quadro ativo, coluna não existe).
                    await intelligentRestoreCard(card.id, grandParentDialog);
                    return true; // Sucesso parcial, a ação continua.
                }
                return false;
            }
        );
        dialog.close();
        return false;
    }

    // Cenário 4: Órfão completo (nem coluna nem quadro existem).
    showConfirmationDialog(
        t('archive.confirm.restoreToNewBoardAndColumn'),
        async (orphanDialog) => {
            const boardTitle = t('archive.restoredBoardName', { oldName: card.boardTitle || t('archive.unknownBoard') });
            const columnTitle = card.columnTitle || t('archive.restoredColumnName');
            const newBoard = await saveBoard({ title: boardTitle, ownerId: currentUser.id, columnIds: [] });
            const newColumn = await saveColumn({ title: columnTitle, boardId: newBoard.id, cardIds: [] });
            newBoard.columnIds.push(newColumn.id);
            await saveBoard(newBoard);
            await restoreCardToColumn(card, newColumn.id, newBoard.id);
            showDialogMessage(orphanDialog, t('archive.feedback.restoredToNewBoard'), 'success');
            await loadAllArchivedItems(); renderAllLists();
            return true;
        }
    );
    dialog.close();
    return false;
}

/**
 * Função auxiliar para restaurar um cartão em uma coluna de destino.
 * @param {object} card - O objeto do cartão.
 * @param {string} targetColumnId - O ID da coluna de destino.
 * @param {string} targetBoardId - O ID do quadro de destino.
 */
async function restoreCardToColumn(card, targetColumnId, targetBoardId) {
    card.isArchived = false;

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
}

/**
 * ETAPA 3: Restauração de Quadro
 * A restauração de um quadro é simples, pois ele não tem pais.
 */
async function handleRestoreBoard(boardId) {
    const board = await getBoard(boardId);
    if (!board) return showFloatingMessage(t('archive.feedback.itemNotFound'), 'error');
    
    showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
        await intelligentRestoreBoard(board.id, dialog);
    });
}

/**
 * Função central para a restauração inteligente de um quadro.
 * @param {string} boardId - O ID do quadro a ser restaurado.
 * @param {HTMLElement} dialog - O diálogo de confirmação original.
 * @param {boolean} showSuccessMsg - Se deve mostrar a mensagem de sucesso final.
 * @returns {Promise<boolean>} - True se a restauração foi bem-sucedida.
 */
async function intelligentRestoreBoard(boardId, dialog, showSuccessMsg = true) {
    const board = await getBoard(boardId);
    if (!board) {
        showDialogMessage(dialog, t('archive.feedback.itemNotFound'), 'error');
        return false;
    }

    board.isArchived = false;
    // A lógica de restauração do quadro agora é simplificada para não restaurar filhos.
    // Apenas marca como não arquivado e adiciona de volta à lista do usuário/grupo.
    const userProfile = await getUserProfile(currentUser.id);
    const group = board.groupId ? await getGroup(board.groupId) : null;

    const fromLocation = board.archiveReason === 'deleted' ? t('archive.tabs.trash') : t('archive.tabs.archived');
    if (!board.activityLog) board.activityLog = [];
    board.activityLog.push({ action: 'restored', userId: currentUser.id, timestamp: new Date().toISOString(), from: fromLocation });
    delete board.archiveReason; delete board.archivedAt; delete board.archivedBy;

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

    if (showSuccessMsg) {
        showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
        await loadAllArchivedItems(); renderAllLists();
    }
    return true;
}

// --- OTHER FUNCTIONS (UNCHANGED) ---

/**
 * Nova função para mover um item da lixeira para os arquivos.
 */
async function handleMoveToArchived(itemId, type) {
    let item;
    if (type === 'card') item = await getCard(itemId);
    else if (type === 'column') item = await getColumn(itemId);
    else if (type === 'board') item = await getBoard(itemId);

    if (!item) return;

    item.archiveReason = 'archived'; // Muda o status
    if (type === 'card') await saveCard(item);
    if (type === 'column') await saveColumn(item);
    else if (type === 'board') await saveBoard(item);

    showFloatingMessage(t('archive.feedback.restoredFromTrash'), 'success'); await loadAllArchivedItems();
    renderAllLists();
}

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
    const trashItems = {
        boards: allArchivedItems.boards.filter(b => b.archiveReason === 'deleted'),
        columns: allArchivedItems.columns.filter(c => c.archiveReason === 'deleted'),
        cards: allArchivedItems.cards.filter(c => c.archiveReason === 'deleted')
    };

    const totalItems = trashItems.boards.length + trashItems.columns.length + trashItems.cards.length;
    
    if (totalItems === 0) {
        showFloatingMessage(t('archive.feedback.trashEmpty'), 'info');
        return;
    }

    showConfirmationDialog(
        t('archive.confirm.emptyTrash', { count: totalItems }),
        async (dialog) => {
            // OPTIMIZED & SAFE DELETION:
            // We run deletions in parallel for each type, but wait for each type to finish
            // in the correct order: Cards -> Columns -> Boards.
            await Promise.all(trashItems.cards.map(card => deleteItem(card.id, 'card')));
            await Promise.all(trashItems.columns.map(column => deleteItem(column.id, 'column')));
            await Promise.all(trashItems.boards.map(board => deleteItem(board.id, 'board')));

            showDialogMessage(dialog, t('archive.feedback.trashEmptied'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        },
        null,
        t('ui.yesDelete')
    );
}