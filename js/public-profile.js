import { 
    getCurrentUser, 
    updateUser,
    getAllUsers,
    validateMasterPassword 
} from './auth.js';
import { 
    getNotifications,
    saveNotifications,  
    getUserProfile,
    getAllGroups 
} from './storage.js';
import { showDialogMessage, initDraggableElements, showConfirmationDialog, showFloatingMessage } from './ui-controls.js';
import { 
    addFriendRequestNotification, 
    addFollowNotification,
    addMessageNotification,
    addGroupInvitationNotification
} from './notifications.js';

let currentUser = null;
let viewedUser = null;
let relationshipStatus = {
    isFriend: false,
    isFollowing: false,
    friendRequestPending: false,
    friendRequestSent: false
};

export function initPublicProfilePage() {
    currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'list-users.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    
    if (!userId) {
        showFloatingMessage('Usuário não especificado', 'error');
        setTimeout(() => window.location.href = 'list-users.html', 2000);
        return;
    }

    viewedUser = getUserProfile(userId);
    if (!viewedUser) {
        showFloatingMessage('Usuário não encontrado', 'error');
        setTimeout(() => window.location.href = 'list-users.html', 2000);
        return;
    }

    loadUserData();
    setupEventListeners();
    initDraggableElements();
    checkRelationshipStatus();
    loadMutualFriends();
    checkGroupInviteCapability();
}

function loadUserData() {
    // Avatar
    document.getElementById('avatar-image').src = viewedUser.avatar || '';
    document.getElementById('avatar-text').textContent = 
        viewedUser.avatar ? '' : viewedUser.name.charAt(0).toUpperCase();
    
    // Informações básicas
    document.getElementById('profile-username').textContent = `@${viewedUser.username}`;
    document.getElementById('profile-name').textContent = viewedUser.name;
    document.getElementById('profile-bio').textContent = viewedUser.bio || 'Sem biografia';
    
    // Estatísticas
    document.getElementById('stats-boards').textContent = viewedUser.boards?.length || 0;
    document.getElementById('stats-followers').textContent = viewedUser.followers?.length || 0;
    document.getElementById('stats-following').textContent = viewedUser.following?.length || 0;
    document.getElementById('stats-groups').textContent = viewedUser.groups?.length || 0;
    
    // Informações pessoais (conforme privacidade)
    loadPersonalInfo();
    
    // Contatos (conforme privacidade)
    loadContactInfo();
    
    // Grupos públicos
    loadPublicGroups();
}

function loadMutualFriends() {
    const section = document.getElementById('mutual-friends-section');
    const container = document.getElementById('mutual-friends-container');
    if (!section || !container) return;

    // Não mostra para o seu próprio perfil
    if (currentUser.id === viewedUser.id) {
        section.style.display = 'none';
        return;
    }

    const currentUserFriends = currentUser.friends || [];
    const viewedUserFriends = viewedUser.friends || [];

    const mutualFriendIds = currentUserFriends.filter(friendId => viewedUserFriends.includes(friendId));

    if (mutualFriendIds.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = ''; // Limpa conteúdo anterior

    const allUsers = getAllUsers();

    mutualFriendIds.forEach(friendId => {
        const friend = allUsers.find(u => u.id === friendId);
        if (friend) {
            const friendEl = document.createElement('a');
            friendEl.href = `public-profile.html?userId=${friend.id}`;
            friendEl.className = 'mutual-friend-item';
            friendEl.title = friend.name;
            friendEl.innerHTML = `
                <div class="mutual-friend-avatar" style="background-image: url(${friend.avatar || ''})">
                    ${!friend.avatar ? friend.name.charAt(0).toUpperCase() : ''}
                </div>
            `;
            container.appendChild(friendEl);
        }
    });
}

function loadPersonalInfo() {
    const section = document.getElementById('personal-info-section');
    section.innerHTML = '<h3>Informações Pessoais</h3>';
    
    if (canViewPersonalInfo()) {
        if (viewedUser.birthdate) {
            section.innerHTML += `<p><strong>Nascimento:</strong> ${new Date(viewedUser.birthdate).toLocaleDateString('pt-BR')}</p>`;
        }
        if (viewedUser.gender) {
            const genderMap = {
                'male': 'Masculino',
                'female': 'Feminino',
                'non-binary': 'Não-binário',
                'other': 'Outro',
                'prefer-not-to-say': 'Prefiro não informar'
            };
            section.innerHTML += `<p><strong>Gênero:</strong> ${genderMap[viewedUser.gender] || viewedUser.gender}</p>`;
        }
        if (viewedUser.location) {
            section.innerHTML += `<p><strong>Localização:</strong> ${viewedUser.location}</p>`;
        }
    } else {
        section.innerHTML += '<p>As informações pessoais estão privadas</p>';
    }
}

function loadContactInfo() {
    const section = document.getElementById('contacts-section');
    section.innerHTML = '<h3>Contatos</h3>';
    
    if (canViewContactInfo()) {
        if (viewedUser.email) {
            section.innerHTML += `<p><strong>Email:</strong> ${viewedUser.email}</p>`;
        }
        if (viewedUser.whatsapp) {
            section.innerHTML += `<p><strong>WhatsApp:</strong> ${viewedUser.whatsapp}</p>`;
        }
        if (viewedUser.linkedin) {
            section.innerHTML += `<p><strong>LinkedIn:</strong> <a href="${viewedUser.linkedin}" target="_blank">${viewedUser.linkedin}</a></p>`;
        }
    } else {
        section.innerHTML += '<p>As informações de contato estão privadas</p>';
    }
}

function canViewPersonalInfo() {
    if (currentUser.id === viewedUser.id) return true;
    if (viewedUser.privacy === 'public') return true;
    if (viewedUser.privacy === 'friends' && relationshipStatus.isFriend) return true;
    return false;
}

function canViewContactInfo() {
    // Lógica similar à anterior, pode ter configurações diferentes por tipo de informação
    return canViewPersonalInfo(); // Por enquanto usando mesma lógica
}

function setupEventListeners() {
    // Avatar ampliado
    document.getElementById('avatar-preview').addEventListener('click', showAvatarModal);
    
    // Modal de solicitação de amizade
    document.getElementById('send-friend-request-btn').addEventListener('click', sendFriendRequest);
    
    // Botão de cancelar solicitação de amizade
    document.getElementById('cancel-friend-request-btn').addEventListener('click', cancelFriendRequest);
}

function showAvatarModal() {
    const modal = document.getElementById('avatar-modal');
    document.getElementById('modal-avatar').src = viewedUser.avatar || '';
    modal.showModal();
}

function checkRelationshipStatus() {
    // Verificar se já são amigos
    relationshipStatus.isFriend = currentUser.friends?.includes(viewedUser.id) || false;
    
    // Verificar se está seguindo
    relationshipStatus.isFollowing = currentUser.following?.includes(viewedUser.id) || false;
    
    // Verificar se há solicitação de amizade pendente
    const notifications = getNotifications(viewedUser.id);
    relationshipStatus.friendRequestPending = notifications.some(n => 
        n.type === 'friend_request' && 
        n.senderId === currentUser.id && 
        n.status === 'pending'
    );
    
    updateRelationshipButtons();
}

function updateRelationshipButtons() {
    const container = document.getElementById('relationship-actions');
    container.innerHTML = '';
    
    if (currentUser.id === viewedUser.id) {
        container.innerHTML = '<p>Este é o seu perfil</p>';
        return;
    }
    
    if (relationshipStatus.isFriend) {
        container.innerHTML = `
            <button class="btn btn-primary" id="message-btn">✉️ Enviar Mensagem</button>
            <button class="btn btn-danger" id="unfriend-btn">🗑️ Desfazer Amizade</button>
        `;
        document.getElementById('unfriend-btn').addEventListener('click', unfriendUser);
        document.getElementById('message-btn').addEventListener('click', sendMessage);
    } else if (relationshipStatus.friendRequestPending) {
        container.innerHTML = `
            <button class="btn btn-secondary" id="cancel-request-btn">⏳ Solicitação Pendente</button>
            <button class="btn btn-primary" id="follow-btn">${relationshipStatus.isFollowing ? '✅ Seguindo' : '👁️ Seguir'}</button>
        `;
        document.getElementById('cancel-request-btn').addEventListener('click', cancelFriendRequest);
        document.getElementById('follow-btn').addEventListener('click', toggleFollow);
    } else {
        container.innerHTML = `
            <button class="btn btn-primary" id="friend-request-btn">🤝 Solicitar Amizade</button>
            <button class="btn btn-primary" id="follow-btn">${relationshipStatus.isFollowing ? '✅ Seguindo' : '👁️ Seguir'}</button>
        `;
        document.getElementById('friend-request-btn').addEventListener('click', () => {
            document.getElementById('friend-request-modal').showModal();
        });
        document.getElementById('follow-btn').addEventListener('click', toggleFollow);
    }
}

// Modifique a função sendFriendRequest
function sendFriendRequest() {
    const dialog = document.getElementById('friend-request-modal');
    const feedbackEl = dialog.querySelector('.feedback');
    const message = document.getElementById('friend-request-message').value;
    
    // Limpar feedback anterior
    feedbackEl.className = 'feedback';
    
    // Usar a nova função de notificação
    addFriendRequestNotification(currentUser.name, currentUser.id, viewedUser.id);
    
    relationshipStatus.friendRequestPending = true;
    updateRelationshipButtons();
    
    showDialogMessage(dialog, 'Solicitação enviada! O usuário foi notificado.', 'success');
    
    // Desabilitar botões temporariamente
    const sendBtn = document.getElementById('send-friend-request-btn');
    const cancelBtn = document.getElementById('cancel-friend-request-btn');
    sendBtn.disabled = true;
    cancelBtn.disabled = true;
    
    // Fechar o diálogo após 2 segundos
    setTimeout(() => {
        dialog.close();
        // Reabilitar botões
        sendBtn.disabled = false;
        cancelBtn.disabled = false;
        // Limpar mensagem
        feedbackEl.className = 'feedback';
        document.getElementById('friend-request-message').value = '';
    }, 2000);
}

// Adicione esta função para cancelar a solicitação
function cancelFriendRequest() {
    const dialog = document.getElementById('friend-request-modal');
    const feedbackEl = dialog.querySelector('.feedback');
    showDialogMessage(dialog, 'Solicitação cancelada.', 'info');
    
    // Desabilitar botões temporariamente
    const sendBtn = document.getElementById('send-friend-request-btn');
    const cancelBtn = document.getElementById('cancel-friend-request-btn');
    sendBtn.disabled = true;
    cancelBtn.disabled = true;
    
    // Fechar o diálogo após 2 segundos
    setTimeout(() => {
        dialog.close();
        // Reabilitar botões
        sendBtn.disabled = false;
        cancelBtn.disabled = false;
        // Limpar mensagem
        feedbackEl.className = 'feedback';
        document.getElementById('friend-request-message').value = '';
    }, 2000);
}

function toggleFollow() {
    if (relationshipStatus.isFollowing) {
        // Deixar de seguir
        if (currentUser.following && currentUser.following.includes(viewedUser.id)) {
            currentUser.following = currentUser.following.filter(id => id !== viewedUser.id);
        }
        if (viewedUser.followers && viewedUser.followers.includes(currentUser.id)) {
            viewedUser.followers = viewedUser.followers.filter(id => id !== currentUser.id);
        }
    } else {
        // Seguir
        if (!currentUser.following) currentUser.following = [];
        if (!viewedUser.followers) viewedUser.followers = [];
        
        // Verificar se já não está seguindo para evitar duplicação
        if (!currentUser.following.includes(viewedUser.id)) {
            currentUser.following.push(viewedUser.id);
        }
        if (!viewedUser.followers.includes(currentUser.id)) {
            viewedUser.followers.push(currentUser.id);
        }
        
        // Enviar notificação de seguimento
        addFollowNotification(currentUser.name, currentUser.id, viewedUser.id);
    }
    
    // Atualizar os usuários no armazenamento
    updateUser(currentUser.id, currentUser);
    updateUser(viewedUser.id, viewedUser);
    
    // Atualizar o estado e a interface
    relationshipStatus.isFollowing = !relationshipStatus.isFollowing;
    
    // Atualizar a contagem de seguidores na UI
    document.getElementById('stats-followers').textContent = viewedUser.followers ? viewedUser.followers.length : 0;
    
    updateRelationshipButtons();
}

function sendMessage() {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Enviar Mensagem para ${viewedUser.name}</h3>
        <div class="form-group">
            <textarea id="private-message-textarea" placeholder="Escreva sua mensagem..." rows="5"></textarea>
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn btn-secondary">Cancelar</button>
            <button class="btn btn-primary">Enviar</button>
        </div>
    `;

    document.body.appendChild(dialog);
    initDraggableElements(); // Torna o diálogo arrastável
    dialog.showModal();

    const textarea = dialog.querySelector('#private-message-textarea');
    const sendBtn = dialog.querySelector('.btn-primary');
    const cancelBtn = dialog.querySelector('.btn-secondary');

    const closeDialog = () => {
        dialog.close();
        dialog.remove();
    };

    cancelBtn.addEventListener('click', closeDialog);

    sendBtn.addEventListener('click', () => {
        const message = textarea.value.trim();
        if (!message) {
            showDialogMessage(dialog, 'A mensagem não pode estar vazia.', 'error');
            return;
        }

        addMessageNotification(currentUser.name, currentUser.id, viewedUser.id, message.length > 50 ? message.substring(0, 50) + '...' : message);

        showDialogMessage(dialog, 'Mensagem enviada com sucesso!', 'success');
        sendBtn.disabled = true;
        cancelBtn.disabled = true;
        setTimeout(closeDialog, 1500);
    });
}

function unfriendUser() {
    // Remover da lista de amigos
    currentUser.friends = currentUser.friends.filter(id => id !== viewedUser.id);
    viewedUser.friends = viewedUser.friends.filter(id => id !== currentUser.id);
    
    updateUser(currentUser.id, currentUser);
    updateUser(viewedUser.id, viewedUser);
    
    relationshipStatus.isFriend = false;
    updateRelationshipButtons();
}

function checkGroupInviteCapability() {
    // Verificar se o usuário atual é admin de algum grupo
    const userGroups = currentUser.groups || [];
    const hasAdminGroups = userGroups.some(group => group.role === 'admin');
    
    if (hasAdminGroups && !relationshipStatus.isFriend) {
        document.getElementById('group-invite-section').style.display = 'block';
        document.getElementById('group-invite-btn').addEventListener('click', showGroupInviteDialog);
    }
}

function showGroupInviteDialog() {
    // Implementar diálogo para selecionar grupo e enviar convite
    const adminGroups = getAllGroups().filter(g => g.adminId === currentUser.id);

    if (adminGroups.length === 0) {
        showFloatingMessage('Você não administra nenhum grupo para poder convidar.', 'warning');
        return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Convidar para Grupo</h3>
        <p>Selecione um dos seus grupos para convidar <strong>${viewedUser.name}</strong>.</p>
        <div class="form-group">
            <label for="group-invite-select">Seus Grupos:</label>
            <select id="group-invite-select">
                ${adminGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
            </select>
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn btn-secondary">Cancelar</button>
            <button class="btn btn-primary">Enviar Convite</button>
        </div>
    `;

    document.body.appendChild(dialog);
    initDraggableElements();
    dialog.showModal();

    const confirmBtn = dialog.querySelector('.btn-primary');
    const cancelBtn = dialog.querySelector('.btn-secondary');
    const groupSelect = dialog.querySelector('#group-invite-select');

    const closeDialog = () => {
        dialog.close();
        dialog.remove();
    };

    cancelBtn.addEventListener('click', closeDialog);

    confirmBtn.addEventListener('click', () => {
        const groupId = groupSelect.value;
        const group = adminGroups.find(g => g.id === groupId);

        if (!group) {
            showDialogMessage(dialog, 'Grupo inválido selecionado.', 'error');
            return;
        }

        if (group.memberIds && group.memberIds.includes(viewedUser.id)) {
            showDialogMessage(dialog, `${viewedUser.name} já é membro deste grupo.`, 'info');
            return;
        }

        // Envia a notificação de convite
        addGroupInvitationNotification(group.name, group.id, currentUser.name, currentUser.id, viewedUser.id);

        showDialogMessage(dialog, `Convite para o grupo "${group.name}" enviado!`, 'success');
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        setTimeout(closeDialog, 2000);
    });
}