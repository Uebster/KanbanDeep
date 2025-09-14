// js/storage.js (Versão Final Refatorada e Normalizada)

let fs, path, app;

// Verificar se estamos no Electron
const isElectron = () => {
  return typeof process !== 'undefined' && 
         process.versions && 
         process.versions.electron;
};

// Inicializar módulos do Electron se disponíveis
if (isElectron()) {
  try {
    fs = require('fs');
    path = require('path');
    app = require('electron').app;
  } catch (error) {
    console.error('Erro ao carregar módulos do Electron:', error);
  }
}

const STORAGE_PREFIX = 'kanbandeep_'; // Prefixo único para todas as chaves

// ========================================================================
// ===== FUNÇÕES DE ARMAZENAMENTO UNIVERSAL (BASE) =====
// ========================================================================

function ensureDirectoryExists(dirPath) {
  if (!isElectron() || !fs) return true;
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (error) { console.error('Erro ao criar diretório:', error); return false; }
}

function electronSave(key, data) {
  console.log('Salvando no Electron:', key, data);
  if (!isElectron() || !fs || !app) return false;
  try {
    const filePath = path.join(app.getPath('userData'), 'data', `${key}.json`);
    ensureDirectoryExists(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) { console.error(`Erro ao salvar '${key}' no Electron:`, error); return false; }
}

function electronLoad(key) {
  if (!isElectron() || !fs || !app) return null;
  try {
    const filePath = path.join(app.getPath('userData'), 'data', `${key}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) { console.error(`Erro ao carregar '${key}' do Electron:`, error); return null; }
}

function browserSave(key, data) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(data));
    return true;
  } catch (error) { console.error(`Erro ao salvar '${key}' no navegador:`, error); return false; }
}

function browserLoad(key) {
  try {
    const data = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return data ? JSON.parse(data) : null;
  } catch (error) { console.error(`Erro ao carregar '${key}' do navegador:`, error); return null; }
}

export function universalSave(key, data) {
  return isElectron() ? electronSave(key, data) : browserSave(key, data);
}

export function universalLoad(key) {
  return isElectron() ? electronLoad(key) : browserLoad(key);
}

export function universalRemove(key) {
  if (isElectron()) {
    if (!fs || !app) return false;
    try {
      const filePath = path.join(app.getPath('userData'), 'data', `${key}.json`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return true;
    } catch (error) { console.error(`Erro ao remover '${key}' do Electron:`, error); return false; }
  } else {
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      return true;
    } catch (error) { console.error(`Erro ao remover '${key}' do navegador:`, error); return false; }
  }
}

// ========================================================================
// ===== FUNÇÕES DE UTILIDADE INTERNA =====
// ========================================================================

function generateUniqueId(prefix) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// Funções genéricas para salvar/carregar/deletar qualquer tipo de item (usuário, quadro, etc.)
function getItem(id, prefix) { return universalLoad(`${prefix}_${id}`); }
function saveItem(itemData, prefix) {
    if (!itemData.id) itemData.id = generateUniqueId(prefix.slice(0, -1));
    universalSave(`${prefix}_${itemData.id}`, itemData);
    return itemData;
}
function deleteItem(id, prefix) { return universalRemove(`${prefix}_${id}`); }


// ========================================================================
// ===== GERENCIAMENTO DE USUÁRIOS E AUTENTICAÇÃO =====
// ========================================================================

export function getAllUsers() {
    const userIds = universalLoad('users_list') || [];
    return userIds.map(id => getUserProfile(id)).filter(Boolean);
}

export function getUserProfile(userId) {
    return getItem(userId, 'user');
}

export function saveUserProfile(userData) {
    const savedUser = saveItem(userData, 'user');
    const userIds = universalLoad('users_list') || [];
    if (!userIds.includes(savedUser.id)) {
        userIds.push(savedUser.id);
        universalSave('users_list', userIds);
    }
    return savedUser;
}

export function deleteUserProfile(userId) {
    const user = getUserProfile(userId);
    if (user && user.boardIds) {
        user.boardIds.forEach(boardId => deleteBoard(boardId));
    }
    // Adicionar limpeza de grupos e templates aqui no futuro

    const success = deleteItem(userId, 'user');
    if (success) {
        let userIds = universalLoad('users_list') || [];
        userIds = userIds.filter(id => id !== userId);
        universalSave('users_list', userIds);
    }
    return success;
}

export function getCurrentUserId() { return universalLoad('currentUserId'); }
export function setCurrentUserId(userId) { return universalSave('currentUserId', userId); }


// ========================================================================
// ===== GERENCIAMENTO DE QUADROS, COLUNAS E CARTÕES (NORMALIZADO) =====
// ========================================================================

// --- Cartões ---
export function getCard(cardId) { return getItem(cardId, 'card'); }
export function saveCard(cardData) { return saveItem(cardData, 'card'); }
export function deleteCard(cardId) { return deleteItem(cardId, 'card'); }

// --- Colunas ---
export function getColumn(columnId) { return getItem(columnId, 'column'); }
export function saveColumn(columnData) { return saveItem(columnData, 'column'); }
export function deleteColumn(columnId) {
    const column = getColumn(columnId);
    if (column && column.cardIds) {
        column.cardIds.forEach(cardId => deleteCard(cardId));
    }
    return deleteItem(columnId, 'column');
}

// --- Quadros ---
export function getBoard(boardId) { return getItem(boardId, 'board'); }
export function saveBoard(boardData) {
    const savedBoard = saveItem(boardData, 'board');
    // Adiciona referência do quadro ao perfil do dono, se não existir
    if (savedBoard.ownerId) {
        const owner = getUserProfile(savedBoard.ownerId);
        if (owner) {
            if (!owner.boardIds) owner.boardIds = [];
            if (!owner.boardIds.includes(savedBoard.id)) {
                owner.boardIds.push(savedBoard.id);
                saveUserProfile(owner);
            }
        }
    }
    return savedBoard;
}
export function deleteBoard(boardId) {
    const board = getBoard(boardId);
    if (board && board.columnIds) {
        board.columnIds.forEach(columnId => deleteColumn(columnId));
    }
    // Remove a referência do quadro do perfil do dono
    if (board && board.ownerId) {
        const owner = getUserProfile(board.ownerId);
        if (owner && owner.boardIds) {
            owner.boardIds = owner.boardIds.filter(id => id !== boardId);
            saveUserProfile(owner);
        }
    }
    // NOVO: Remove a referência do quadro do grupo, se existir
    if (board && board.groupId) {
        const group = getGroup(board.groupId);
        if (group && group.boardIds) {
            group.boardIds = group.boardIds.filter(id => id !== boardId);
            saveGroup(group);
        }
    }
    return deleteItem(boardId, 'board');
}

/**
 * Carrega todos os dados de um quadro de forma "hidratada".
 * Ele pega o quadro, depois busca cada coluna e cada cartão e os aninha.
 */
export function getFullBoardData(boardId) {
    const board = getBoard(boardId);
    if (!board) return null;

    const hydratedColumns = (board.columnIds || []).map(columnId => {
        const column = getColumn(columnId);
        if (!column) return null;

        const hydratedCards = (column.cardIds || []).map(cardId => getCard(cardId)).filter(Boolean);
        return { ...column, cards: hydratedCards };
    }).filter(Boolean);

    return { ...board, columns: hydratedColumns };
}

// ========================================================================
// ===== GERENCIAMENTO DE GRUPOS =====
// ========================================================================
export function getAllGroups() {
    const groupIds = universalLoad('groups_list') || [];
    return groupIds.map(id => getGroup(id)).filter(Boolean);
}
export function getGroup(groupId) { return getItem(groupId, 'group'); }
export function saveGroup(groupData) {
    const savedGroup = saveItem(groupData, 'group');
    const groupIds = universalLoad('groups_list') || [];
    if (!groupIds.includes(savedGroup.id)) {
        groupIds.push(savedGroup.id);
        universalSave('groups_list', groupIds);
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
        { id: 'system-kanban', name: 'templates.system.kanban.name', icon: '📋', description: 'templates.system.kanban.desc', columns: [ { name: 'A fazer', color: '#e74c3c' }, { name: 'Em Andamento', color: '#f39c12' }, { name: 'Concluído', color: '#2ecc71' }, { name: 'Em Teste', color: '#9b59b6' } ] },
        { id: 'system-leisure', name: 'templates.system.leisure.name', icon: '🎮', description: 'templates.system.leisure.desc', columns: [ { name: 'Quero Fazer', color: '#e74c3c' }, { name: 'Preciso Fazer', color: '#f39c12' }, { name: 'Feito', color: '#2ecc71' } ] },
        { id: 'system-market', name: 'templates.system.market.name', icon: '🛒', description: 'templates.system.market.desc', columns: [ { name: 'Condimentos', color: '#3498db' }, { name: 'Snacks', color: '#e67e22' }, { name: 'Higiene e Limpeza', color: '#f1c40f' }, { name: 'Comprado', color: '#2ecc71' } ] },
        { id: 'system-work', name: 'templates.system.work.name', icon: '💼', description: 'templates.system.work.desc', columns: [ { name: 'Backlog', color: '#95a5a6' }, { name: 'Em andamento', color: '#3498db' }, { name: 'Revisão/Teste', color: '#9b59b6' }, { name: 'Entregue', color: '#2ecc71' } ] },
        { id: 'system-studies', name: 'templates.system.studies.name', icon: '📚', description: 'templates.system.studies.desc', columns: [ { name: 'Atividades', color: '#e84393' }, { name: 'Trabalhos', color: '#6c5ce7' }, { name: 'Provas', color: '#e74c3c' }, { name: 'Entregue', color: '#3498db' } ] }
    ];
}
export function getSystemTagTemplates() {
    // Seus dados de template de etiqueta aqui
    return [
        { id: 'system-tags-prio', name: 'templates.system.tags.default1.name', icon: '🔥', description: 'templates.system.tags.default.desc', tags: [ { name: 'Tag A', color: '#e74c3c' }, { name: 'Tag B', color: '#f39c12' }, { name: 'Tag C', color: '#3498db' }, { name: 'Tag D', color: '#d622cdff' }, 
          { name: 'Tag E', color: '#1019a5ff' }, { name: 'Tag F', color: '#694d1fff' }, { name: 'Tag G', color: '#a7f091ff' }, { name: 'Tag H', color: '#57800bff' } ] },
        { id: 'system-tags-status', name: 'templates.system.tags.default2.name', icon: '📊', description: 'templates.system.tags.default.desc', tags: [ { name: 'Tag E', color: '#34dbd3ff' }, { name: 'Tag F', color: '#2ecc71' }, { name: 'Tag G', color: '#e74c3c' }, { name: 'Tag H', color: '#9b59b6' },
          { name: 'Tag E', color: '#611d16ff' }, { name: 'Tag F', color: '#f39c12' }, { name: 'Tag G', color: '#3498db' }, { name: 'Tag H', color: '#d622cdff' }
         ] }
    ];
}

// --- Templates do Usuário (Persistidos) ---
export function getUserBoardTemplates(userId) {
    const user = getUserProfile(userId);
    return user ? user.boardTemplates || [] : [];
}

export function saveUserBoardTemplates(userId, templates) {
    const user = getUserProfile(userId);
    if (user) {
        user.boardTemplates = templates;
        return saveUserProfile(user) !== null;
    }
    return false;
}

export function getUserTagTemplates(userId) {
    const user = getUserProfile(userId);
    return user ? user.tagTemplates || [] : [];
}

export function saveUserTagTemplates(userId, templates) {
    const user = getUserProfile(userId);
    if (user) {
        user.tagTemplates = templates;
        return saveUserProfile(user) !== null;
    }
    return false;
}

// ========================================================================
// ===== OUTRAS FUNÇÕES (Notificações, Preferências) =====
// ========================================================================
export function getNotifications(userId) { return universalLoad(`user_${userId}_notifications`) || []; }
export function saveNotifications(userId, notifications) { return universalSave(`user_${userId}_notifications`, notifications); }

export function getUserPreferences(userId) {
    const userProfile = getUserProfile(userId);
    return userProfile ? userProfile.preferences || {} : {};
}
export function saveUserPreferences(userId, preferences) {
    const userProfile = getUserProfile(userId);
    if (userProfile) {
        userProfile.preferences = { ...userProfile.preferences, ...preferences };
        return saveUserProfile(userProfile);
    }
    return false;
}

export function deleteGroup(groupId) {
    // Primeiro, vamos obter o grupo para verificar se existem dados associados
    const group = getGroup(groupId);
    if (!group) return false;

    // Aqui você pode adicionar lógica para limpar quaisquer recursos associados ao grupo
    // Por exemplo, se o grupo tem quadros, você pode querer deletá-los também

    // Deletar o grupo
    const success = deleteItem(groupId, 'group');
    if (success) {
        // Remover o grupo da lista de grupos
        let groupIds = universalLoad('groups_list') || [];
        groupIds = groupIds.filter(id => id !== groupId);
        universalSave('groups_list', groupIds);
        
        // NOTA: A variável currentGroup é gerenciada no groups.js, não aqui
        // A limpeza dessa variável deve ser feita no código que chama esta função
    }
    return success;
}

export function addFriend(userId, friendId) {
    const user = getUserProfile(userId);
    const friend = getUserProfile(friendId);
    
    if (user && friend) {
        if (!user.friends) user.friends = [];
        if (!friend.friends) friend.friends = [];
        
        user.friends.push(friendId);
        friend.friends.push(userId);
        
        saveUserProfile(user);
        saveUserProfile(friend);
        return true;
    }
    return false;
}

export function removeFriend(userId, friendId) {
    const user = getUserProfile(userId);
    const friend = getUserProfile(friendId);
    
    if (user && friend) {
        if (user.friends) user.friends = user.friends.filter(id => id !== friendId);
        if (friend.friends) friend.friends = friend.friends.filter(id => id !== userId);
        
        saveUserProfile(user);
        saveUserProfile(friend);
        return true;
    }
    return false;
}

export function followUser(userId, targetId) {
    const user = getUserProfile(userId);
    const target = getUserProfile(targetId);
    
    if (user && target) {
        if (!user.following) user.following = [];
        if (!target.followers) target.followers = [];
        
        user.following.push(targetId);
        target.followers.push(userId);
        
        saveUserProfile(user);
        saveUserProfile(target);
        return true;
    }
    return false;
}

export function unfollowUser(userId, targetId) {
    const user = getUserProfile(userId);
    const target = getUserProfile(targetId);
    
    if (user && target) {
        if (user.following) user.following = user.following.filter(id => id !== targetId);
        if (target.followers) target.followers = target.followers.filter(id => id !== userId);
        
        saveUserProfile(user);
        saveUserProfile(target);
        return true;
    }
    return false;
}