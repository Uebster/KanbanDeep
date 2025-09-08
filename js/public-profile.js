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
import { showDialogMessage, initDraggableElements } from './ui-controls.js';
import { 
    addFriendRequestNotification, 
    addFollowNotification,
    addMessageNotification
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
    checkGroupInviteCapability();
    setupHeader();
}

function setupHeader() {
    const currentUser = getCurrentUser();
    if (currentUser) {
        updateUserAvatar(currentUser);
    }
 // Event listeners para o header
    document.getElementById('user-avatar-btn')?.addEventListener('click', (e) => toggleDropdown(e, 'profile-dropdown'));
    document.getElementById('actions-dropdown-btn')?.addEventListener('click', (e) => toggleDropdown(e, 'actions-dropdown'));

    // Navegação
    document.getElementById('switch-user-btn')?.addEventListener('click', () => window.location.href = 'list-users.html');
    document.getElementById('user-profile-btn')?.addEventListener('click', () => window.location.href = 'profile.html');
    document.getElementById('kanban-btn')?.addEventListener('click', () => window.location.href = 'kanban.html');
    document.getElementById('my-groups-btn')?.addEventListener('click', () => window.location.href = 'groups.html');
    document.getElementById('templates-btn')?.addEventListener('click', () => window.location.href = 'templates.html');
    document.getElementById('notifications-btn')?.addEventListener('click', () => window.location.href = 'notifications.html');
    document.getElementById('exit-btn')?.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja fechar o aplicativo?')) {
            window.close();
        }
    });

    // Fechar dropdowns ao clicar fora
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.menu-container')) {
            closeAllDropdowns();
        }
    });
}

function toggleDropdown(e, dropdownId) {
    e.stopPropagation();
    const dropdown = document.getElementById(dropdownId);
    const isVisible = dropdown.classList.contains('show');
    closeAllDropdowns();
    if (!isVisible) {
        dropdown.classList.add('show');
    }
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown.show').forEach(d => d.classList.remove('show'));
}

function updateUserAvatar(user) {
    const avatarImg = document.getElementById('user-avatar');
    if (!avatarImg) return;

    if (user.avatar) {
        avatarImg.src = user.avatar;
    } else {
        // Avatar padrão com iniciais
        const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
        const hue = user.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
        const backgroundColor = `hsl(${hue}, 65%, 65%)`;
        
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
            <rect width="38" height="38" fill="${backgroundColor}" rx="19"/>
            <text x="19" y="24" font-family="Arial" font-size="14" fill="white" text-anchor="middle">${initials}</text>
        </svg>`;
        
        avatarImg.src = 'data:image/svg+xml;base64,' + btoa(svgString);
    }
}

function loadPublicGroups() {
    const section = document.getElementById('public-groups-section');
    if (!section) return;
    
    section.innerHTML = '<h3>Grupos Públicos</h3>';
    
    // Obter todos os grupos
    const allGroups = getAllGroups();
    
    // Filtrar grupos públicos que o usuário visualizado é membro
    const userGroups = allGroups.filter(group => 
        group.memberIds && group.memberIds.includes(viewedUser.id) && group.visibility === 'public'
    );
    
    if (userGroups.length === 0) {
        section.innerHTML += '<p>Este usuário não participa de nenhum grupo público.</p>';
        return;
    }
    
    userGroups.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'group-item';
        groupEl.innerHTML = `
            <h4>${group.name}</h4>
            <p>${group.description || 'Sem descrição'}</p>
        `;
        section.appendChild(groupEl);
    });
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
    
    // Mostrar feedback de sucesso
    feedbackEl.textContent = 'Solicitação enviada! O usuário foi notificado.';
    feedbackEl.classList.add('success', 'show');
    
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
    
    // Limpar feedback anterior
    feedbackEl.className = 'feedback';
    
    // Mostrar feedback de cancelamento
    feedbackEl.textContent = 'Solicitação cancelada.';
    feedbackEl.classList.add('info', 'show');
    
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

// Adicione este event listener na função setupEventListeners
document.getElementById('cancel-friend-request-btn').addEventListener('click', cancelFriendRequest);

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
    const message = prompt(`Enviar mensagem para ${viewedUser.name}:`);
    if (message && message.trim()) {
        // Enviar notificação de mensagem
        addMessageNotification(
            currentUser.name, 
            currentUser.id, 
            viewedUser.id, 
            message.length > 50 ? message.substring(0, 50) + '...' : message
        );
        
        showFloatingMessage('Mensagem enviada!', 'success');
    }
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
    // Similar ao de solicitação de amizade
}

// Inicializar a página quando carregada
document.addEventListener('DOMContentLoaded', initPublicProfilePage);