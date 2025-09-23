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
export async function getCurrentUser() {
    const userId = await getCurrentUserId();
    return userId ? await getUserProfile(userId) : null;
}

/**
 * Define o usuário atual.
 * @param {Object} user - Objeto do usuário a ser definido como logado.
 */
export async function setCurrentUser(user) {
    return await setCurrentUserId(user ? user.id : null);
}

/**
 * Faz logout do usuário atual.
 */
export async function logout() {
    // Também limpa o sessionStorage para acesso rápido
    sessionStorage.removeItem('currentUser');
    return await setCurrentUserId(null);
}

/**
 * Obtém todos os usuários cadastrados.
 * @returns {Array} Lista de usuários.
 */
export function getAllUsers() {
    return storageGetAllUsers(); // Esta função já é assíncrona no storage.js
}

/**
 * Registra um novo usuário.
 * @param {Object} userData - Dados do usuário a ser registrado.
 * @returns {Promise<boolean>} True se o registro foi bem-sucedido, false caso contrário.
 */
export async function registerUser(userData) {
    const users = await getAllUsers();
    const userExists = users.some(user => 
        user.username === userData.username || (userData.email && user.email === userData.email)
    );
    
    if (userExists) {
        console.warn("Attempt to register existing user.");
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
        ...userData // Os dados do formulário sobrescrevem os valores padrão
    };
    
    return await saveUserProfile(newUser);
}

/**
 * Atualiza um usuário existente.
 * @param {string} userId - ID do usuário a ser atualizado.
 * @param {Object} updatedData - Dados atualizados.
 * @returns {Promise<boolean>} True se a atualização foi bem-sucedida, false caso contrário.
 */
export async function updateUser(userId, updatedData) {
    const existingUser = await getUserProfile(userId);
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
    
    const success = await saveUserProfile(updatedUser);
    
    // Se o usuário atualizado for o que está logado, atualiza também o currentUserId
    const currentLoggedInUser = await getCurrentUser();
    if (success && currentLoggedInUser && currentLoggedInUser.id === userId) {
        setCurrentUser(updatedUser);
    }
    return success;
}


/**
 * Exclui um usuário.
 * @param {string} userId - ID do usuário a ser excluído.
 * @returns {Promise<boolean>} True se a exclusão foi bem-sucedida, false caso contrário.
 */
export async function deleteUser(userId) {
    const success = await deleteUserProfile(userId);
    
    // Se o usuário excluído for o logado, faz logout
    const currentLoggedInUser = await getCurrentUser();
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
