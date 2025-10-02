import { getCurrentUser, hasPermission } from './auth.js';
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
    saveGroup,
    trashBoard, // Usar trashBoard do storage.js (já estava aqui)
    deleteCard,
    hardDeleteColumn,
    hardDeleteBoard,  // <-- Usar a nova função
    getAllUsers, deleteColumn, deleteItem,
    universalLoad
} from './storage.js';
import { deleteBoard as deleteBoardFromKanban } from './kanban.js'; // Importa a função com diálogo
import { showConfirmationDialog, showFloatingMessage, showDialogMessage } from './ui-controls.js';
import { t, initTranslations } from './translations.js';
import { getAllGroups } from './storage.js';

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
    
    // CORREÇÃO: Filtra apenas os itens que pertencem ao usuário atual
    const userGroups = (await getAllGroups()).filter(g => g.memberIds.includes(currentUser.id));
    const userGroupIds = userGroups.map(g => g.id);

    const itemKeys = {
        cards: allFileNames.filter(name => name.startsWith('card_')),
        columns: allFileNames.filter(name => name.startsWith('column_')),
        boards: allFileNames.filter(name => name.startsWith('board_'))
    };

    const loadAndFilterItems = async (keys) => {
        const allItems = await Promise.all(keys.map(key => universalLoad(key)));
        return allItems.filter(item => 
            item && item.isArchived && 
            (item.ownerId === currentUser.id || item.archivedBy === currentUser.id || (item.groupId && userGroupIds.includes(item.groupId)))
        );
    };

    allArchivedItems.cards = await loadAndFilterItems(itemKeys.cards);
    allArchivedItems.columns = await loadAndFilterItems(itemKeys.columns);
    allArchivedItems.boards = await loadAndFilterItems(itemKeys.boards);
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
        // CORREÇÃO: Chama a função unificada restoreItem
        restoreItem(item.id, type);
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

// --- LÓGICA DE RESTAURAÇÃO INTELIGENTE UNIFICADA ---

async function restoreItem(itemId, itemType) {
    const item = await universalLoad(`${itemType}_${itemId}`);
    if (!item) {
        showFloatingMessage(t('archive.feedback.itemNotFound'), 'error');
        return;
    }

    const plan = await getRestorationPlan(item, itemType);
    if (!plan || plan.steps.length === 0) return;

    const isAllowed = await validateRestorationPlan(plan);
    if (!isAllowed) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

    // CORREÇÃO: A lógica de execução agora está dentro do callback de confirmação,
    // o que permite que o diálogo se feche automaticamente ao retornar `true`.
    confirmRestorationPlan(plan, async (dialog) => {
        const success = await executeRestorationPlan(plan);
        if (success) {
            showDialogMessage(dialog, t('archive.feedback.restored'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true; // Sinaliza para o diálogo fechar
        } else {
            showDialogMessage(dialog, t('archive.feedback.restoreFailed'), 'error');
            return false; // Mantém o diálogo aberto em caso de erro
        }
    });
}

/**
 * Analisa um item e seus pais para determinar os passos necessários para a restauração.
 * @param {object} item - O item a ser restaurado.
 * @param {string} type - O tipo do item ('card', 'column', 'board').
 * @returns {Promise<object>} Um objeto de plano com os passos e um resumo em texto.
 */
async function getRestorationPlan(item, type) {
    const plan = { steps: [], summary: [] };

    if (type === 'card') {
        const card = item;
        let column = await getColumn(card.columnId);
        const board = await getBoard(card.boardId);

        if (!board) {
            plan.steps.push({ action: 'CREATE_BOARD', title: t('archive.restoredBoardName', { oldName: card.boardTitle || t('archive.unknownBoard') }) });
            plan.summary.push(t('archive.plan.createBoard', { boardName: card.boardTitle || t('archive.unknownBoard') }));
        } else if (board.isArchived) {
            plan.steps.push({ action: 'RESTORE', item: board, type: 'board' });
            plan.summary.push(t('archive.plan.restoreBoard', { boardName: board.title }));
        }

        if (!column) {
            const boardName = board?.title || card.boardTitle || t('archive.unknownBoard');
            plan.steps.push({ action: 'CREATE_COLUMN', title: t('archive.restoredColumnName'), context: { boardId: card.boardId } });
            plan.summary.push(t('archive.plan.createColumn', { boardName }));
        } else if (column.isArchived) {
            plan.steps.push({ action: 'RESTORE', item: column, type: 'column' });
            plan.summary.push(t('archive.plan.restoreColumn', { columnName: column.title }));
        }

        plan.steps.push({ action: 'RESTORE', item: card, type: 'card', context: { boardId: card.boardId } });
        plan.summary.push(t('archive.plan.restoreCard', { cardName: card.title }));

    } else if (type === 'column') {
        const column = item;
        const board = await getBoard(column.boardId);

        if (!board) {
            plan.steps.push({ action: 'CREATE_BOARD', title: t('archive.restoredBoardName', { oldName: column.boardTitle || t('archive.unknownBoard') }), context: { groupId: column.groupId } });
            plan.summary.push(t('archive.plan.createBoard', { boardName: column.boardTitle || t('archive.unknownBoard') }));
        } else if (board.isArchived) {
            plan.steps.push({ action: 'RESTORE', item: board, type: 'board' });
            plan.summary.push(t('archive.plan.restoreBoard', { boardName: board.title }));
        }

        plan.steps.push({ action: 'RESTORE', item: column, type: 'column' });
        plan.summary.push(t('archive.plan.restoreColumn', { columnName: column.title }));

    } else if (type === 'board') {
        plan.steps.push({ action: 'RESTORE', item: item, type: 'board', context: { groupId: item.groupId } });
        plan.summary.push(t('archive.plan.restoreBoard', { boardName: item.title }));
    }
    return plan;
}

/**
 * Mostra um diálogo de confirmação para o usuário, listando os passos do plano.
 * @param {object} plan - O objeto do plano de restauração.
 * @returns {Promise<boolean>} True se o usuário confirmar, false caso contrário.
 */
async function confirmRestorationPlan(plan, onConfirm) {
    let message;
    if (plan.summary.length <= 1) {
        message = t('archive.confirm.restore');
    } else {
        const summaryHtml = '<ul>' + plan.summary.map(s => `<li>${s}</li>`).join('') + '</ul>';
        message = t('archive.confirm.restoreChain', { summary: summaryHtml });
    }

    // A função onConfirm agora é passada diretamente para o diálogo.
    showConfirmationDialog(message, onConfirm);
}

/**
 * Valida se o usuário atual tem permissão para executar cada passo do plano.
 * @param {object} plan - O objeto do plano de restauração.
 * @returns {Promise<boolean>} True se todas as permissões forem concedidas.
 */
async function validateRestorationPlan(plan) {
    for (const step of plan.steps) {
        let requiredPermission = null;
        let boardForCheck = null;

        switch (step.action) {
            case 'CREATE_BOARD':
                // Se o quadro a ser criado pertencer a um grupo, verifica a permissão de criar quadros.
                if (step.context?.groupId) {
                    const tempBoardForCheck = { groupId: step.context.groupId };
                    if (!await hasPermission(currentUser, tempBoardForCheck, 'createBoards')) return false;
                }
                break;
            case 'CREATE_COLUMN':
                requiredPermission = 'createColumns';
                boardForCheck = await getBoard(step.context?.boardId);
                break;
            case 'RESTORE':
                if (step.type === 'card') requiredPermission = 'createCards';
                if (step.type === 'column') requiredPermission = 'createColumns';
                // CORREÇÃO: A permissão para restaurar um quadro de grupo é 'createBoards',
                // pois efetivamente recria o quadro no contexto do grupo.
                if (step.type === 'board' && step.item.groupId) {
                    requiredPermission = 'createBoards';
                }
                boardForCheck = step.item; // O próprio item (quadro) ou o quadro pai do item.
                break;
        }

        if (requiredPermission && boardForCheck && !(await hasPermission(currentUser, boardForCheck, requiredPermission))) {
            return false;
        }
    }
    return true;
}

/**
 * Executa os passos de um plano de restauração em ordem.
 * @param {object} plan - O objeto do plano de restauração.
 * @returns {Promise<boolean>} True se todos os passos forem bem-sucedidos.
 */
async function executeRestorationPlan(plan) {
    const context = {}; // Contexto para passar IDs entre os passos (ex: novo boardId)
    try {
        for (const step of plan.steps) {
            switch (step.action) {
                case 'CREATE_BOARD': {
                    const newBoard = await saveBoard({ title: step.title, ownerId: currentUser.id, columnIds: [] });
                    context.boardId = newBoard.id;
                    break;
                }
                case 'CREATE_COLUMN': {
                    const boardIdForNewCol = context.boardId || plan.steps.find(s => s.type === 'card')?.item.boardId;
                    if (!boardIdForNewCol) throw new Error('Could not find a board to create the column in.');
                    
                    const newColumn = await saveColumn({ title: step.title, boardId: boardIdForNewCol, cardIds: [] });
                    const parentBoard = await getBoard(boardIdForNewCol);
                    if (parentBoard) {
                        if (!parentBoard.columnIds) parentBoard.columnIds = [];
                        parentBoard.columnIds.push(newColumn.id);
                        await saveBoard(parentBoard);
                    }
                    context.columnId = newColumn.id;
                    break;
                }
                case 'RESTORE': {
                    await _unarchiveItem(step.item, step.type, context);
                    // Atualiza o contexto com os IDs do item restaurado para os próximos passos
                    if (step.type === 'board') context.boardId = step.item.id;
                    if (step.type === 'column') context.columnId = step.item.id;
                    break;
                }
            }
        }
        return true;
    } catch (error) {
        console.error("Erro durante a execução do plano de restauração:", error);
        return false;
    }
}

/**
 * Função auxiliar que efetivamente "desarquiva" um item, atualizando seu estado e salvando-o.
 * @param {object} item - O objeto do item.
 * @param {string} type - O tipo do item.
 * @param {object} context - O contexto da execução do plano, contendo IDs de pais recém-criados/restaurados.
 */
async function _unarchiveItem(item, type, context) {
    item.isArchived = false;
    const fromLocation = item.archiveReason === 'deleted' ? t('archive.tabs.trash') : t('archive.tabs.archived');
    if (!item.activityLog) item.activityLog = [];
    item.activityLog.push({ action: 'restored', userId: currentUser.id, timestamp: new Date().toISOString(), from: fromLocation });
    delete item.archiveReason; delete item.archivedAt; delete item.archivedBy;

    if (type === 'board') {
        // A restauração de um quadro NÃO restaura mais suas colunas em cascata.
        // Apenas o quadro é restaurado. As colunas permanecem no arquivo/lixeira.
        const userProfile = await getUserProfile(item.ownerId);
        const group = item.groupId ? await getGroup(item.groupId) : null;
        if (group) {
            if (!group.boardIds) group.boardIds = [];
            if (!group.boardIds.includes(item.id)) {
                group.boardIds.push(item.id);
            }
            await saveGroup(group);
        } else if (userProfile) {
            if (!userProfile.boardIds) userProfile.boardIds = [];
            if (!userProfile.boardIds.includes(item.id)) {
                userProfile.boardIds.push(item.id);
            }
            await saveUserProfile(userProfile);
        }
        await saveBoard(item);

    } else if (type === 'column') {
        if (context.boardId) item.boardId = context.boardId;
        const board = await getBoard(item.boardId);
        // CORREÇÃO: Garante que a coluna restaurada não seja marcada como arquivada.
        item.isArchived = false;
        if (board) {
            if (!board.columnIds) board.columnIds = [];
            if (!board.columnIds.includes(item.id)) {
                board.columnIds.push(item.id);
            }
            await saveBoard(board);
        }
        await saveColumn(item);

    } else if (type === 'card') {
        if (context.columnId) item.columnId = context.columnId;
        if (context.boardId) item.boardId = context.boardId;
        const column = await getColumn(item.columnId);
        // CORREÇÃO: Garante que o cartão restaurado não seja marcado como arquivado.
        item.isArchived = false;
        if (column) {
            if (!column.cardIds) column.cardIds = [];
            if (!column.cardIds.includes(item.id)) {
                column.cardIds.push(item.id);
            }
            await saveColumn(column);
        }
        await saveCard(item);
    }
}

// --- OUTRAS FUNÇÕES DE MANIPULAÇÃO ---

/**
 * Nova função para mover um item da lixeira para os arquivos.
 */
async function handleMoveToArchived(itemId, type) {
    // Validação de Permissão
    if (!await hasPermissionForItem(itemId, type, 'edit')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

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
    // Validação de Permissão
    if (!await hasPermissionForItem(itemId, type, 'edit')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

    // Reutiliza a lógica existente em kanban.js para consistência
    if (type === 'board') {
        await trashBoard(itemId, currentUser.id);
    } else {
        let item;
        if (type === 'card') item = await getCard(itemId);
        else if (type === 'column') item = await getColumn(itemId);
        
        if (!item) return;
        
        item.archiveReason = 'deleted';
        if (type === 'card') await saveCard(item);
        if (type === 'column') await saveColumn(item);
    }
    
    // Atualiza a UI da página de arquivos
    showFloatingMessage(t('archive.feedback.movedToTrash'), 'success');
    setTimeout(async () => {
        await loadAllArchivedItems();
        renderAllLists();
    }, 500); // Pequeno delay para garantir que a operação de storage concluiu
}

async function handleDeleteCard(cardId) {
    // Validação de Permissão
    if (!await hasPermissionForItem(cardId, 'card', 'delete')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

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
    // Validação de Permissão
    if (!await hasPermissionForItem(columnId, 'column', 'delete')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

    showConfirmationDialog(t('archive.confirm.delete'), async (dialog) => {
        // CORREÇÃO: Usa deleteColumn para apagar apenas a coluna, não seus filhos.
        // A função deleteItem remove apenas o arquivo da coluna, que é o comportamento esperado aqui.
        if (await deleteItem(columnId, 'column')) {
            showDialogMessage(dialog, t('archive.feedback.deleted'), 'success');
            await loadAllArchivedItems();
            renderAllLists();
            return true;
        }
        return false;
    }, null, t('ui.yesDelete'));
}

async function handleDeleteBoard(boardId) {
    // Validação de Permissão
    if (!await hasPermissionForItem(boardId, 'board', 'delete')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

    showConfirmationDialog(t('archive.confirm.delete'), async (dialog) => {
        // CORREÇÃO: Usa deleteBoard para apagar apenas o quadro, não seus filhos.
        if (await deleteItem(boardId, 'board')) {
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
    // Para esvaziar a lixeira, o usuário precisa ser um administrador ou ter uma permissão global.
    // Como essa permissão ainda não existe, vamos permitir por enquanto, mas é um ponto de melhoria.
    // if (!currentUser.isAdmin) {
    //     showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
    //     return;
    // }
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

/**
 * Função auxiliar para verificar a permissão de um item que pode não estar no quadro atual.
 * @param {string} itemId - O ID do item.
 * @param {string} itemType - 'card', 'column', ou 'board'.
 * @param {string} action - 'edit' ou 'delete'.
 * @returns {Promise<boolean>}
 */
async function hasPermissionForItem(itemId, itemType, action) {
    const item = await universalLoad(`${itemType}_${itemId}`);
    if (!item) return false;

    let boardContext;
    let permissionType;

    if (itemType === 'board') {
        boardContext = item;
        permissionType = action === 'edit' ? 'editBoards' : 'editBoards'; // Excluir usa a mesma permissão de editar
    } else {
        boardContext = await getBoard(item.boardId);
        if (!boardContext) return false; // Não pode verificar permissão sem o quadro
        permissionType = action === 'edit' ? 'editColumns' : 'editColumns'; // Para cartões e colunas
    }

    // A função hasPermission já lida com a lógica de admin, dono, etc.
    return await hasPermission(currentUser, boardContext, permissionType);
}