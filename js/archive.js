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
    deleteBoard, // Hard delete
    deleteCard, 
    deleteColumn,
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

async function handleRestoreColumn(columnId) {
    const column = await getColumn(columnId);
    if (!column) return showFloatingMessage(t('archive.feedback.itemNotFound'), 'error');

    if (column.archiveReason === 'deleted') {
        delete column.archiveReason;
        await saveColumn(column);
        showFloatingMessage(t('archive.feedback.restoredFromTrash', {defaultValue: "Item restaurado da lixeira para os arquivos."}), 'success');
        await loadAllArchivedItems();
        renderAllLists();
        return;
    }

    const originalBoard = await getBoard(column.boardId);

    if (originalBoard && !originalBoard.isArchived) {
        showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
            column.isArchived = false;
            delete column.archivedAt;
            delete column.archivedBy;
            if (!originalBoard.columnIds.includes(column.id)) {
                originalBoard.columnIds.push(column.id);
            }
            await saveColumn(column);
            await saveBoard(originalBoard);
            showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        });
    } else {
        const originalBoardTitle = column.boardTitle || t('archive.unknownBoard');
        showConfirmationDialog(
            t('archive.confirm.restoreToNewBoard', { boardName: originalBoardTitle }),
            async (dialog) => {
                const newBoard = await saveBoard({
                    title: `${originalBoardTitle} restaurado`,
                    ownerId: currentUser.id,
                    columnIds: [column.id]
                });
                column.isArchived = false;
                delete column.archiveReason;
                delete column.archivedAt;
                delete column.archivedBy;
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

async function handleRestoreCard(cardId) {
    const card = await getCard(cardId);
    if (!card) return showFloatingMessage(t('archive.feedback.itemNotFound'), 'error');

    if (card.archiveReason === 'deleted') {
        delete card.archiveReason;
        await saveCard(card);
        showFloatingMessage(t('archive.feedback.restoredFromTrash', {defaultValue: "Item restaurado da lixeira para os arquivos."}), 'success');
        await loadAllArchivedItems();
        renderAllLists();
        return;
    }

    const originalBoard = await getBoard(card.boardId);
    const originalColumn = await getColumn(card.columnId);

    const restoreCardToColumn = async (targetColumnId, targetBoardId) => {
        card.isArchived = false;
        delete card.archiveReason;
        delete card.archivedAt;
        delete card.archivedBy;
        card.columnId = targetColumnId;
        card.boardId = targetBoardId;
        
        const targetColumn = await getColumn(targetColumnId);
        if (targetColumn) {
            if (!targetColumn.cardIds) targetColumn.cardIds = [];
            if (!targetColumn.cardIds.includes(card.id)) {
                targetColumn.cardIds.push(card.id);
            }
            await saveColumn(targetColumn);
        }
        await saveCard(card);
    };

    if (originalBoard && !originalBoard.isArchived && originalColumn && !originalColumn.isArchived) {
        showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
            await restoreCardToColumn(originalColumn.id, originalBoard.id);
            showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        });
        return;
    }

    if (!originalBoard || originalBoard.isArchived) {
        showConfirmationDialog(t('archive.confirm.restoreToNewBoardAndColumn'), async (dialog) => {
            const boardTitle = `${card.boardTitle || 'Quadro'} restaurado`;
            const columnTitle = `${card.columnTitle || 'Coluna'} restaurada`;

            const newBoard = await saveBoard({ title: boardTitle, ownerId: currentUser.id, columnIds: [] });
            const newColumn = await saveColumn({ title: columnTitle, boardId: newBoard.id, cardIds: [] });
            
            newBoard.columnIds.push(newColumn.id);
            await saveBoard(newBoard);

            await restoreCardToColumn(newColumn.id, newBoard.id);
            showDialogMessage(dialog, t('archive.feedback.restoredToNewBoard'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        });
        return;
    }

    const boardColumns = (await getFullBoardData(originalBoard.id)).columns.filter(c => !c.isArchived);

    if (boardColumns.length === 0) {
        showConfirmationDialog(t('archive.confirm.restoreToNewColumn', { boardName: originalBoard.title }), async (dialog) => {
            const newColumn = await saveColumn({ title: 'Coluna Restaurada', boardId: originalBoard.id, cardIds: [] });
            originalBoard.columnIds.push(newColumn.id);
            await saveBoard(originalBoard);
            await restoreCardToColumn(newColumn.id, originalBoard.id);
            showDialogMessage(dialog, t('archive.feedback.restoredToNewColumn'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        });
        return;
    }

    if (boardColumns.length > 0) {
        const firstColumn = boardColumns[0];
        showConfirmationDialog(t('archive.confirm.restoreToFirstColumn', { boardName: originalBoard.title }), async (dialog) => {
            await restoreCardToColumn(firstColumn.id, originalBoard.id);
            showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        });
        return;
    }
}

async function handleRestoreBoard(boardId) {
    const board = await getBoard(boardId);
    if (!board) return showFloatingMessage(t('archive.feedback.itemNotFound'), 'error');

    if (board.archiveReason === 'deleted') {
        delete board.archiveReason;
        await saveBoard(board);
        showFloatingMessage(t('archive.feedback.restoredFromTrash', {defaultValue: "Item restaurado da lixeira para os arquivos."}), 'success');
        await loadAllArchivedItems();
        renderAllLists();
        return;
    }

    showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
        const userProfile = await getUserProfile(currentUser.id);
        if (!userProfile) return false;

        board.isArchived = false;
        delete board.archivedAt;
        delete board.archivedBy;
        
        if (!userProfile.boardIds.includes(boardId)) {
            userProfile.boardIds.push(boardId);
        }
        userProfile.archivedBoardIds = (userProfile.archivedBoardIds || []).filter(id => id !== boardId);
        
        await saveUserProfile(userProfile);
        await saveBoard(board);

        showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
        await loadAllArchivedItems();
        renderAllLists();
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
            await Promise.all(trashItems.map(item => {
                if (item.id.startsWith('card')) return deleteCard(item.id);
                if (item.id.startsWith('column')) return deleteColumn(item.id);
                if (item.id.startsWith('board')) return deleteBoard(item.id);
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