import { getCurrentUser } from './auth.js';
import { 
    getUserProfile, saveUserProfile,
    getAllGroups,
    getFullBoardData,
    getCard, 
    saveCard, 
    getColumn, 
    saveColumn, 
    getBoard, 
    saveBoard, deleteBoard,
    deleteCard, // Hard delete
    deleteColumn,
    getAllUsers
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
    await loadAllArchivedItems(); // CORREÇÃO: Adicionado 'await' aqui
    renderAllLists();
    setupEventListeners();
}

async function loadAllArchivedItems() {
    // 1. Limpa o estado e busca todos os arquivos de dados de uma vez
    allArchivedItems = { cards: [], columns: [], boards: [] };
    const allFileNames = await window.electronAPI.listFiles(); // Busca todos os nomes de arquivo
    const allCardKeys = allFileNames.filter(name => name.startsWith('card_'));
    const allColumnKeys = allFileNames.filter(name => name.startsWith('column_'));
    const allBoardKeys = allFileNames.filter(name => name.startsWith('board_'));

    // 2. Carrega TODOS os itens que estão marcados como arquivados (incluindo os da lixeira)
    const archivedCards = (await Promise.all(allCardKeys.map(key => getCard(key.replace('card_', ''))))).filter(c => c && c.isArchived);
    const archivedColumns = (await Promise.all(allColumnKeys.map(key => getColumn(key.replace('column_', ''))))).filter(c => c && c.isArchived);
    const archivedBoards = (await Promise.all(allBoardKeys.map(key => getBoard(key.replace('board_', ''))))).filter(b => b && b.isArchived);

    // 3. Adiciona todos os itens encontrados às listas globais. A função de renderização cuidará do resto
    allArchivedItems.cards.push(...archivedCards);
    allArchivedItems.columns.push(...archivedColumns);
    allArchivedItems.boards.push(...archivedBoards);
}

async function renderAllLists() {
    // Archived Tab
    const archivedBoardsList = document.getElementById('archived-boards-list');
    const archivedCardsList = document.getElementById('archived-cards-list');
    const archivedColumnsList = document.getElementById('archived-columns-list');
    
    // Lixeira
    const trashCardsList = document.getElementById('trash-cards-list');
    const trashColumnsList = document.getElementById('trash-columns-list'); // Novo container
    const trashBoardsList = document.getElementById('trash-boards-list');

    archivedBoardsList.innerHTML = '';
    archivedCardsList.innerHTML = '';
    archivedColumnsList.innerHTML = '';
    trashCardsList.innerHTML = '';
    trashColumnsList.innerHTML = '';
    trashBoardsList.innerHTML = '';

    const archivedBoards = allArchivedItems.boards.filter(b => b.archiveReason !== 'deleted');
    const archivedCards = allArchivedItems.cards.filter(c => c.archiveReason !== 'deleted');
    const archivedColumns = allArchivedItems.columns.filter(c => c.archiveReason !== 'deleted');

    const trashBoards = allArchivedItems.boards.filter(b => b.archiveReason === 'deleted');
    const trashCards = allArchivedItems.cards.filter(c => c.archiveReason === 'deleted'); // Corrigido
    const trashColumns = allArchivedItems.columns.filter(c => c.archiveReason === 'deleted'); // Nova lista

    // Renderiza cada seção com agrupamento
    for (const board of archivedBoards) { archivedBoardsList.appendChild(await createItemElement(board, 'board')); }
    groupAndRenderItems(archivedCards, archivedCardsList, 'card');
    groupAndRenderItems(archivedColumns, archivedColumnsList, 'column');
    
    for (const board of trashBoards) { trashBoardsList.appendChild(await createItemElement(board, 'board')); }
    groupAndRenderItems(trashCards, trashCardsList, 'card');
    groupAndRenderItems(trashColumns, trashColumnsList, 'column');
}

function groupAndRenderItems(items, container, type) {
    if (items.length === 0) return;

    const groupedByBoard = items.reduce((acc, item) => {
        const board = allArchivedItems.boards.find(b => b.id === item.boardId); // Busca nos dados já carregados
        const boardName = board ? board.title : t('archive.unknownBoard');
        if (!acc[boardName]) acc[boardName] = [];
        acc[boardName].push(item);
        return acc;
    }, {});

    Object.keys(groupedByBoard).sort().forEach(boardName => {
        const groupHeader = document.createElement('h4');
        groupHeader.className = 'archive-group-header';
        groupHeader.textContent = boardName;
        container.appendChild(groupHeader);

        groupedByBoard[boardName].forEach(async item => {
            container.appendChild(await createItemElement(item, type));
        });
    });
}

async function createItemElement(item, type) {
    const itemEl = document.createElement('div');
    itemEl.className = 'archive-item';
    itemEl.dataset.itemId = item.id;

    const archivedAt = new Date(item.archivedAt || Date.now()).toLocaleString();
    const archivedBy = (allUsers.find(u => u.id === item.archivedBy) || { name: 'Unknown' }).name;
    
    let metaText = '';
    if (type === 'card') {
        const boardName = (await getBoard(item.boardId))?.title || '?';
        const columnName = (await getColumn(item.columnId))?.title || '?';
        metaText = t('archive.meta.card', { 
            boardName: boardName, 
            columnName: columnName, 
            date: archivedAt, 
            user: archivedBy 
        });
    } else if (type === 'column') {
        const boardName = (await getBoard(item.boardId))?.title || '?';
        metaText = t('archive.meta.column', { boardName: boardName, date: archivedAt, user: archivedBy });
    } else if (type === 'board') {
        metaText = t('archive.meta.board', { date: archivedAt, user: archivedBy });
    }

    const isTrash = item.archiveReason === 'deleted';
    let actionsHtml = `<button class="btn restore-btn">${t('archive.buttons.restore')}</button>`;
    if (isTrash) {
        actionsHtml += `<button class="btn danger delete-btn">${t('archive.buttons.delete')}</button>`; // Corrigido
    } else {
        actionsHtml += `<button class="btn alternative1 move-to-trash-btn">${t('archive.buttons.moveToTrash')}</button>`; // Corrigido
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
        if (type === 'board') handleRestoreBoard(item.id);
    });

    if (isTrash) {
        itemEl.querySelector('.delete-btn').addEventListener('click', () => {
            if (type === 'card') handleDeleteCard(item.id);
            if (type === 'column') handleDeleteColumn(item.id);
            if (type === 'board') handleDeleteBoard(item.id);
        });
    } else {
        itemEl.querySelector('.move-to-trash-btn').addEventListener('click', () => {
            handleMoveToTrash(item.id, type);
        });
    }
    return itemEl;
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

    showFloatingMessage(t('archive.feedback.movedToTrash'), 'info'); // Adicionar tradução
    await loadAllArchivedItems();
    renderAllLists();
}

async function handleRestoreCard(cardId) {
    showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
        const card = await getCard(cardId);
        if (!card) {
            showDialogMessage(dialog, t('kanban.feedback.cardNotFound'), 'error'); // Reutilizando chave
            return false;
        }

        // Se estiver na lixeira, a restauração o move de volta para "Arquivados".
        if (card.archiveReason === 'deleted') {
            // Adiciona o log de restauração da lixeira
            const logEntry = { // Corrigido
                action: 'restored',
                userId: currentUser.id,
                timestamp: new Date().toISOString(), // A chave 'from' será adicionada abaixo
                from: 'trash'
            };
            if (!card.activityLog) card.activityLog = [];
            card.activityLog.push(logEntry);
            delete card.archiveReason;
            await saveCard(card);
        } else {
            // Se estiver em "Arquivados", a restauração o move de volta para o quadro.
            if (!card.columnId) {
                showDialogMessage(dialog, t('archive.feedback.cannotRestoreColumnNotFound'), 'error');
                return false;
            }
            const column = await getColumn(card.columnId);
            if (!column) {
                showDialogMessage(dialog, t('archive.feedback.cannotRestoreColumnDeleted'), 'error');
                return false;
            }

            // Re-insere o card na sua coluna original
            if (!column.cardIds.includes(cardId)) {
                column.cardIds.push(cardId);
                await saveColumn(column);
            }
            
            // Adiciona o log de restauração do arquivo
            const logEntry = { // Corrigido
                action: 'restored',
                userId: currentUser.id,
                timestamp: new Date().toISOString(), // A chave 'from' será adicionada abaixo
                from: 'archive'
            };
            if (!card.activityLog) card.activityLog = [];
            card.activityLog.push(logEntry);
            
            card.isArchived = false;
            delete card.archivedAt;
            delete card.archivedBy;
            await saveCard(card);
        }

        showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
        await loadAllArchivedItems();
        renderAllLists();
        return true;
    });
}

async function handleRestoreColumn(columnId) {
    showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
        const column = await getColumn(columnId); // A função getColumn já existe no storage.js
        if (!column) {
            // MELHORIA: Mostra um erro claro e não congela o diálogo.
            showDialogMessage(dialog, t('archive.feedback.cannotRestoreColumnNotFound'), 'error');
            // Retornar undefined/null reabilita os botões no ui-controls.
            return; 
        }

        const logAction = column.archiveReason === 'deleted' ? 'restored' : 'restored';
        const fromLocation = column.archiveReason === 'deleted' ? 'trash' : 'archive';

        if (column.archiveReason === 'deleted') {
            delete column.archiveReason;
        } else {
            const board = await getBoard(column.boardId); // A função getBoard já existe no storage.js
            if (!board) {
                // MELHORIA: Lida com o caso de quadro não encontrado.
                showDialogMessage(dialog, t('archive.feedback.cannotRestoreColumnNotFound'), 'error');
                return; // Reabilita os botões.
            }

            if (!board.columnIds.includes(columnId)) {
                board.columnIds.push(columnId);
            }
            board.archivedColumnIds = (board.archivedColumnIds || []).filter(id => id !== columnId);
            await saveBoard(board);
        }

        // Adiciona a entrada de log
        const logEntry = { // Corrigido
            action: logAction,
            userId: currentUser.id,
            timestamp: new Date().toISOString(),
            from: fromLocation
        };
        if (!column.activityLog) column.activityLog = [];
        column.activityLog.push(logEntry);

        // A propriedade isArchived só deve ser alterada após o log e antes de salvar.
        column.isArchived = false;

        await saveColumn(column);
        showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
        await loadAllArchivedItems();
        renderAllLists(); // A função renderAllLists já existe
        return true;
    });
}

async function handleRestoreBoard(boardId) {
    showConfirmationDialog(t('archive.confirm.restore'), async (dialog) => {
        const board = await getBoard(boardId);
        const userProfile = await getUserProfile(currentUser.id);
        if (!board || !userProfile) return false;

        if (board.archiveReason === 'deleted') {
            delete board.archiveReason;
        } else {
            board.isArchived = false;
            userProfile.boardIds.push(boardId);
            userProfile.archivedBoardIds = (userProfile.archivedBoardIds || []).filter(id => id !== boardId);
            await saveUserProfile(userProfile);
        }

        await saveBoard(board);
        showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
        await loadAllArchivedItems();
        renderAllLists();
        return true;
    });
}

async function handleDeleteCard(cardId) {
    showConfirmationDialog(t('archive.confirm.delete'), async (dialog) => {
        // Antes de deletar, adicionamos um último log.
        const card = await getCard(cardId);
        if (card) {
            const logEntry = { // Corrigido
                action: 'deleted',
                userId: currentUser.id,
                timestamp: new Date().toISOString()
            };
            if (!card.activityLog) card.activityLog = [];
            card.activityLog.push(logEntry);
            // Salvamos o cartão uma última vez com o log de exclusão.
            await saveCard(card);
        }

        if (await deleteCard(cardId)) {
            showDialogMessage(dialog, t('archive.feedback.deleted'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        }
        return false; // Mantém o diálogo aberto em caso de erro
    }, null, t('ui.yesDelete'));
}

async function handleDeleteColumn(columnId) {
    showConfirmationDialog(t('archive.confirm.delete'), async (dialog) => {
        // Adiciona o log de exclusão antes de deletar
        const column = await getColumn(columnId);
        if (column) {
            const logEntry = { // Corrigido
                action: 'deleted',
                userId: currentUser.id,
                timestamp: new Date().toISOString()
            };
            if (!column.activityLog) column.activityLog = [];
            column.activityLog.push(logEntry);
            await saveColumn(column);
        }

        if (await deleteColumn(columnId)) {
            showDialogMessage(dialog, t('archive.feedback.deleted'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        }
        return false; // Mantém o diálogo aberto em caso de erro
    }, null, t('ui.yesDelete'));
}

async function handleDeleteBoard(boardId) {
    showConfirmationDialog(t('archive.confirm.delete'), async (dialog) => {
        if (await deleteBoard(boardId)) { // Usa a função de exclusão permanente do storage
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
    const trashCards = allArchivedItems.cards.filter(c => c.archiveReason === 'deleted');
    const trashColumns = allArchivedItems.columns.filter(c => c.archiveReason === 'deleted');
    const trashBoards = allArchivedItems.boards.filter(b => b.archiveReason === 'deleted');
    const totalItems = trashCards.length + trashColumns.length + trashBoards.length;

    if (totalItems === 0) {
        showFloatingMessage(t('archive.feedback.trashEmpty'), 'info');
        return;
    }
    showConfirmationDialog(
        t('archive.confirm.emptyTrash', { count: totalItems }),
        async (dialog) => {
            // 1. Deleta os arquivos físicos
            await Promise.all(trashCards.map(card => deleteCard(card.id)));
            await Promise.all(trashColumns.map(col => deleteColumn(col.id)));
            await Promise.all(trashBoards.map(board => deleteBoard(board.id)));

            showDialogMessage(dialog, t('archive.feedback.trashEmptied'), 'success');
            
            // 2. Recarrega o estado do zero para garantir a sincronia
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        },
        null,
        t('ui.yesDelete')
    );
}