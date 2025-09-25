// js/storage.js (Versão Final Refatorada e Normalizada)

// ========================================================================
// ===== FUNÇÕES DE ARMAZENAMENTO UNIVERSAL (BASE) =====
// ========================================================================

/**
 * Este módulo agora usa a API exposta pelo preload.js para se comunicar
 * com o processo principal, que é o único que pode acessar o sistema de arquivos.
 * Todas as funções de I/O agora são assíncronas.
 */

/**
 * Salva dados em um arquivo JSON no diretório de dados do aplicativo.
 * @param {string} key - O nome do arquivo (sem extensão).
 * @param {any} data - Os dados a serem salvos.
 * @returns {Promise<void>}
 */
export async function universalSave(key, data) {
  await window.electronAPI.saveFile(key, data);
}

/**
 * Carrega dados de um arquivo JSON.
 * @param {string} key - O nome do arquivo (sem extensão).
 * @returns {Promise<any|null>} Os dados do arquivo ou null se não existir.
 */
export async function universalLoad(key) {
  return await window.electronAPI.loadFile(key);
}

/**
 * Remove um arquivo de dados.
 * @param {string} key - O nome do arquivo (sem extensão).
 * @returns {Promise<boolean>}
 */
export async function universalRemove(key) {
  return await window.electronAPI.deleteFile(key);
}

// ========================================================================
// ===== FUNÇÕES DE UTILIDADE INTERNA =====
// ========================================================================

function generateUniqueId(prefix) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// Funções genéricas para salvar/carregar/deletar qualquer tipo de item (usuário, quadro, etc.)
async function getItem(id, prefix) { return await universalLoad(`${prefix}_${id}`); }
async function saveItem(itemData, prefix) {
    if (!itemData.id) {
        itemData.id = generateUniqueId(prefix.slice(0, -1));
        // Garante que novos cartões tenham um log de atividades, se ele ainda não existir.
        if (prefix === 'card' && !itemData.activityLog) itemData.activityLog = [];
    }
    await universalSave(`${prefix}_${itemData.id}`, itemData);
    return itemData;
}
async function deleteItem(id, prefix) { return await universalRemove(`${prefix}_${id}`); }


// ========================================================================
// ===== GERENCIAMENTO DE USUÁRIOS E AUTENTICAÇÃO =====
// ========================================================================

export async function getAllUsers() {
    const userIds = await universalLoad('users_list') || [];
    const userPromises = userIds.map(id => getUserProfile(id));
    return (await Promise.all(userPromises)).filter(Boolean);
}

export async function getUserProfile(userId) {
    return await getItem(userId, 'user');
}

export async function saveUserProfile(userData) {
    const savedUser = await saveItem(userData, 'user');
    const userIds = await universalLoad('users_list') || [];
    if (!userIds.includes(savedUser.id)) {
        userIds.push(savedUser.id);
        await universalSave('users_list', userIds);
    }
    return savedUser;
}

export async function deleteUserProfile(userId) {
    const user = await getUserProfile(userId);
    if (user && user.boardIds) {
        await Promise.all(user.boardIds.map(boardId => deleteBoard(boardId)));
    }
    // Adicionar limpeza de grupos e templates aqui no futuro

    const success = await deleteItem(userId, 'user');
    if (success) {
        let userIds = await universalLoad('users_list') || [];
        userIds = userIds.filter(id => id !== userId);
        await universalSave('users_list', userIds);
    }
    return success;
}

export async function getCurrentUserId() { return await universalLoad('currentUserId'); }
export async function setCurrentUserId(userId) { return await universalSave('currentUserId', userId); }


// ========================================================================
// ===== GERENCIAMENTO DE QUADROS, COLUNAS E CARTÕES (NORMALIZADO) =====
// ========================================================================

// --- Cartões ---
export async function getCard(cardId) { return await getItem(cardId, 'card'); }
export async function saveCard(cardData) { return await saveItem(cardData, 'card'); }
export async function deleteCard(cardId) { return await deleteItem(cardId, 'card'); }
/**
 * Arquiva um cartão, marcando-o como arquivado em vez de deletá-lo.
 * @param {string} cardId - O ID do cartão a ser arquivado.
 * @param {string} userId - O ID do usuário que está arquivando.
 * @param {string} reason - O motivo do arquivamento ('archived' ou 'deleted' para lixeira).
 * @param {string|null} columnId - O ID da coluna original do cartão.
 */
export async function archiveCard(cardId, userId, reason = 'archived', context = {}) {
    const card = await getCard(cardId);
    if (!card) return null;
    card.isArchived = true;
    card.archivedAt = new Date().toISOString();
    card.archivedBy = userId;
    card.archiveReason = reason;
    
    // Store original context for intelligent restore
    card.columnId = context.columnId;
    card.boardId = context.boardId;
    card.columnTitle = context.columnTitle;
    card.boardTitle = context.boardTitle;

    return await saveCard(card);
}

// --- Colunas ---
export async function getColumn(columnId) { return await getItem(columnId, 'column'); }
export async function saveColumn(columnData) { return await saveItem(columnData, 'column'); }
export async function deleteColumn(columnId) {
    const column = await getColumn(columnId);
    if (column && column.cardIds) {
        // Deleta apenas os cartões que NÃO estão arquivados.
        const cards = await Promise.all(column.cardIds.map(cardId => getCard(cardId)));
        const unarchivedCards = cards.filter(card => card && !card.isArchived);
        await Promise.all(unarchivedCards.map(card => deleteCard(card.id)));
    }
    return await deleteItem(columnId, 'column');
}

// --- Quadros ---
export async function getBoard(boardId) { return await getItem(boardId, 'board'); }
export async function saveBoard(boardData) {
    const savedBoard = await saveItem(boardData, 'board');
    // Adiciona referência do quadro ao perfil do dono, se não existir
    if (savedBoard.ownerId) {
        const owner = await getUserProfile(savedBoard.ownerId);
        if (owner) {
            if (!owner.boardIds) owner.boardIds = [];
            if (!owner.boardIds.includes(savedBoard.id)) {
                owner.boardIds.push(savedBoard.id);
                await saveUserProfile(owner);
            }
        }
    }
    return savedBoard;
}
export async function deleteBoard(boardId) {
    const board = await getBoard(boardId);
    if (board && board.columnIds) {
        // Deleta apenas as colunas que NÃO estão arquivadas.
        const columns = await Promise.all(board.columnIds.map(columnId => getColumn(columnId)));
        const unarchivedColumns = columns.filter(col => col && !col.isArchived);
        await Promise.all(unarchivedColumns.map(col => deleteColumn(col.id)));
    }
    // Remove a referência do quadro do perfil do dono
    if (board && board.ownerId) {
        const owner = await getUserProfile(board.ownerId);
        if (owner && owner.boardIds) {
            owner.boardIds = owner.boardIds.filter(id => id !== boardId);
            await saveUserProfile(owner);
        }
    }
    // NOVO: Remove a referência do quadro do grupo, se existir
    if (board && board.groupId) {
        const group = await getGroup(board.groupId);
        if (group && group.boardIds) {
            group.boardIds = group.boardIds.filter(id => id !== boardId);
            await saveGroup(group);
        }
    }
    return await deleteItem(boardId, 'board');
}

export async function archiveBoard(boardId, userId, reason = 'archived') {
    const board = await getBoard(boardId);
    if (!board) return null;

    board.isArchived = true;
    board.archiveReason = reason;
    board.archivedAt = new Date().toISOString();
    board.archivedBy = userId;
    await saveBoard(board);

    // A lógica de mover o ID do quadro do perfil do usuário será tratada no kanban.js
    // para ter acesso ao currentUser.
    return board;
}

/**
 * Carrega todos os dados de um quadro de forma "hidratada".
 * Ele pega o quadro, depois busca cada coluna e cada cartão e os aninha.
 * @param {string} boardId O ID do quadro a ser carregado.
 * @param {boolean} [includeArchived=false] Se verdadeiro, inclui colunas e cartões arquivados.
 */
export async function getFullBoardData(boardId, includeArchived = false) {
    const board = await getBoard(boardId);
    if (!board) return null;

    // Decide quais colunas carregar com base no parâmetro
    const columnIdsToLoad = includeArchived 
        ? [...(board.columnIds || []), ...(board.archivedColumnIds || [])]
        : (board.columnIds || []);

    const hydratedColumns = (await Promise.all(columnIdsToLoad.map(async (columnId) => {
        const column = await getColumn(columnId);
        if (!column) return null;
        
        // Pega os cartões ativos da coluna
        const activeCards = (await Promise.all((column.cardIds || []).map(cardId => getCard(cardId)))).filter(Boolean);

        let allCardsForColumn = activeCards;

        // Se for para incluir arquivados, busca todos os cartões que já pertenceram a esta coluna
        if (includeArchived) {
            const allFileNames = await window.electronAPI.listFiles();
            const cardKeys = allFileNames.filter(name => name.startsWith('card_'));
            const archivedCardsForThisColumn = (await Promise.all(cardKeys.map(key => universalLoad(key)))).filter(card => card && card.isArchived && card.columnId === columnId);
            
            // Combina e remove duplicatas
            const cardMap = new Map();
            [...activeCards, ...archivedCardsForThisColumn].forEach(card => cardMap.set(card.id, card));
            allCardsForColumn = Array.from(cardMap.values());
        }

        const hydratedCards = allCardsForColumn.filter(card => card && (includeArchived || !card.isArchived));
        return { ...column, cards: hydratedCards };
    }))).filter(Boolean);

    return { ...board, columns: hydratedColumns };
}

// ========================================================================
// ===== GERENCIAMENTO DE GRUPOS =====
// ========================================================================
export async function getAllGroups() {
    const groupIds = await universalLoad('groups_list') || [];
    return (await Promise.all(groupIds.map(id => getGroup(id)))).filter(Boolean);
}
export async function getGroup(groupId) { return await getItem(groupId, 'group'); }
export async function saveGroup(groupData) {
    const savedGroup = await saveItem(groupData, 'group');
    const groupIds = await universalLoad('groups_list') || [];
    if (!groupIds.includes(savedGroup.id)) {
        groupIds.push(savedGroup.id);
        await universalSave('groups_list', groupIds);
    }
    return savedGroup;
}
// ... (função deleteGroup pode ser adicionada no futuro)

// ========================================================================
// ===== GERENCIAMENTO DE TEMPLATES =====
// ========================================================================

// --- Templates do Sistema (Hardcoded) ---
export function getSystemBoardTemplates() {
    // Seus dados de template de quadro aqui
    return [
        { id: 'system-kanban', name: 'templates.system.kanban.name', icon: '📋', description: 'templates.system.kanban.desc', columns: [
            { name: 'templates.system.kanban.column.todo', color: '#e74c3c' },
            { name: 'templates.system.kanban.column.inprogress', color: '#f39c12' },
            { name: 'templates.system.kanban.column.done', color: '#2ecc71' },
            { name: 'templates.system.kanban.column.test', color: '#9b59b6' }
        ]},
        { id: 'system-leisure', name: 'templates.system.leisure.name', icon: '🎮', description: 'templates.system.leisure.desc', columns: [
            { name: 'templates.system.leisure.column.want', color: '#e74c3c' },
            { name: 'templates.system.leisure.column.need', color: '#f39c12' },
            { name: 'templates.system.leisure.column.done', color: '#2ecc71' }
        ]},
        { id: 'system-market', name: 'templates.system.market.name', icon: '🛒', description: 'templates.system.market.desc', columns: [
            { name: 'templates.system.market.column.seasonings', color: '#3498db' },
            { name: 'templates.system.market.column.snacks', color: '#e67e22' },
            { name: 'templates.system.market.column.hygiene', color: '#f1c40f' },
            { name: 'templates.system.market.column.bought', color: '#2ecc71' }
        ]},
        { id: 'system-work', name: 'templates.system.work.name', icon: '💼', description: 'templates.system.work.desc', columns: [
            { name: 'templates.system.work.column.backlog', color: '#95a5a6' },
            { name: 'templates.system.work.column.inprogress', color: '#3498db' },
            { name: 'templates.system.work.column.review', color: '#9b59b6' },
            { name: 'templates.system.work.column.delivered', color: '#2ecc71' }
        ]},
        { id: 'system-studies', name: 'templates.system.studies.name', icon: '📚', description: 'templates.system.studies.desc', columns: [
            { name: 'templates.system.studies.column.activities', color: '#e84393' },
            { name: 'templates.system.studies.column.papers', color: '#6c5ce7' },
            { name: 'templates.system.studies.column.exams', color: '#e74c3c' },
            { name: 'templates.system.studies.column.delivered', color: '#3498db' }
        ]}
    ];
}
export function getSystemTagTemplates() {
    // Seus dados de template de etiqueta aqui
    return [
        { id: 'system-tags-prio', name: 'templates.system.tags.default1.name', icon: '🔥', description: 'templates.system.tags.default.desc', tags: [ { name: 'Tag A', color: '#e74c3c' }, { name: 'Tag B', color: '#f39c12' }, { name: 'Tag C', color: '#3498db' }, { name: 'Tag D', color: '#d622cdff' }, 
          { name: 'Tag E', color: '#1019a5ff' }, { name: 'Tag F', color: '#694d1fff' }, { name: 'Tag G', color: '#a7f091ff' }, { name: 'Tag H', color: '#57800bff' } ] },
        { id: 'system-tags-status', name: 'templates.system.tags.default2.name', icon: '📊', description: 'templates.system.tags.default.desc', tags: [ { name: 'Tag A', color: '#34dbd3ff' }, { name: 'Tag B', color: '#2ecc71' }, { name: 'Tag C', color: '#e74c3c' }, { name: 'Tag D', color: '#9b59b6' },
          { name: 'Tag E', color: '#611d16ff' }, { name: 'Tag F', color: '#f39c12' }, { name: 'Tag G', color: '#3498db' }, { name: 'Tag H', color: '#d622cdff' }
         ] }
    ];
}

// --- Templates do Usuário (Persistidos) ---
export async function getUserBoardTemplates(userId) {
    const user = await getUserProfile(userId);
    return user ? user.boardTemplates || [] : [];
}

export async function saveUserBoardTemplates(userId, templates) {
    const user = await getUserProfile(userId);
    if (user) {
        user.boardTemplates = templates;
        return await saveUserProfile(user) !== null;
    }
    return false;
}

export async function getUserTagTemplates(userId) {
    const user = await getUserProfile(userId);
    return user ? user.tagTemplates || [] : [];
}

export async function saveUserTagTemplates(userId, templates) {
    const user = await getUserProfile(userId);
    if (user) {
        user.tagTemplates = templates;
        return await saveUserProfile(user) !== null;
    }
    return false;
}

// ========================================================================
// ===== OUTRAS FUNÇÕES (Notificações, Preferências) =====
// ========================================================================
export async function getNotifications(userId) { return await universalLoad(`user_${userId}_notifications`) || []; }
export async function saveNotifications(userId, notifications) { return await universalSave(`user_${userId}_notifications`, notifications); }

export async function getUserPreferences(userId) {
    const userProfile = await getUserProfile(userId);
    return userProfile ? userProfile.preferences || {} : {};
}
export async function saveUserPreferences(userId, preferences) {
    const userProfile = await getUserProfile(userId);
    if (userProfile) {
        userProfile.preferences = { ...userProfile.preferences, ...preferences };
        return await saveUserProfile(userProfile);
    }
    return false;
}

export async function deleteGroup(groupId) {
    // Primeiro, vamos obter o grupo para verificar se existem dados associados
    const group = await getGroup(groupId);
    if (!group) return false;

    // Aqui você pode adicionar lógica para limpar quaisquer recursos associados ao grupo
    // Por exemplo, se o grupo tem quadros, você pode querer deletá-los também

    // Deletar o grupo
    const success = await deleteItem(groupId, 'group');
    if (success) {
        // Remover o grupo da lista de grupos
        let groupIds = await universalLoad('groups_list') || [];
        groupIds = groupIds.filter(id => id !== groupId);
        await universalSave('groups_list', groupIds);
        
        // NOTA: A variável currentGroup é gerenciada no groups.js, não aqui
        // A limpeza dessa variável deve ser feita no código que chama esta função
    }
    return success;
}

export async function addFriend(userId, friendId) {
    const user = await getUserProfile(userId);
    const friend = await getUserProfile(friendId);
    
    if (user && friend) {
        if (!user.friends) user.friends = [];
        if (!friend.friends) friend.friends = [];
        
        user.friends.push(friendId);
        friend.friends.push(userId);
        
        await saveUserProfile(user);
        await saveUserProfile(friend);
        return true;
    }
    return false;
}

export async function removeFriend(userId, friendId) {
    const user = await getUserProfile(userId);
    const friend = await getUserProfile(friendId);
    
    if (user && friend) {
        if (user.friends) user.friends = user.friends.filter(id => id !== friendId);
        if (friend.friends) friend.friends = friend.friends.filter(id => id !== userId);
        
        await saveUserProfile(user);
        await saveUserProfile(friend);
        return true;
    }
    return false;
}

export async function followUser(userId, targetId) {
    const user = await getUserProfile(userId);
    const target = await getUserProfile(targetId);
    
    if (user && target) {
        if (!user.following) user.following = [];
        if (!target.followers) target.followers = [];
        
        user.following.push(targetId);
        target.followers.push(userId);
        
        await saveUserProfile(user);
        await saveUserProfile(target);
        return true;
    }
    return false;
}

export async function unfollowUser(userId, targetId) {
    const user = await getUserProfile(userId);
    const target = await getUserProfile(targetId);
    
    if (user && target) {
        if (user.following) user.following = user.following.filter(id => id !== targetId);
        if (target.followers) target.followers = target.followers.filter(id => id !== userId);
        
        await saveUserProfile(user);
        await saveUserProfile(target);
        return true;
    }
    return false;
}