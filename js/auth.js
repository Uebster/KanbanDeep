import {
    getUserProfile,
    saveUserProfile,
    getAllUsers as storageGetAllUsers,
    deleteUserProfile,
    setCurrentUserId,
    getCurrentUserId
} from './storage.js';

export const MASTER_PASSWORD = "87654"; // Senha mestra

/**
 * Obtém o usuário atual logado.
 * @returns {Object|null} Objeto do usuário ou null.
 */
export function getCurrentUser() {
    const userId = getCurrentUserId();
    return userId ? getUserProfile(userId) : null;
}

/**
 * Define o usuário atual.
 * @param {Object} user - Objeto do usuário a ser definido como logado.
 */
export function setCurrentUser(user) {
    return setCurrentUserId(user ? user.id : null);
}

/**
 * Faz logout do usuário atual.
 */
export function logout() {
    return setCurrentUserId(null);
}

/**
 * Obtém todos os usuários cadastrados.
 * @returns {Array} Lista de usuários.
 */
export function getAllUsers() {
    return storageGetAllUsers();
}

/**
 * Salva todos os usuários.
 * @param {Array} users - Lista de usuários a ser salva.
 */
export function saveAllUsers(users) {
    let success = true;
    users.forEach(user => {
        if (!saveUserProfile(user)) {
            success = false;
        }
    });
    return success;
}

/**
 * Valida as credenciais de login.
 * @param {string} username - Nome de usuário ou email.
 * @param {string} password - Senha.
 * @returns {Object|null} Usuário válido ou null.
 */
export function validateCredentials(username, password) {
    const users = getAllUsers();
    return users.find(user => 
        (user.username === username || user.email === username) && 
        user.password === password
    );
}

/**
 * Registra um novo usuário.
 * @param {Object} userData - Dados do usuário a ser registrado.
 * @returns {boolean} True se o registro foi bem-sucedido, false caso contrário.
 */
export function registerUser(userData) {
    const users = getAllUsers();
    const userExists = users.some(user => 
        user.username === userData.username || (userData.email && user.email === userData.email)
    );
    
    if (userExists) {
        console.warn("Tentativa de registrar usuário existente.");
        return false;
    }
    
    // Garante que o usuário tenha todos os campos necessários
    const newUser = {
        id: 'user-' + Date.now(),
        createdAt: new Date().toISOString(),
        lastLogin: null,
        boards: [],
        friends: [],
        followers: [],
        following: [],
        groups: [],
        boardTemplates: [],
        tagTemplates: [],
        preferences: {},
        ...userData // Os dados do formulário sobrescrevem os valores padrão
    };
    
    return saveUserProfile(newUser);
}

/**
 * Atualiza um usuário existente.
 * @param {string} userId - ID do usuário a ser atualizado.
 * @param {Object} updatedData - Dados atualizados.
 * @returns {boolean} True se a atualização foi bem-sucedida, false caso contrário.
 */
export function updateUser(userId, updatedData) {
    const existingUser = getUserProfile(userId);
    if (!existingUser) {
        console.error(`Usuário com ID ${userId} não encontrado para atualização.`);
        return false;
    }
    
    // Faz merge dos dados existentes com os atualizados
    const updatedUser = { 
        ...existingUser, 
        ...updatedData,
        // Mantém campos que não devem ser sobrescritos
        id: existingUser.id,
        createdAt: existingUser.createdAt
    };
    
    const success = saveUserProfile(updatedUser);
    
    // Se o usuário atualizado for o que está logado, atualiza também o currentUserId
    const currentLoggedInUser = getCurrentUser();
    if (success && currentLoggedInUser && currentLoggedInUser.id === userId) {
        setCurrentUser(updatedUser);
    }
    return success;
}


/**
 * Exclui um usuário.
 * @param {string} userId - ID do usuário a ser excluído.
 * @returns {boolean} True se a exclusão foi bem-sucedida, false caso contrário.
 */
export function deleteUser(userId) {
    const success = deleteUserProfile(userId);
    
    // Se o usuário excluído for o logado, faz logout
    const currentLoggedInUser = getCurrentUser();
    if (success && currentLoggedInUser && currentLoggedInUser.id === userId) {
        logout();
    }
    return success;
}

/**
 * Valida a senha mestra.
 * @param {string} password - A senha a ser validada.
 * @returns {boolean} True se a senha for a mestra.
 */
export function validateMasterPassword(password) {
    return password === MASTER_PASSWORD;
}

// As funções getCurrentUserBoards e updateUserBoards foram removidas daqui
// pois a gestão de boards será feita diretamente pelo módulo kanban.js
// usando as funções de board do storage.js.
