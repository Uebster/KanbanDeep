// js/notifications.js - Versão final refatorada
import { 
    getNotifications, 
    saveNotifications,
    getGroup,
    saveGroup,
    getUserProfile,
    saveUserProfile,
    addFriend,
    getAllGroups
} from './storage.js';
import { getCurrentUser } from './auth.js';
import { 
    showFloatingMessage, 
    showConfirmationDialog, 
    showDialogMessage, 
    updateUserAvatar 
} from './ui-controls.js';

let notifications = [];
let currentFilter = 'all';
let currentTimeFilter = 'all';

// Função de inicialização exportada
export function initNotificationsPage() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'list-users.html';
        return;
    }
   
    if (currentUser) {
        updateUserAvatar(currentUser);
    }

    setupEventListeners();
    loadNotifications();
    renderNotifications();
    updateNotificationBadge();
}

function setupEventListeners() {
    document.getElementById('kanban-btn')?.addEventListener('click', () => window.location.href = 'kanban.html');
    // Botão de marcar todas como lidas
    document.getElementById('markAllRead')?.addEventListener('click', markAllAsRead);
    document.getElementById('deleteAllRead')?.addEventListener('click', deleteAllReadNotifications);
    
    // Filtro de notificações
    document.getElementById('notificationFilter')?.addEventListener('change', filterNotifications);
    document.getElementById('timeFilter')?.addEventListener('change', handleTimeFilterChange);
    document.getElementById('cardStatusFilter')?.addEventListener('change', filterCardNotifications);
    document.getElementById('meetingStatusFilter')?.addEventListener('change', filterMeetingNotifications);
    
    // Botões de ação de notificação
    document.addEventListener('click', handleNotificationAction);
    
    // Diálogos
    document.getElementById('close-notification-details')?.addEventListener('click', () => {
        document.getElementById('notification-details-dialog').close();
    });

    document.getElementById('action-notification-btn')?.addEventListener('click', handleNotificationDialogAction);

    // Diálogo de confirmação
    document.getElementById('confirmation-cancel')?.addEventListener('click', () => {
        document.getElementById('confirmation-dialog').close();
    });

    // Lógica das abas
    document.querySelectorAll('.nav-item').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    const tabs = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => tab.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));

    document.querySelector(`.nav-item[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
    
    // Aplicar filtros específicos para cada aba
    if (tabId === 'card-notifications') {
        filterCardNotifications();
    } else if (tabId === 'meeting-notifications') {
        filterMeetingNotifications();
    } else if (tabId === 'friends-requests') {
        renderFriendRequests();
    } else if (tabId === 'group-requests') {
        renderGroupRequests();
    } else {
        filterNotifications();
    }
}

function loadNotifications() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    notifications = getNotifications(currentUser.id) || [];
}

function renderNotifications() {
    const notificationsList = document.querySelector('#all-notifications .notifications-list');
    if (!notificationsList) return;
    
    notificationsList.innerHTML = '';
    
    // Filtra para não mostrar solicitações pendentes na aba principal
    const displayableNotifications = notifications.filter(n => n.status !== 'pending');

    if (displayableNotifications.length === 0) {
        notificationsList.innerHTML = '<p class="no-notifications">Nenhuma notificação encontrada.</p>';
        return;
    }
    
    const filteredNotifications = filterNotificationsByType(displayableNotifications, currentFilter);
    const timeFilteredNotifications = filterNotificationsByTime(filteredNotifications, currentTimeFilter);
    
    timeFilteredNotifications.forEach(notification => {
        const notificationEl = createNotificationElement(notification);
        notificationsList.appendChild(notificationEl);
    });
}

function createNotificationElement(notification) {
    const notificationEl = document.createElement('div');
    notificationEl.className = `notification-item ${notification.read ? '' : 'unread'} notification-${getNotificationCategory(notification.type)}`;
    notificationEl.dataset.id = notification.id;
    
    const icon = getNotificationIcon(notification.type);
    const date = formatDate(notification.date);
    const data = notification.data || {};
    
    notificationEl.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-content">
            <div class="notification-title">${notification.title}</div>
            <div class="notification-message">${notification.message}</div>
            <div class="notification-meta">
                ${(notification.board || data.boardName) ? `<span>Quadro: ${notification.board || data.boardName}</span>` : ''}
                ${(notification.group || data.groupName) ? `<span>Grupo: ${notification.group || data.groupName}</span>` : ''}
                ${notification.sender ? `<span>De: ${notification.sender}</span>` : ''}
            </div>
        </div>
        <div class="notification-date">${date}</div>
        <div class="notification-actions">
            ${notification.status === 'pending' ? 
                `<button class="btn btn-sm btn-primary accept-btn" data-id="${notification.id}">Aceitar</button>
                 <button class="btn btn-sm btn-secondary reject-btn" data-id="${notification.id}">Recusar</button>` : 
                `<button class="btn btn-sm btn-primary view-btn" data-id="${notification.id}">Ver</button>`
            }
        </div>
    `;
    
    return notificationEl;
}

function getNotificationIcon(type) {
    const icons = {
        friend_request: '👥',
        friend_accepted: '✅',
        group_request: '👪',
        group_invite: '📨',
        group_leave: '🚪',
        group_removal: '🚫',
        card_mention: '📍',
        card_overdue: '⏰',
        card_due_today: '📅',
        card_due_week: '📆',
        card_due_month: '🗓️',
        message_user: '💬',
        message_group: '👥💬',
        meeting: '📅',
        report: '📊'
    };
    
    return icons[type] || '🔔';
}

function getNotificationCategory(type) {
    if (['friend_request', 'friend_accepted'].includes(type)) return 'friend';
    if (['group_request', 'group_invite'].includes(type)) return 'group';
    if (type.includes('card_')) return 'card';
    if (type === 'meeting') return 'meeting';
    if (type === 'report') return 'report';
    if (type.includes('message_')) return 'message';
    return 'other';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
        return 'Hoje, ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 2) {
        return 'Ontem, ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays <= 7) {
        return `Há ${diffDays-1} dias`;
    } else {
        return date.toLocaleDateString('pt-BR');
    }
}

function filterNotifications() {
    const filter = document.getElementById('notificationFilter').value;
    currentFilter = filter;
    renderNotifications();
}

function handleTimeFilterChange() {
    const filter = document.getElementById('timeFilter').value;
    currentTimeFilter = filter;
    renderNotifications();
}

function filterNotificationsByType(notificationsList, filter) {
    if (filter === 'all') return notificationsList;
    return notificationsList.filter(notification => notification.type === filter);
}

function filterNotificationsByTime(notificationsList, timeFilter = null) {
    if (!timeFilter) timeFilter = document.getElementById('timeFilter')?.value || 'all';
    currentTimeFilter = timeFilter;
    
    if (timeFilter === 'all') return notificationsList;
    
    const now = new Date();
    let startDate;
    
    switch(timeFilter) {
        case 'today':
            startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'week':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            break;
        case 'month':
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 1);
            break;
        default:
            return notificationsList;
    }
    
    return notificationsList.filter(notification => {
        const notificationDate = new Date(notification.date);
        return notificationDate >= startDate;
    });
}

function filterCardNotifications() {
    const filter = document.getElementById('cardStatusFilter').value;
    const allCardNotifications = notifications.filter(n => n.type.startsWith('card_'));
    
    const cardNotificationsList = document.querySelector('#card-notifications .notifications-list');
    if (!cardNotificationsList) return;
    
    cardNotificationsList.innerHTML = '';
    
    let filteredNotifications = allCardNotifications;
    
    if (filter !== 'all') {
        filteredNotifications = allCardNotifications.filter(notification => notification.type === `card_${filter}`);
    }
    
    if (filteredNotifications.length === 0) {
        cardNotificationsList.innerHTML = '<p class="no-notifications">Nenhuma notificação de cartão encontrada para este filtro.</p>';
        return;
    }
    
    filteredNotifications.forEach(notification => {
        const notificationEl = createNotificationElement(notification);
        cardNotificationsList.appendChild(notificationEl);
    });
}

function filterMeetingNotifications() {
    const filter = document.getElementById('meetingStatusFilter').value;
    const notificationsList = notifications.filter(n => n.type === 'meeting');
    
    const meetingNotificationsList = document.querySelector('#meeting-notifications .notifications-list');
    if (!meetingNotificationsList) return;
    
    meetingNotificationsList.innerHTML = '';
    
    let filteredNotifications = notificationsList;
    const now = new Date();
    
    if (filter !== 'all') {
        filteredNotifications = notificationsList.filter(notification => {
            const meetingDate = new Date(notification.meetingDate);
            if (filter === 'upcoming') return meetingDate >= now;
            if (filter === 'past') return meetingDate < now;
            return true;
        });
    }
    
    if (filteredNotifications.length === 0) {
        meetingNotificationsList.innerHTML = '<p class="no-notifications">Nenhuma notificação de reunião encontrada.</p>';
        return;
    }
    
    filteredNotifications.forEach(notification => {
        const notificationEl = createNotificationElement(notification);
        meetingNotificationsList.appendChild(notificationEl);
    });
}

function renderFriendRequests() {
    const requestsList = document.querySelector('#friends-requests .requests-list');
    if (!requestsList) return;
    
    const friendRequests = notifications.filter(n => n.type === 'friend_request' && n.status === 'pending');
    
    requestsList.innerHTML = '';
    
    if (friendRequests.length === 0) {
        requestsList.innerHTML = '<p class="no-requests">Nenhuma solicitação de amizade pendente.</p>';
        return;
    }
    
    friendRequests.forEach(request => {
        const requestEl = document.createElement('div');
        requestEl.className = 'request-item';
        requestEl.dataset.id = request.id;
        
        requestEl.innerHTML = `
            <div class="request-avatar">
                <img src="https://ui-avatars.com/api/?name=${request.sender}&background=random" alt="${request.sender}">
            </div>
            <div class="request-info">
                <div class="request-name">${request.sender}</div>
                <div class="request-message">${request.message}</div>
            </div>
            <div class="request-actions">
                <button class="btn btn-sm btn-primary accept-btn" data-id="${request.id}">Aceitar</button>
                <button class="btn btn-sm btn-secondary reject-btn" data-id="${request.id}">Recusar</button>
            </div>
        `;
        
        requestsList.appendChild(requestEl);
    });
}

function renderGroupRequests() {
    const requestsList = document.querySelector('#group-requests .requests-list');
    if (!requestsList) return;
    
    // CORREÇÃO: Filtra tanto solicitações para entrar quanto convites recebidos
    const groupNotifications = notifications.filter(n => 
        (n.type === 'group_request' || n.type === 'group_invitation') && 
        n.status === 'pending'
    );
    
    requestsList.innerHTML = '';
    
    if (groupNotifications.length === 0) {
        requestsList.innerHTML = '<p class="no-requests">Nenhum convite ou solicitação de grupo pendente.</p>';
        return;
    }
    
    groupNotifications.forEach(request => {
        const requestEl = document.createElement('div');
        requestEl.className = 'request-item';
        requestEl.dataset.id = request.id;
        
        const title = request.type === 'group_request' ? request.sender : (request.data?.groupName || 'Grupo');

        requestEl.innerHTML = `
            <div class="request-avatar">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(title)}&background=random" alt="${title}">
            </div>
            <div class="request-info">
                <div class="request-name">${title}</div>
                <div class="request-message">${request.message}</div>
            </div>
            <div class="request-actions">
                <button class="btn btn-sm btn-primary accept-btn" data-id="${request.id}">Aceitar</button>
                <button class="btn btn-sm btn-secondary reject-btn" data-id="${request.id}">Recusar</button>
            </div>
        `;
        
        requestsList.appendChild(requestEl);
    });
}

function markAllAsRead() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    notifications.forEach(notification => {
        notification.read = true;
    });
    
    saveNotifications(currentUser.id, notifications);
    renderNotifications();
    updateNotificationBadge();
    
    showFloatingMessage('Todas as notificações marcadas como lidas', 'success');
}

function deleteAllReadNotifications() {
    const readNotifications = notifications.filter(n => n.read);
    if (readNotifications.length === 0) {
        showFloatingMessage('Não há notificações lidas para excluir.', 'info');
        return;
    }

    showConfirmationDialog(
        `Tem certeza que deseja excluir permanentemente ${readNotifications.length} notificações lidas? Esta ação não pode ser desfeita.`,
        (dialog) => {
            const currentUser = getCurrentUser();
            if (!currentUser) return false;

            // Filtra para manter apenas as não lidas
            notifications = notifications.filter(n => !n.read);
            
            saveNotifications(currentUser.id, notifications);
            renderNotifications();
            updateNotificationBadge();

            showDialogMessage(dialog, 'Notificações lidas foram excluídas.', 'success');
            return true;
        },
        null, // onCancel
        'Sim, Excluir'
    );
}

function handleNotificationAction(e) {
    if (e.target.classList.contains('accept-btn')) {
        const notificationId = e.target.dataset.id;
        acceptNotification(notificationId);
    } else if (e.target.classList.contains('reject-btn')) {
        const notificationId = e.target.dataset.id;
        rejectNotification(notificationId);
    } else if (e.target.classList.contains('view-btn')) {
        const notificationId = e.target.dataset.id;
        viewNotification(notificationId);
    }
}

function acceptNotification(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) return;
    
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    showConfirmationDialog(
        `Tem certeza que deseja aceitar esta solicitação?`,
        async (dialog) => {
            try {
                // Marcar como lida e processar aceitação
                notification.read = true;
                notification.status = 'accepted';
                
                // Lógica específica para cada tipo de notificação
                if (notification.type === 'friend_request') {
                    // Adicionar amizade bidirecional
                    await addFriend(currentUser.id, notification.senderId);
                    showDialogMessage(dialog, 'Solicitação de amizade aceita!', 'success');
                } else if (notification.type === 'group_request') {
                    // Adicionar o solicitante (não o admin) ao grupo
                    const group = getGroup(notification.data.groupId);
                    const userToAdd = getUserProfile(notification.data.userId);

                    if (group && userToAdd) {
                        if (!group.memberIds.includes(userToAdd.id)) {
                            group.memberIds.push(userToAdd.id);
                            saveGroup(group);
                            
                            if (!userToAdd.groupIds) userToAdd.groupIds = [];
                            if (!userToAdd.groupIds.includes(group.id)) {
                                userToAdd.groupIds.push(group.id);
                                saveUserProfile(userToAdd);
                            }
                            showDialogMessage(dialog, `${userToAdd.name} foi adicionado ao grupo!`, 'success');
                        }
                    } else {
                        showDialogMessage(dialog, 'Erro: Grupo ou usuário não encontrado.', 'error');
                    }
                } else if (notification.type === 'group_invitation') {
                    // Lógica para convites de grupo
                    const group = getGroup(notification.data.groupId);
                    if (group && !group.memberIds.includes(currentUser.id)) {
                        group.memberIds.push(currentUser.id);
                        saveGroup(group);
                        
                        // Adicionar grupo ao perfil do usuário
                        const userProfile = getUserProfile(currentUser.id);
                        if (userProfile) {
                            if (!userProfile.groupIds) userProfile.groupIds = [];
                            userProfile.groupIds.push(group.id);
                            saveUserProfile(userProfile);
                        }
                        
                        showDialogMessage(dialog, 'Convite de grupo aceito!', 'success');
                    }
                }
                
                saveNotifications(currentUser.id, notifications);
                renderNotifications();
                renderFriendRequests();
                renderGroupRequests(); // ATUALIZAÇÃO: Renderiza também a lista de grupos
                updateNotificationBadge();

                return true;
            } catch (error) {
                console.error('Erro ao aceitar notificação:', error);
                showDialogMessage(dialog, 'Erro ao processar a solicitação.', 'error');
                return false;
            }
        }
    );
}

function rejectNotification(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) return;
    
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    showConfirmationDialog(
        'Tem certeza que deseja recusar esta solicitação?',
        (dialog) => {
            // Marcar como lida e processar recusa
            notification.read = true;
            notification.status = 'rejected';
            
            saveNotifications(currentUser.id, notifications);
            renderNotifications();
            renderFriendRequests();
            renderGroupRequests(); // ATUALIZAÇÃO: Renderiza também a lista de grupos
            updateNotificationBadge();
            
            showDialogMessage(dialog, 'Solicitação recusada.', 'info');
            return true;
        }
    );
}

function viewNotification(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) return;
    
    const dialog = document.getElementById('notification-details-dialog');
    const content = document.getElementById('notification-details-content');
    const actionBtn = document.getElementById('action-notification-btn');
    dialog.dataset.notificationId = notificationId; // Armazena o ID no diálogo
    
    // Marcar como lida
    notification.read = true;
    const currentUser = getCurrentUser();
    if (currentUser) {
        saveNotifications(currentUser.id, notifications);
        renderNotifications();
        updateNotificationBadge();
    }
    
    // Preencher conteúdo do diálogo
    content.innerHTML = `
        <div class="notification-details">
            <div class="details-icon">${getNotificationIcon(notification.type)}</div>
            <div class="details-title">${notification.title}</div>
            <div class="details-message">${notification.message}</div>
            <div class="details-meta">
                ${notification.board ? `<div><strong>Quadro:</strong> ${notification.board}</div>` : ''}
                ${notification.group ? `<div><strong>Grupo:</strong> ${notification.group}</div>` : ''}
                ${notification.sender ? `<div><strong>De:</strong> ${notification.sender}</div>` : ''}
                ${notification.meetingDate ? `<div><strong>Data da reunião:</strong> ${formatDate(notification.meetingDate)}</div>` : ''}
                <div><strong>Recebida em:</strong> ${formatDate(notification.date)}</div>
            </div>
        </div>
    `;
    
    // Configurar botão de ação
    if (notification.type.includes('card_')) {
        actionBtn.textContent = 'Ir para o Quadro';
        actionBtn.style.display = 'block';
    } else if (notification.type.includes('message_')) {
        actionBtn.textContent = 'Responder';
        actionBtn.style.display = 'block';
    } else if (notification.type === 'report') {
        actionBtn.textContent = 'Ver Relatório';
        actionBtn.style.display = 'block';
    } else {
        actionBtn.style.display = 'none';
    }
    
    dialog.showModal();
}

function handleNotificationDialogAction() {
    const dialog = document.getElementById('notification-details-dialog');
    const notificationId = dialog.dataset.notificationId;
    if (!notificationId) return;

    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) return;

    if (notification.type.includes('card_')) {
        // Para cartões, redireciona para o kanban e armazena o ID do cartão para foco
        // A lógica de encontrar o boardId precisa ser melhorada no futuro
        localStorage.setItem('focusCardId', notification.data.cardId);
        showFloatingMessage(`Redirecionando para o quadro...`, 'info');
        window.location.href = 'kanban.html';

    } else if (notification.type.includes('message_')) {
        // Para mensagens, redireciona para o perfil público do remetente
        showFloatingMessage(`Abrindo perfil de ${notification.sender}...`, 'info');
        window.location.href = `public-profile.html?userId=${notification.senderId}`;

    } else if (notification.type === 'report' && notification.data.groupName) {
        // CORREÇÃO: Redireciona para a aba de relatórios e pré-seleciona os filtros
        const group = getAllGroups().find(g => g.name === notification.data.groupName); // Idealmente, seria por ID
        if (group) {
            localStorage.setItem('openTab', 'reports');
            localStorage.setItem('groupId', group.id);
            localStorage.setItem('reportPeriod', notification.data.period);
            window.location.href = 'groups.html';
        }
    }

    dialog.close();
}

function updateNotificationBadge() {
    const unreadCount = notifications.filter(n => !n.read).length;
    const badge = document.querySelector('#notificationsBtn .badge');
    
    if (badge) {
        badge.textContent = unreadCount > 0 ? unreadCount : '';
        badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }
}

// Função para adicionar uma nova notificação
function addNotificationToUser(userId, notification) {
    const userNotifications = getNotifications(userId) || [];
    userNotifications.unshift(notification);
    saveNotifications(userId, userNotifications);
    
    // Se for o usuário atual, atualiza a interface
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id === userId) {
        if (window.location.pathname.includes('notifications.html')) {
            renderNotifications();
        }
        updateNotificationBadge();
    }
    
    // Mostrar notificação flutuante se for o usuário atual
    if (currentUser && currentUser.id === userId) {
        // Mapeia o tipo da notificação para um tipo de mensagem visual
        const messageType = notification.type.includes('removal') || notification.type.includes('overdue') ? 'error' : 'info';
        showFloatingMessage(notification.message, messageType);
    }
}

// Funções para adicionar tipos específicos de notificações
export function addFriendRequestNotification(senderName, senderId, receiverId) {
    const notification = {
        id: 'friend-request-' + Date.now() + '-' + receiverId,
        type: 'friend_request',
        title: 'Solicitação de Amizade',
        message: `${senderName} quer ser seu amigo(a)`,
        sender: senderName,
        senderId: senderId,
        date: new Date().toISOString(),
        read: false,
        status: 'pending',
        actions: ['accept', 'reject']
    };
    
    addNotificationToUser(receiverId, notification);
    return notification;
}

export function addFriendAcceptedNotification(accepterName, accepterId, originalSenderId) {
    const notification = {
        id: 'friend-accepted-' + Date.now() + '-' + originalSenderId,
        type: 'friend_accepted',
        title: 'Solicitação de Amizade Aceita',
        message: `${accepterName} aceitou sua solicitação de amizade.`,
        sender: accepterName,
        senderId: accepterId,
        date: new Date().toISOString(),
        read: false,
        status: 'unread',
        actions: ['view']
    };
    
    addNotificationToUser(originalSenderId, notification);
    return notification;
}

export function addFollowNotification(senderName, senderId, receiverId) {
    const notification = {
        id: 'follow-' + Date.now() + '-' + receiverId,
        type: 'follow',
        title: 'Novo Seguidor',
        message: `${senderName} começou a seguir você`,
        sender: senderName,
        senderId: senderId,
        date: new Date().toISOString(),
        read: false,
        status: 'unread'
    };
    
    addNotificationToUser(receiverId, notification);
    return notification;
}



// Substituir a função existente por:
export function addGroupInvitationNotification(groupName, groupId, adminName, adminId, userId) {
    const notification = {
        id: 'group-invite-' + Date.now() + '-' + userId,
        type: 'group_invitation',
        title: 'Convite para Grupo',
        message: `${adminName} convidou você para o grupo "${groupName}"`,
        date: new Date().toISOString(),
        read: false,
        status: 'pending',
        actions: ['accept', 'reject'],
        data: {
            groupName: groupName,
            groupId: groupId,
            adminId: adminId
        }
    };
    
    addNotificationToUser(userId, notification);
    return notification;
}

export function addGroupLeaveNotification(groupName, leaverName, adminId) {
    const notification = {
        id: 'group-leave-' + Date.now() + '-' + adminId,
        type: 'group_leave',
        title: 'Membro Saiu do Grupo',
        message: `${leaverName} saiu do grupo "${groupName}"`,
        date: new Date().toISOString(),
        read: false,
        status: 'unread'
    };
    
    addNotificationToUser(adminId, notification);
    return notification;
}

export function addGroupRemovalNotification(groupName, adminName, userId) {
    const notification = {
        id: 'group-removal-' + Date.now() + '-' + userId,
        type: 'group_removal',
        title: 'Removido do Grupo',
        message: `${adminName} removeu você do grupo "${groupName}"`,
        date: new Date().toISOString(),
        read: false,
        status: 'unread'
    };
    
    addNotificationToUser(userId, notification);
    return notification;
}

export function addMessageNotification(senderName, senderId, receiverId, messagePreview) {
    const notification = {
        id: 'message-' + Date.now() + '-' + receiverId,
        type: 'message',
        title: 'Nova Mensagem',
        message: `${senderName}: ${messagePreview}`,
        sender: senderName,
        senderId: senderId,
        date: new Date().toISOString(),
        read: false,
        status: 'unread',
        actions: ['view']
    };
    
    addNotificationToUser(receiverId, notification);
    return notification;
}

export function addCardAssignmentNotification(assignerName, assigneeId, cardTitle, boardTitle) {
    const notification = {
        id: 'card-assign-' + Date.now() + '-' + assigneeId,
        type: 'card_assignment',
        title: 'Nova Tarefa Atribuída',
        message: `${assignerName} atribuiu o cartão "${cardTitle}" a você no quadro "${boardTitle}".`,
        sender: assignerName,
        date: new Date().toISOString(),
        read: false,
        status: 'unread',
        data: {
            cardTitle: cardTitle,
            boardTitle: boardTitle
        }
    };
    
    addNotificationToUser(assigneeId, notification);
    return notification;
}

export function addCardDueNotification(userId, cardTitle, boardName, cardId, dueDate) {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let type = 'card_due_today';
    let message = `O cartão "${cardTitle}" vence hoje`;
    
    if (diffDays < 0) {
        type = 'card_overdue';
        message = `O cartão "${cardTitle}" está atrasado`;
    } else if (diffDays <= 7) {
        type = 'card_due_week';
        message = `O cartão "${cardTitle}" vence em ${diffDays} dias`;
    } else if (diffDays <= 30) {
        type = 'card_due_month';
        message = `O cartão "${cardTitle}" vence em ${Math.ceil(diffDays/7)} semanas`;
    }
    
    const notification = {
        id: `card-due-${cardId}`,
        type: type,
        title: 'Alerta de Vencimento',
        message: message,
        date: new Date().toISOString(),
        read: false,
        data: { boardName, cardId, dueDate }
    };
    addNotificationToUser(userId, notification);
}

export function addMeetingNotification(meetingTitle, groupName, meetingDate) {
    addNotificationToUser(currentUser.id, { // Notifica o usuário atual
        type: 'meeting', title: 'Reunião Agendada', message: `${meetingTitle} no grupo ${groupName}`,
        group: groupName,
        meetingDate: meetingDate
    });
}

export function addReportNotification(userId, period, groupName) {
    const periodNames = {
        daily: 'diário',
        weekly: 'semanal',
        monthly: 'mensal'
    };
    
    const notification = {
        id: `report-${groupName}-${Date.now()}`,
        type: 'report',
        title: 'Relatório de Grupo Disponível',
        message: `O relatório ${periodNames[period]} do grupo "${groupName}" foi gerado.`,
        date: new Date().toISOString(),
        read: false,
        data: { groupName, period }
    };
    addNotificationToUser(userId, notification);
}

export function addGroupRequestNotification(groupName, groupId, userName, userId, adminId) {
    const notification = {
        id: 'group-request-' + Date.now(),
        type: 'group_request',
        title: 'Solicitação para Grupo',
        message: `${userName} quer entrar no grupo "${groupName}"`,
        sender: userName,
        senderId: userId,
        date: new Date().toISOString(),
        read: false,
        status: 'pending',
        actions: ['accept', 'reject'],
        data: {
            groupId: groupId,
            userId: userId,
            groupName: groupName
        }
    };
    addNotificationToUser(adminId, notification);
}