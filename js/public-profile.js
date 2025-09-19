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
import { showDialogMessage, initDraggableElements, showConfirmationDialog, showFloatingMessage, showPrivateMessageDialog } from './ui-controls.js';
import { 
    addFriendRequestNotification, 
    addFollowNotification,
    addMessageNotification,
    addGroupInvitationNotification
} from './notifications.js';
import { t, initTranslations } from './translations.js';

let currentUser = null;
let viewedUser = null;
let relationshipStatus = {
    isFriend: false,
    isFollowing: false,
    friendRequestPending: false,
    friendRequestSent: false
};

export async function initPublicProfilePage() {
    currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'list-users.html';
        return;
    }

    await initTranslations();

    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    
    if (!userId) {
        showFloatingMessage(t('publicProfile.error.userNotSpecified'), 'error');
        setTimeout(() => window.location.href = 'list-users.html', 2000);
        return;
    }

    viewedUser = getUserProfile(userId);
    if (!viewedUser) {
        showFloatingMessage(t('publicProfile.error.userNotFound'), 'error');
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
        bioEl.textContent = t('publicProfile.bio.private');
        bioEl.style.fontStyle = 'italic';
    } else {
        bioEl.textContent = viewedUser.bio || t('publicProfile.bio.none');
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
            content.innerHTML += `<p><strong>${t('createUser.label.birthdate')}:</strong> ${new Date(viewedUser.birthdate).toLocaleDateString()}</p>`;
            hasContent = true;
        }
        if (viewedUser.gender) {
            const genderMap = {
                'male': t('createUser.gender.male'),
                'female': t('createUser.gender.female'),
                'non-binary': t('createUser.gender.nonBinary'),
                'other': t('createUser.gender.other'),
                'prefer-not-to-say': t('createUser.gender.preferNotToSay')
            };
            content.innerHTML += `<p><strong>${t('createUser.label.gender')}:</strong> ${genderMap[viewedUser.gender] || viewedUser.gender}</p>`;
            hasContent = true;
        }
        if (viewedUser.location) {
            content.innerHTML += `<p><strong>${t('createUser.label.location')}:</strong> ${viewedUser.location}</p>`;
            hasContent = true;
        }
        if (!hasContent) {
            content.innerHTML = `<p class="privacy-placeholder">${t('publicProfile.personalInfo.none')}</p>`;
        }
    } else {
        content.innerHTML = `<p class="privacy-placeholder">${t('publicProfile.personalInfo.private')}</p>`;
    }
}

function loadContactInfo() {
    const content = document.getElementById('contact-info-content');
    content.innerHTML = '';
    let hasContent = false;

    if (canViewContactInfo()) {
        if (viewedUser.email) {
            content.innerHTML += `<p><strong>${t('createUser.label.email')}:</strong> ${viewedUser.email}</p>`;
            hasContent = true;
        }
        if (viewedUser.whatsapp) {
            content.innerHTML += `<p><strong>${t('createUser.label.whatsapp')}:</strong> ${viewedUser.whatsapp}</p>`;
            hasContent = true;
        }
        if (viewedUser.linkedin) {
            content.innerHTML += `<p><strong>${t('createUser.label.linkedin')}:</strong> <a href="${viewedUser.linkedin}" target="_blank">${viewedUser.linkedin}</a></p>`;
            hasContent = true;
        }
        if (!hasContent) {
            content.innerHTML = `<p class="privacy-placeholder">${t('publicProfile.contactInfo.none')}</p>`;
        }
    } else {
        content.innerHTML = `<p class="privacy-placeholder">${t('publicProfile.contactInfo.private')}</p>`;
    }
}

function loadPublicGroups() {
    const container = document.getElementById('public-groups-container');
    if (!container) return;

    if (!canViewSocialInfo()) {
        container.innerHTML = `<p class="privacy-placeholder">${t('publicProfile.groups.private')}</p>`;
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
        container.innerHTML = `<p class="privacy-placeholder">${t('publicProfile.groups.none')}</p>`;
        return;
    }

    publicGroups.forEach(group => {
        const groupCard = document.createElement('div');
        // Reutiliza os estilos de .board-card para consistência visual
        groupCard.className = 'board-card';
        groupCard.dataset.groupId = group.id;
        groupCard.title = t('publicProfile.groups.viewGroupTitle', { name: group.name });

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
                <span>${t('publicProfile.groups.memberCount', { count: memberCount })}</span>
                <span>${t('publicProfile.groups.taskCount', { count: taskCount })}</span>
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
        container.innerHTML = `<p class="privacy-placeholder">${t('publicProfile.boards.private')}</p>`;
        return;
    }

    const userBoards = (viewedUser.boardIds || []).map(id => getFullBoardData(id)).filter(Boolean);
    const publicBoards = userBoards.filter(board => board.visibility === 'public');

    container.innerHTML = '';

    if (publicBoards.length === 0) {
        container.innerHTML = `<p class="privacy-placeholder">${t('publicProfile.boards.none')}</p>`;
        return;
    }

    publicBoards.forEach(board => {
        const boardCard = document.createElement('div');
        boardCard.className = 'board-card';
        boardCard.dataset.boardId = board.id;
        boardCard.title = t('publicProfile.boards.viewBoardTitle', { title: board.title });

        const totalTasks = board.columns.reduce((acc, col) => acc + col.cards.length, 0);

        boardCard.innerHTML = `
            <div class="board-icon">${board.icon || '📋'}</div>
            <h4 class="board-name">${board.title}</h4>
            <p class="board-description">${board.description || 'Sem descrição.'}</p>
            <div class="board-stats">
                <span>${t('publicProfile.boards.columnCount', { count: board.columns.length })}</span>
                <span>${t('publicProfile.boards.taskCount', { count: totalTasks })}</span>
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
        container.innerHTML = `<p>${t('publicProfile.actions.isYou')}</p>`;
        return;
    }
    
    if (relationshipStatus.isFriend) {
        buttonsHtml = `
            <button class="btn" id="message-btn">${t('publicProfile.actions.message')}</button>
            <button class="btn danger" id="unfriend-btn">${t('publicProfile.actions.unfriend')}</button>
            <button class="btn" id="follow-btn">${relationshipStatus.isFollowing ? t('publicProfile.actions.following') : t('publicProfile.actions.follow')}</button>
        `;
    } else if (relationshipStatus.friendRequestPending) {
        buttonsHtml = `
            <button class="btn cancel" id="cancel-request-btn">${t('publicProfile.actions.cancelRequest')}</button>
            <button class="btn" id="follow-btn">${relationshipStatus.isFollowing ? t('publicProfile.actions.following') : t('publicProfile.actions.follow')}</button>
        `;
    } else {
        buttonsHtml = `
            <button class="btn confirm" id="friend-request-btn">${t('publicProfile.actions.addFriend')}</button>
            <button class="btn" id="follow-btn">${relationshipStatus.isFollowing ? t('publicProfile.actions.following') : t('publicProfile.actions.follow')}</button>
        `;
    }

    // Adiciona o botão de denunciar
    buttonsHtml += `
        <hr style="width:100%; border-color: var(--border); margin: 10px 0 5px;">
        <button class="btn danger" id="report-user-btn">${t('publicProfile.actions.report')}</button>
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
    
    showDialogMessage(dialog, t('publicProfile.feedback.requestSent'), 'success');
    
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
    showDialogMessage(dialog, t('publicProfile.feedback.requestCancelled'), 'info');
    
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
            t('publicProfile.confirm.unfollow', { name: viewedUser.name }),
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
                showDialogMessage(dialog, t('publicProfile.feedback.unfollowed', { name: viewedUser.name }), 'info');
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
    // A lógica de envio agora é tratada aqui, no local que chama o diálogo.
    showPrivateMessageDialog(viewedUser, (message, dialog) => {
        // 1. Chama a função de notificação, que já está importada neste arquivo.
        addMessageNotification(
            currentUser.name,
            currentUser.id,
            viewedUser.id,
            message.length > 50 ? message.substring(0, 50) + '...' : message
        );

        // 2. Mostra a mensagem de sucesso dentro do diálogo.
        showDialogMessage(dialog, t('publicProfile.messageDialog.success'), 'success');

        // 3. Desabilita os botões e fecha o diálogo após um intervalo.
        dialog.querySelectorAll('button').forEach(btn => btn.disabled = true);
        setTimeout(() => { dialog.close(); dialog.remove(); }, 1500);
    });
}

function unfriendUser() {
    showConfirmationDialog(
        t('publicProfile.confirm.unfriend', { name: viewedUser.name }),
        (dialog) => {
            // Remover da lista de amigos
            currentUser.friends = currentUser.friends.filter(id => id !== viewedUser.id);
            viewedUser.friends = viewedUser.friends.filter(id => id !== currentUser.id);
            
            updateUser(currentUser.id, currentUser);
            updateUser(viewedUser.id, viewedUser);
            
            relationshipStatus.isFriend = false;
            updateRelationshipButtons();
            showDialogMessage(dialog, t('publicProfile.feedback.unfriended'), 'info');
            return true;
        }
    );
}

function reportUser() {
    showConfirmationDialog(
        t('publicProfile.confirm.report', { name: viewedUser.name }),
        (dialog) => {
            // Em uma aplicação real, isso enviaria um evento para o backend.
            // Por enquanto, apenas exibimos uma mensagem de sucesso.
            console.log(`Usuário ${viewedUser.name} (ID: ${viewedUser.id}) denunciado por ${currentUser.name} (ID: ${currentUser.id}).`);
            showDialogMessage(dialog, t('publicProfile.feedback.reportSent'), 'success');
            return true;
        },
        null,
        t('ui.yesReport')
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
        showFloatingMessage(t('publicProfile.feedback.noAdminGroups'), 'warning');
        return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">${t('publicProfile.inviteDialog.title')}</h3>
        <p>${t('publicProfile.inviteDialog.description', { name: `<strong>${viewedUser.name}</strong>` })}</p>
        <div class="form-group">
            <label for="group-invite-select">${t('publicProfile.inviteDialog.selectLabel')}</label>
            <select id="group-invite-select">
                ${adminGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
            </select>
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn btn-secondary">${t('ui.cancel')}</button>
            <button class="btn btn-primary">${t('publicProfile.inviteDialog.sendButton')}</button>
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
            showDialogMessage(dialog, t('publicProfile.inviteDialog.invalidGroup'), 'error');
            return;
        }

        if (group.memberIds && group.memberIds.includes(viewedUser.id)) {
            showDialogMessage(dialog, t('publicProfile.inviteDialog.alreadyMember', { name: viewedUser.name }), 'info');
            return;
        }

        // Envia a notificação de convite
        addGroupInvitationNotification(group.name, group.id, currentUser.name, currentUser.id, viewedUser.id);

        showDialogMessage(dialog, t('publicProfile.inviteDialog.success', { groupName: group.name }), 'success');
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        setTimeout(closeDialog, 2000);
    });
}