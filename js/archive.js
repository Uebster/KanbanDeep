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
        // Na lixeira, o botão principal é "Mover para Arquivados" e há um novo "Restaurar" direto.
        actionsHtml = `
            <button class="btn restore-from-trash-btn">${t('archive.buttons.moveToArchived')}</button>
            <button class="btn confirm restore-direct-btn">${t('archive.buttons.restore')}</button>
            <button class="btn danger delete-btn">${t('archive.buttons.delete')}</button>
        `;
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

    if (isTrash) {
        // Botão "Mover para Arquivados"
        itemEl.querySelector('.restore-from-trash-btn').addEventListener('click', () => handleMoveToArchived(item.id, type));
        // Botão "Restaurar" direto
        itemEl.querySelector('.restore-direct-btn').addEventListener('click', () => {
            if (type === 'card') handleRestoreCard(item.id);
            if (type === 'column') handleRestoreColumn(item.id);
            if (type === 'board') handleRestoreBoard(item.id);
        });
        // Botão "Excluir Permanentemente"
        itemEl.querySelector('.delete-btn').addEventListener('click', () => {
            if (type === 'card') handleDeleteCard(item.id);
            if (type === 'column') handleDeleteColumn(item.id);
            if (type === 'board') handleDeleteBoard(item.id);
        });
    } else {
        // Botão "Restaurar" dos Arquivados
        itemEl.querySelector('.restore-btn').addEventListener('click', () => {
            if (type === 'card') handleRestoreCard(item.id);
            if (type === 'column') handleRestoreColumn(item.id);
            if (type === 'board') handleRestoreBoard(item.id);
        });
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

    showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
        await intelligentRestoreCard(card.id, dialog);
    });
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

    const originalBoard = await getBoard(column.boardId);

    // Cenário 1: O quadro pai existe e está ativo.
    if (originalBoard && !originalBoard.isArchived) {
        column.isArchived = false;
        const fromLocation = column.archiveReason === 'deleted' ? t('archive.tabs.trash') : t('archive.tabs.archived');
        if (!column.activityLog) column.activityLog = [];
        column.activityLog.push({ action: 'restored', userId: currentUser.id, timestamp: new Date().toISOString(), from: fromLocation });
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
                const boardRestored = await intelligentRestoreBoard(originalBoard.id, parentDialog);
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
 */
async function intelligentRestoreBoard(boardId, dialog) {
    const board = await getBoard(boardId);
    if (!board) {
        showDialogMessage(dialog, t('archive.feedback.itemNotFound'), 'error');
        return false;
    }

    const userProfile = await getUserProfile(currentUser.id);
    const group = board.groupId ? await getGroup(board.groupId) : null;

    board.isArchived = false;
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

    showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
    await loadAllArchivedItems(); renderAllLists();
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
            // Itera sobre todos os itens e chama a função de exclusão individual apropriada.
            await Promise.all(trashItems.map(item => {
                if (item.id.startsWith('board_')) return deleteBoard(item.id);
                if (item.id.startsWith('column_')) return deleteColumn(item.id);
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