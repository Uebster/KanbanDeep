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
    getAllGroups,
    getFullBoardData 
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
    
    // Privacidade da Biografia
    const bioEl = document.getElementById('profile-bio');
    if (viewedUser.privacy === 'private' && currentUser.id !== viewedUser.id) {
        bioEl.textContent = 'A biografia deste usuário é privada.';
        bioEl.style.fontStyle = 'italic';
    } else {
        bioEl.textContent = viewedUser.bio || 'Sem biografia.';
    }
    
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

    // Quadros públicos
    loadPublicBoards();
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
    const content = document.getElementById('personal-info-content');
    content.innerHTML = '';
    let hasContent = false;
    
    if (canViewPersonalInfo()) {
        if (viewedUser.birthdate) {
            content.innerHTML += `<p><strong>Nascimento:</strong> ${new Date(viewedUser.birthdate).toLocaleDateString('pt-BR')}</p>`;
            hasContent = true;
        }
        if (viewedUser.gender) {
            const genderMap = {
                'male': 'Masculino',
                'female': 'Feminino',
                'non-binary': 'Não-binário',
                'other': 'Outro',
                'prefer-not-to-say': 'Prefiro não informar'
            };
            content.innerHTML += `<p><strong>Gênero:</strong> ${genderMap[viewedUser.gender] || viewedUser.gender}</p>`;
            hasContent = true;
        }
        if (viewedUser.location) {
            content.innerHTML += `<p><strong>Localização:</strong> ${viewedUser.location}</p>`;
            hasContent = true;
        }
        if (!hasContent) {
            content.innerHTML = '<p class="privacy-placeholder">ℹ️ Nenhuma informação pessoal fornecida.</p>';
        }
    } else {
        content.innerHTML = '<p class="privacy-placeholder">🔒 As informações pessoais deste usuário são privadas.</p>';
    }
}

function loadContactInfo() {
    const content = document.getElementById('contact-info-content');
    content.innerHTML = '';
    let hasContent = false;

    if (canViewContactInfo()) {
        if (viewedUser.email) {
            content.innerHTML += `<p><strong>Email:</strong> ${viewedUser.email}</p>`;
            hasContent = true;
        }
        if (viewedUser.whatsapp) {
            content.innerHTML += `<p><strong>WhatsApp:</strong> ${viewedUser.whatsapp}</p>`;
            hasContent = true;
        }
        if (viewedUser.linkedin) {
            content.innerHTML += `<p><strong>LinkedIn:</strong> <a href="${viewedUser.linkedin}" target="_blank">${viewedUser.linkedin}</a></p>`;
            hasContent = true;
        }
        if (!hasContent) {
            content.innerHTML = '<p class="privacy-placeholder">ℹ️ Nenhuma informação de contato fornecida.</p>';
        }
    } else {
        content.innerHTML = '<p class="privacy-placeholder">🔒 As informações de contato são visíveis apenas para amigos.</p>';
    }
}

function loadPublicGroups() {
    const container = document.getElementById('public-groups-container');
    if (!container) return;

    if (!canViewSocialInfo()) {
        container.innerHTML = '<p class="privacy-placeholder">🔒 A lista de grupos é visível apenas para amigos.</p>';
        document.getElementById('public-groups-section').style.display = 'block';
        return;
    }

    const allGroups = getAllGroups();
    const publicGroups = allGroups.filter(group => 
        group.access === 'public' && 
        group.memberIds && 
        group.memberIds.includes(viewedUser.id)
    );

    container.innerHTML = ''; // Limpa conteúdo anterior

    if (publicGroups.length === 0) {
        container.innerHTML = '<p class="privacy-placeholder">ℹ️ Este usuário não participa de nenhum grupo público.</p>';
        return;
    }

    publicGroups.forEach(group => {
        const groupCard = document.createElement('div');
        // Reutiliza os estilos de .board-card para consistência visual
        groupCard.className = 'board-card';
        groupCard.dataset.groupId = group.id;
        groupCard.title = `Clique para ver o grupo "${group.name}"`;

        // Calcular estatísticas do grupo
        const memberCount = group.memberIds ? group.memberIds.length : 0;
        const taskCount = (group.boardIds || []).reduce((total, boardId) => {
            const board = getFullBoardData(boardId);
            if (!board) return total;
            return total + board.columns.reduce((boardTotal, column) => boardTotal + column.cards.length, 0);
        }, 0);

        groupCard.innerHTML = `
            <div class="board-icon">${group.icon || '👥'}</div>
            <h4 class="board-name">${group.name}</h4>
            <p class="board-description">${group.description || 'Sem descrição.'}</p>
            <div class="board-stats">
                <span>${memberCount} membros</span>
                <span>${taskCount} tarefas</span>
            </div>
        `;
        groupCard.addEventListener('click', () => {
            localStorage.setItem('openTab', 'statistics');
            localStorage.setItem('groupId', group.id);
            window.location.href = 'groups.html';
        });
        container.appendChild(groupCard);
    });
}

function loadPublicBoards() {
    const container = document.getElementById('public-boards-container');
    if (!container) return;

    if (!canViewSocialInfo()) {
        container.innerHTML = '<p class="privacy-placeholder">🔒 A lista de quadros é visível apenas para amigos.</p>';
        return;
    }

    const userBoards = (viewedUser.boardIds || []).map(id => getFullBoardData(id)).filter(Boolean);
    const publicBoards = userBoards.filter(board => board.visibility === 'public');

    container.innerHTML = '';

    if (publicBoards.length === 0) {
        container.innerHTML = '<p class="privacy-placeholder">ℹ️ Este usuário não possui quadros públicos.</p>';
        return;
    }

    publicBoards.forEach(board => {
        const boardCard = document.createElement('div');
        boardCard.className = 'board-card';
        boardCard.dataset.boardId = board.id;
        boardCard.title = `Clique para ver o quadro "${board.title}"`;

        const totalTasks = board.columns.reduce((acc, col) => acc + col.cards.length, 0);

        boardCard.innerHTML = `
            <div class="board-icon">${board.icon || '📋'}</div>
            <h4 class="board-name">${board.title}</h4>
            <p class="board-description">${board.description || 'Sem descrição.'}</p>
            <div class="board-stats">
                <span>${board.columns.length} colunas</span>
                <span>${totalTasks} tarefas</span>
            </div>
        `;
        boardCard.addEventListener('click', () => {
            localStorage.setItem(`currentBoardId_${currentUser.id}`, board.id);
            window.location.href = 'kanban.html';
        });
        container.appendChild(boardCard);
    });
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

function canViewSocialInfo() {
    if (currentUser.id === viewedUser.id) return true;
    if (viewedUser.privacy === 'public') return true;
    if (viewedUser.privacy === 'friends' && relationshipStatus.isFriend) return true;
    return false;
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
    let buttonsHtml = '';
    
    if (currentUser.id === viewedUser.id) {
        container.innerHTML = '<p>Este é o seu perfil</p>';
        return;
    }
    
    if (relationshipStatus.isFriend) {
        buttonsHtml = `
            <button class="btn" id="message-btn">✉️ Mensagem</button>
            <button class="btn danger" id="unfriend-btn">🗑️ Desfazer Amizade</button>
            <button class="btn" id="follow-btn">${relationshipStatus.isFollowing ? '✅ Seguindo' : '👁️ Seguir'}</button>
        `;
    } else if (relationshipStatus.friendRequestPending) {
        buttonsHtml = `
            <button class="btn cancel" id="cancel-request-btn">⏳ Cancelar</button>
            <button class="btn" id="follow-btn">${relationshipStatus.isFollowing ? '✅ Seguindo' : '👁️ Seguir'}</button>
        `;
    } else {
        buttonsHtml = `
            <button class="btn confirm" id="friend-request-btn">🤝 Add Amigo</button>
            <button class="btn" id="follow-btn">${relationshipStatus.isFollowing ? '✅ Seguindo' : '👁️ Seguir'}</button>
        `;
    }

    // Adiciona o botão de denunciar
    buttonsHtml += `
        <hr style="width:100%; border-color: var(--border); margin: 10px 0 5px;">
        <button class="btn danger" id="report-user-btn">🚩 Denunciar</button>
    `;

    container.innerHTML = buttonsHtml;

    // Anexa os listeners novamente
    if (relationshipStatus.isFriend) {
        document.getElementById('unfriend-btn').addEventListener('click', unfriendUser);
        document.getElementById('message-btn').addEventListener('click', sendMessage);
        document.getElementById('follow-btn').addEventListener('click', toggleFollow);
    } else if (relationshipStatus.friendRequestPending) {
        document.getElementById('cancel-request-btn').addEventListener('click', cancelFriendRequest);
        document.getElementById('follow-btn').addEventListener('click', toggleFollow);
    } else {
        document.getElementById('friend-request-btn').addEventListener('click', () => {
            document.getElementById('friend-request-modal').showModal();
        });
        document.getElementById('follow-btn').addEventListener('click', toggleFollow);
    }
    document.getElementById('report-user-btn')?.addEventListener('click', reportUser);
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
        showConfirmationDialog(
            `Tem certeza que deseja deixar de seguir ${viewedUser.name}?`,
            (dialog) => {
                if (currentUser.following && currentUser.following.includes(viewedUser.id)) {
                    currentUser.following = currentUser.following.filter(id => id !== viewedUser.id);
                }
                if (viewedUser.followers && viewedUser.followers.includes(currentUser.id)) {
                    viewedUser.followers = viewedUser.followers.filter(id => id !== currentUser.id);
                }
                updateUser(currentUser.id, currentUser);
                updateUser(viewedUser.id, viewedUser);
                relationshipStatus.isFollowing = false;
                document.getElementById('stats-followers').textContent = viewedUser.followers ? viewedUser.followers.length : 0;
                updateRelationshipButtons();
                showDialogMessage(dialog, `Você deixou de seguir ${viewedUser.name}.`, 'info');
                return true;
            }
        );
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
        updateUser(currentUser.id, currentUser);
        updateUser(viewedUser.id, viewedUser);
        relationshipStatus.isFollowing = true;
        document.getElementById('stats-followers').textContent = viewedUser.followers ? viewedUser.followers.length : 0;
        updateRelationshipButtons();
    }
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
    showConfirmationDialog(
        `Tem certeza que deseja desfazer a amizade com ${viewedUser.name}?`,
        (dialog) => {
            // Remover da lista de amigos
            currentUser.friends = currentUser.friends.filter(id => id !== viewedUser.id);
            viewedUser.friends = viewedUser.friends.filter(id => id !== currentUser.id);
            
            updateUser(currentUser.id, currentUser);
            updateUser(viewedUser.id, viewedUser);
            
            relationshipStatus.isFriend = false;
            updateRelationshipButtons();
            showDialogMessage(dialog, 'Amizade desfeita.', 'info');
            return true;
        }
    );
}

function reportUser() {
    showConfirmationDialog(
        `Você tem certeza que deseja denunciar ${viewedUser.name}? Uma notificação será enviada para a administração para análise.`,
        (dialog) => {
            // Em uma aplicação real, isso enviaria um evento para o backend.
            // Por enquanto, apenas exibimos uma mensagem de sucesso.
            console.log(`Usuário ${viewedUser.name} (ID: ${viewedUser.id}) denunciado por ${currentUser.name} (ID: ${currentUser.id}).`);
            showDialogMessage(dialog, 'Denúncia enviada. Agradecemos sua colaboração em manter a comunidade segura.', 'success');
            return true;
        },
        null,
        'Sim, Denunciar'
    );
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