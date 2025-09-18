import { getCurrentUser } from './auth.js';
import { 
    getUserProfile, 
    getAllGroups, 
    getFullBoardData, 
    getCard, 
    saveCard, 
    getColumn, 
    saveColumn, 
    getBoard, 
    saveBoard,
    deleteCard, // Hard delete
    deleteColumn, // Hard delete
    getAllUsers
} from './storage.js';
import { showConfirmationDialog, showFloatingMessage, showDialogMessage } from './ui-controls.js';
import { t, initTranslations } from './translations.js';

let currentUser = null;
let allUsers = [];
let allArchivedItems = { cards: [], columns: [] };

export async function initArchivePage() {
    currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'list-users.html';
        return;
    }

    await initTranslations(); // Wait for translations to load

    allUsers = getAllUsers();
    loadAllArchivedItems();
    renderAllLists();
    setupEventListeners();
}

function loadAllArchivedItems() {
    const userProfile = getUserProfile(currentUser.id);
    const allGroups = getAllGroups();
    const memberGroups = allGroups.filter(g => g.memberIds && g.memberIds.includes(currentUser.id));
    const groupBoardIds = memberGroups.flatMap(g => g.boardIds || []);
    const allVisibleBoardIds = new Set([...(userProfile.boardIds || []), ...groupBoardIds]);

    allArchivedItems = { cards: [], columns: [] };

    allVisibleBoardIds.forEach(boardId => {
        const board = getFullBoardData(boardId, true); // true to include archived items
        if (!board) return;

        // Find archived cards
        board.columns.forEach(column => {
            column.cards.forEach(card => {
                if (card.isArchived) {
                    allArchivedItems.cards.push({
                        ...card,
                        boardName: board.title,
                        columnName: column.title,
                        boardId: board.id,
                        columnId: column.id
                    });
                }
            });
        });

        // Find archived columns
        const archivedColumns = (board.archivedColumnIds || []).map(colId => {
            const col = getColumn(colId);
            return col ? { ...col, boardName: board.title, boardId: board.id } : null;
        }).filter(Boolean);
        
        allArchivedItems.columns.push(...archivedColumns);
    });
}

function renderAllLists() {
    // Archived Tab
    const archivedCardsList = document.getElementById('archived-cards-list');
    const archivedColumnsList = document.getElementById('archived-columns-list');
    
    // Trash Tab
    const trashCardsList = document.getElementById('trash-cards-list');
    const trashColumnsList = document.getElementById('trash-columns-list'); // Novo container

    archivedCardsList.innerHTML = '';
    archivedColumnsList.innerHTML = '';
    trashCardsList.innerHTML = '';
    trashColumnsList.innerHTML = '';

    const archivedCards = allArchivedItems.cards.filter(c => c.archiveReason !== 'deleted');
    const archivedColumns = allArchivedItems.columns.filter(c => c.archiveReason !== 'deleted');
    const trashCards = allArchivedItems.cards.filter(c => c.archiveReason === 'deleted');
    const trashColumns = allArchivedItems.columns.filter(c => c.archiveReason === 'deleted'); // Nova lista

    // Renderiza cada seção com agrupamento
    groupAndRenderItems(archivedCards, archivedCardsList, 'card');
    groupAndRenderItems(archivedColumns, archivedColumnsList, 'column');
    groupAndRenderItems(trashCards, trashCardsList, 'card');
    groupAndRenderItems(trashColumns, trashColumnsList, 'column');
}

function groupAndRenderItems(items, container, type) {
    if (items.length === 0) return;

    const groupedByBoard = items.reduce((acc, item) => {
        const boardName = item.boardName || 'Unknown Board';
        if (!acc[boardName]) acc[boardName] = [];
        acc[boardName].push(item);
        return acc;
    }, {});

    Object.keys(groupedByBoard).sort().forEach(boardName => {
        const groupHeader = document.createElement('h4');
        groupHeader.className = 'archive-group-header';
        groupHeader.textContent = boardName;
        container.appendChild(groupHeader);

        groupedByBoard[boardName].forEach(item => {
            container.appendChild(createItemElement(item, type));
        });
    });
}

function createItemElement(item, type) {
    const itemEl = document.createElement('div');
    itemEl.className = 'archive-item';
    itemEl.dataset.itemId = item.id;

    const archivedAt = new Date(item.archivedAt || Date.now()).toLocaleString();
    const archivedBy = allUsers.find(u => u.id === item.archivedBy)?.name || 'Unknown';
    
    let metaText = '';
    if (type === 'card') {
        metaText = t('archive.meta', { 
            boardName: item.boardName, 
            columnName: item.columnName, 
            date: archivedAt, 
            user: archivedBy 
        });
    } else if (type === 'column') {
        metaText = `In board '${item.boardName}' | Archived on: ${archivedAt} by ${archivedBy}`;
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
        <div class="item-actions">
            ${actionsHtml}
        </div>
    `;

    itemEl.querySelector('.restore-btn').addEventListener('click', () => {
        if (type === 'card') handleRestoreCard(item.id);
        if (type === 'column') handleRestoreColumn(item.id);
    });

    if (isTrash) {
        itemEl.querySelector('.delete-btn').addEventListener('click', () => {
            if (type === 'card') handleDeleteCard(item.id);
            if (type === 'column') handleDeleteColumn(item.id);
        });
    } else {
        itemEl.querySelector('.move-to-trash-btn').addEventListener('click', () => {
            handleMoveToTrash(item.id, type);
        });
    }

    return itemEl;
}

function handleMoveToTrash(itemId, type) {
    const item = type === 'card' ? getCard(itemId) : getColumn(itemId);
    if (!item) return;

    item.archiveReason = 'deleted';
    if (type === 'card') saveCard(item);
    if (type === 'column') saveColumn(item);

    showFloatingMessage(t('archive.feedback.movedToTrash'), 'info'); // Adicionar tradução
    loadAllArchivedItems();
    renderAllLists();
}

function handleRestoreCard(cardId) {
    showConfirmationDialog(t('archive.confirm.restore'), (dialog) => {
        const card = getCard(cardId);
        if (!card) {
            showDialogMessage(dialog, 'Error: Card not found.', 'error');
            return false;
        }

        // Se estiver na lixeira, a restauração o move de volta para "Arquivados".
        if (card.archiveReason === 'deleted') {
            delete card.archiveReason;
        } else {
            // Se estiver em "Arquivados", a restauração o move de volta para o quadro.
            card.isArchived = false;
            delete card.archivedAt;
            delete card.archivedBy;
            delete card.archiveReason;
        }
        saveCard(card);

        showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
        loadAllArchivedItems();
        renderAllLists();
        return true;
    });
}

function handleRestoreColumn(columnId) {
    showConfirmationDialog(t('archive.confirm.restore'), (dialog) => {
        const itemFromList = allArchivedItems.columns.find(c => c.id === columnId);
        if (!itemFromList) {
            showDialogMessage(dialog, 'Error: Column not found in archived list.', 'error');
            return false;
        }

        const column = getColumn(columnId);
        const board = getBoard(itemFromList.boardId);
        if (!column || !board) {
            showDialogMessage(dialog, 'Error: Column or board not found.', 'error');
            return false;
        }

        if (column.archiveReason === 'deleted') {
            delete column.archiveReason;
        } else {
            column.isArchived = false;
            board.columnIds.push(columnId);
            board.archivedColumnIds = (board.archivedColumnIds || []).filter(id => id !== columnId);
            saveBoard(board);
        }

        saveColumn(column);
        showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
        loadAllArchivedItems();
        renderAllLists();
        return true;
    });
}

function handleDeleteCard(cardId) {
    showConfirmationDialog(t('archive.confirm.delete'), (dialog) => {
        if (deleteCard(cardId)) {
            showDialogMessage(dialog, t('archive.feedback.deleted'), 'success');
            loadAllArchivedItems();
            renderAllLists();
            return true;
        }
        return false; // Mantém o diálogo aberto em caso de erro
    }, null, t('ui.yesDelete'));
}

function handleDeleteColumn(columnId) {
    showConfirmationDialog(t('archive.confirm.delete'), (dialog) => {
        if (deleteColumn(columnId)) {
            showDialogMessage(dialog, t('archive.feedback.deleted'), 'success');
            loadAllArchivedItems();
            renderAllLists();
            return true;
        }
        return false; // Mantém o diálogo aberto em caso de erro
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
}