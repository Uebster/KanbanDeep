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
    updateUserAvatar,
    initCustomSelects
} from './ui-controls.js';
import { t, initTranslations } from './translations.js';

let notifications = [];
let currentFilter = 'all';
let currentTimeFilter = 'all';

// Função de inicialização exportada
export async function initNotificationsPage() {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.href = 'list-users.html';
        return;
    }
   
    if (currentUser) {
        updateUserAvatar(currentUser);
    }

    await initTranslations();

    setupEventListeners();
    await loadNotifications();
    await renderNotifications();
    await updateNotificationBadge();
    initCustomSelects();
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

async function switchTab(tabId) {
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
        await renderGroupRequests();
    } else {
        filterNotifications();
    }
}

async function loadNotifications() {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;
    
    notifications = await getNotifications(currentUser.id) || [];
}

function renderNotifications() {
    const notificationsList = document.querySelector('#all-notifications .notifications-list');
    if (!notificationsList) return;
    
    notificationsList.innerHTML = '';
    
    // Filtra para não mostrar solicitações pendentes na aba principal
    const displayableNotifications = notifications.filter(n => n.status !== 'pending');

    if (displayableNotifications.length === 0) {
        notificationsList.innerHTML = `<p class="no-notifications">${t('notifications.list.noneFound')}</p>`;
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
                ${(notification.board || data.boardName) ? `<span>${t('notifications.item.boardLabel')} ${notification.board || data.boardName}</span>` : ''}
                ${(notification.group || data.groupName) ? `<span>${t('notifications.item.groupLabel')} ${notification.group || data.groupName}</span>` : ''}
                ${notification.sender ? `<span>${t('notifications.item.fromLabel')} ${notification.sender}</span>` : ''}
            </div>
        </div>
        <div class="notification-date">${date}</div>
        <div class="notification-actions">
            ${notification.status === 'pending' ? 
                `<button class="btn btn-sm btn-primary accept-btn" data-id="${notification.id}">Aceitar</button>
                 <button class="btn btn-sm btn-secondary reject-btn" data-id="${notification.id}">Recusar</button>` : 
                `<button class="btn btn-sm btn-primary view-btn" data-id="${notification.id}">${t('notifications.button.view')}</button>`
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
        return t('ui.today') + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 2) {
        return t('ui.yesterday') + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays <= 7) {
        return t('ui.daysAgo', { count: diffDays - 1 });
    } else {
        return date.toLocaleDateString([]);
    }
}

function filterNotifications() {
    const filter = document.getElementById('notificationFilter').value;
    currentFilter = filter;
    renderNotifications();
}

async function handleTimeFilterChange() {
    const filter = document.getElementById('timeFilter').value;
    currentTimeFilter = filter;
    await renderNotifications();
}

async function filterNotificationsByType(notificationsList, filter) {
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
        cardNotificationsList.innerHTML = `<p class="no-notifications">${t('notifications.cards.noneFound')}</p>`;
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
        meetingNotificationsList.innerHTML = `<p class="no-notifications">${t('notifications.meetings.noneFound')}</p>`;
        return;
    }
    
    filteredNotifications.forEach(notification => {
        const notificationEl = createNotificationElement(notification);
        meetingNotificationsList.appendChild(notificationEl);
    });
}

async function renderFriendRequests() {
    const requestsList = document.querySelector('#friends-requests .requests-list');
    if (!requestsList) return;
    
    const friendRequests = notifications.filter(n => n.type === 'friend_request' && n.status === 'pending');
    
    requestsList.innerHTML = '';
    
    if (friendRequests.length === 0) {
        requestsList.innerHTML = `<p class="no-requests">${t('notifications.friends.nonePending')}</p>`;
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
                <button class="btn btn-sm btn-primary accept-btn" data-id="${request.id}">${t('notifications.button.accept')}</button>
                <button class="btn btn-sm btn-secondary reject-btn" data-id="${request.id}">${t('notifications.button.reject')}</button>
            </div>
        `;
        
        requestsList.appendChild(requestEl);
    });
}

async function renderGroupRequests() {
    const requestsList = document.querySelector('#group-requests .requests-list');
    if (!requestsList) return;
    
    // CORREÇÃO: Filtra tanto solicitações para entrar quanto convites recebidos
    const groupNotifications = notifications.filter(n => 
        (n.type === 'group_request' || n.type === 'group_invitation') && 
        n.status === 'pending'
    );
    
    requestsList.innerHTML = '';
    
    if (groupNotifications.length === 0) {
        requestsList.innerHTML = `<p class="no-requests">${t('notifications.groups.nonePending')}</p>`;
        return;
    }
    
    groupNotifications.forEach(request => {
        const requestEl = document.createElement('div');
        requestEl.className = 'request-item';
        requestEl.dataset.id = request.id;
        
        const title = request.type === 'group_request' ? request.sender : (request.data?.groupName || t('kanban.boardFilter.groups'));

        requestEl.innerHTML = `
            <div class="request-avatar">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(title)}&background=random" alt="${title}">
            </div>
            <div class="request-info">
                <div class="request-name">${title}</div>
                <div class="request-message">${request.message}</div>
            </div>
            <div class="request-actions">
                <button class="btn btn-sm btn-primary accept-btn" data-id="${request.id}">${t('notifications.button.accept')}</button>
                <button class="btn btn-sm btn-secondary reject-btn" data-id="${request.id}">${t('notifications.button.reject')}</button>
            </div>
        `;
        
        requestsList.appendChild(requestEl);
    });
}

async function markAllAsRead() {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;
    
    notifications.forEach(notification => {
        notification.read = true;
    });
    
    await saveNotifications(currentUser.id, notifications);
    renderNotifications();
    updateNotificationBadge();
    
    showFloatingMessage(t('notifications.feedback.allRead'), 'success');
}

function deleteAllReadNotifications() {
    const readNotifications = notifications.filter(n => n.read);
    if (readNotifications.length === 0) {
        showFloatingMessage(t('notifications.feedback.noneReadToDelete'), 'info');
        return;
    }

    showConfirmationDialog(
        t('notifications.confirm.deleteAllRead', { count: readNotifications.length }),
        async (dialog) => {
            const currentUser = await getCurrentUser();
            if (!currentUser) return false;

            // Filtra para manter apenas as não lidas
            notifications = notifications.filter(n => !n.read);
            
            await saveNotifications(currentUser.id, notifications);
            renderNotifications();
            updateNotificationBadge();

            showDialogMessage(dialog, t('notifications.feedback.allReadDeleted'), 'success');
            return true;
        },
        null,
        t('ui.yesDelete')
    );
}

async function handleNotificationAction(e) {
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

async function acceptNotification(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) return;
    
    const currentUser = await getCurrentUser();
    if (!currentUser) return;
    
    showConfirmationDialog(
        t('notifications.confirm.accept'),
        async (dialog) => {
            try {
                // Marcar como lida e processar aceitação
                notification.read = true;
                notification.status = 'accepted';
                
                // Lógica específica para cada tipo de notificação
                if (notification.type === 'friend_request') {
                    // Adicionar amizade bidirecional
                    await addFriend(currentUser.id, notification.senderId);
                    showDialogMessage(dialog, t('notifications.feedback.friendRequestAccepted'), 'success');
                } else if (notification.type === 'group_request') {
                    // Adicionar o solicitante (não o admin) ao grupo
                    const group = await getGroup(notification.data.groupId);
                    const userToAdd = await getUserProfile(notification.data.userId);

                    if (group && userToAdd) {
                        if (!group.memberIds.includes(userToAdd.id)) {
                            group.memberIds.push(userToAdd.id);
                            await saveGroup(group);
                            
                            if (!userToAdd.groupIds) userToAdd.groupIds = [];
                            if (!userToAdd.groupIds.includes(group.id)) {
                                userToAdd.groupIds.push(group.id);
                                await saveUserProfile(userToAdd);
                            }
                            showDialogMessage(dialog, t('notifications.feedback.userAddedToGroup', { name: userToAdd.name }), 'success');
                        }
                    } else {
                        showDialogMessage(dialog, t('notifications.feedback.groupOrUserNotFound'), 'error');
                    }
                } else if (notification.type === 'group_invitation') {
                    // Lógica para convites de grupo
                    const group = await getGroup(notification.data.groupId);
                    if (group && !group.memberIds.includes(currentUser.id)) {
                        group.memberIds.push(currentUser.id);
                        await saveGroup(group);
                        
                        // Adicionar grupo ao perfil do usuário
                        const userProfile = await getUserProfile(currentUser.id);
                        if (userProfile) {
                            if (!userProfile.groupIds) userProfile.groupIds = [];
                            userProfile.groupIds.push(group.id);
                            await saveUserProfile(userProfile);
                        }
                        
                        // PASSO 2: Adiciona log de entrada no grupo
                        if (!group.activityLog) group.activityLog = [];
                        group.activityLog.push({
                            action: 'member_joined', userId: currentUser.id, timestamp: new Date().toISOString(), memberName: currentUser.name
                        });
                        await saveGroup(group);

                        showDialogMessage(dialog, t('notifications.feedback.groupInviteAccepted'), 'success');
                    }
                }
                
                await saveNotifications(currentUser.id, notifications);
                await renderNotifications();
                await renderFriendRequests();
                await renderGroupRequests(); // ATUALIZAÇÃO: Renderiza também a lista de grupos
                await updateNotificationBadge();

                return true;
            } catch (error) {
                console.error('Erro ao aceitar notificação:', error);
                showDialogMessage(dialog, t('notifications.feedback.requestError'), 'error');
                return false;
            }
        }
    );
}

async function rejectNotification(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) return;
    
    const currentUser = await getCurrentUser();
    if (!currentUser) return;
    
    showConfirmationDialog(
        t('notifications.confirm.reject'),
        async (dialog) => {
            // Marcar como lida e processar recusa
            notification.read = true;
            notification.status = 'rejected';
            
            await saveNotifications(currentUser.id, notifications);
            renderNotifications();
            renderFriendRequests();
            renderGroupRequests(); // ATUALIZAÇÃO: Renderiza também a lista de grupos
            updateNotificationBadge();
            
            showDialogMessage(dialog, t('notifications.feedback.requestRejected'), 'info');
            return true;
        }
    );
}

async function viewNotification(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) return;
    
    const dialog = document.getElementById('notification-details-dialog');
    const content = document.getElementById('notification-details-content');
    const actionBtn = document.getElementById('action-notification-btn');
    dialog.dataset.notificationId = notificationId; // Armazena o ID no diálogo
    
    // Marcar como lida
    notification.read = true;
    const currentUser = await getCurrentUser();
    if (currentUser) {
        await saveNotifications(currentUser.id, notifications);
        await renderNotifications();
        await updateNotificationBadge();
    }
    
    // Preencher conteúdo do diálogo
    content.innerHTML = `
        <div class="notification-details">
            <div class="details-icon">${getNotificationIcon(notification.type)}</div>
            <div class="details-title">${notification.title}</div>
            <div class="details-message">${notification.message}</div>
            <div class="details-meta">
                ${notification.board ? `<div><strong>${t('notifications.item.boardLabel')}</strong> ${notification.board}</div>` : ''}
                ${notification.group ? `<div><strong>${t('notifications.item.groupLabel')}</strong> ${notification.group}</div>` : ''}
                ${notification.sender ? `<div><strong>${t('notifications.item.fromLabel')}</strong> ${notification.sender}</div>` : ''}
                ${notification.meetingDate ? `<div><strong>${t('notifications.details.meetingDate')}</strong> ${formatDate(notification.meetingDate)}</div>` : ''}
                <div><strong>${t('notifications.details.receivedAt')}</strong> ${formatDate(notification.date)}</div>
            </div>
        </div>
    `;
    
    // Configurar botão de ação
    if (notification.type.includes('card_')) {
        actionBtn.textContent = t('notifications.details.buttonGoToBoard');
        actionBtn.style.display = 'block';
    } else if (notification.type.includes('message_')) {
        actionBtn.textContent = t('notifications.details.buttonReply');
        actionBtn.style.display = 'block';
    } else if (notification.type === 'report') {
        actionBtn.textContent = t('notifications.details.buttonViewReport');
        actionBtn.style.display = 'block';
    } else {
        actionBtn.style.display = 'none';
    }
    
    dialog.showModal();
}

async function handleNotificationDialogAction() {
    const dialog = document.getElementById('notification-details-dialog');
    const notificationId = dialog.dataset.notificationId;
    if (!notificationId) return;

    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) return;

    if (notification.type.includes('card_')) {
        // Para cartões, redireciona para o kanban e armazena o ID do cartão para foco
        // A lógica de encontrar o boardId precisa ser melhorada no futuro
        localStorage.setItem('focusCardId', notification.data.cardId);
        showFloatingMessage(t('notifications.feedback.redirectToBoard'), 'info');
        window.location.href = 'kanban.html';

    } else if (notification.type.includes('message_')) {
        // Para mensagens, redireciona para o perfil público do remetente
        showFloatingMessage(t('notifications.feedback.openingProfile', { name: notification.sender }), 'info');
        window.location.href = `public-profile.html?userId=${notification.senderId}`;

    } else if (notification.type === 'report' && notification.data.groupName) {
        // CORREÇÃO: Redireciona para a aba de relatórios e pré-seleciona os filtros
        const group = (await getAllGroups()).find(g => g.name === notification.data.groupName); // Idealmente, seria por ID
        if (group) {
            localStorage.setItem('openTab', 'reports');
            localStorage.setItem('groupId', group.id);
            localStorage.setItem('reportPeriod', notification.data.period);
            window.location.href = 'groups.html';
        }
    }

    dialog.close();
}

async function updateNotificationBadge() {
    const unreadCount = notifications.filter(n => !n.read).length;
    const badge = document.querySelector('#notificationsBtn .badge');
    
    if (badge) {
        badge.textContent = unreadCount > 0 ? unreadCount : '';
        badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }
}

// Função para adicionar uma nova notificação
async function addNotificationToUser(userId, notification) {
    const userNotifications = await getNotifications(userId) || [];
    userNotifications.unshift(notification);
    await saveNotifications(userId, userNotifications);
    
    // Se for o usuário atual, atualiza a interface
    const currentUser = await getCurrentUser();
    if (currentUser && currentUser.id === userId) {
        if (window.location.pathname.includes('notifications.html')) {
            await renderNotifications();
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
export async function addFriendRequestNotification(senderName, senderId, receiverId) {
    const notification = {
        id: 'friend-request-' + Date.now() + '-' + receiverId,
        type: 'friend_request',
        title: t('notifications.types.friendRequest.title'),
        message: t('notifications.types.friendRequest.message', { name: senderName }),
        sender: senderName,
        senderId: senderId,
        date: new Date().toISOString(),
        read: false,
        status: 'pending',
        actions: ['accept', 'reject']
    };
    
    await addNotificationToUser(receiverId, notification);
    return notification;
}

export async function addFriendAcceptedNotification(accepterName, accepterId, originalSenderId) {
    const notification = {
        id: 'friend-accepted-' + Date.now() + '-' + originalSenderId,
        type: 'friend_accepted',
        title: t('notifications.types.friendAccepted.title'),
        message: t('notifications.types.friendAccepted.message', { name: accepterName }),
        sender: accepterName,
        senderId: accepterId,
        date: new Date().toISOString(),
        read: false,
        status: 'unread',
        actions: ['view']
    };
    
    await addNotificationToUser(originalSenderId, notification);
    return notification;
}

export async function addFollowNotification(senderName, senderId, receiverId) {
    const notification = {
        id: 'follow-' + Date.now() + '-' + receiverId,
        type: 'follow',
        title: t('notifications.types.follow.title'),
        message: t('notifications.types.follow.message', { name: senderName }),
        sender: senderName,
        senderId: senderId,
        date: new Date().toISOString(),
        read: false,
        status: 'unread'
    };
    
    await addNotificationToUser(receiverId, notification);
    return notification;
}



// Substituir a função existente por:
export async function addGroupInvitationNotification(groupName, groupId, adminName, adminId, userId) {
    const notification = {
        id: 'group-invite-' + Date.now() + '-' + userId,
        type: 'group_invitation',
        title: t('notifications.types.groupInvite.title'),
        message: t('notifications.types.groupInvite.message', { name: adminName, groupName: groupName }),
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
    
    await addNotificationToUser(userId, notification);
    return notification;
}

export async function addGroupLeaveNotification(groupName, leaverName, adminId) {
    const notification = {
        id: 'group-leave-' + Date.now() + '-' + adminId,
        type: 'group_leave',
        title: t('notifications.types.groupLeave.title'),
        message: t('notifications.types.groupLeave.message', { name: leaverName, groupName: groupName }),
        date: new Date().toISOString(),
        read: false,
        status: 'unread'
    };
    
    await addNotificationToUser(adminId, notification);
    return notification;
}

export async function addGroupRemovalNotification(groupName, adminName, userId) {
    const notification = {
        id: 'group-removal-' + Date.now() + '-' + userId,
        type: 'group_removal',
        title: t('notifications.types.groupRemoval.title'),
        message: t('notifications.types.groupRemoval.message', { name: adminName, groupName: groupName }),
        date: new Date().toISOString(),
        read: false,
        status: 'unread'
    };
    
    await addNotificationToUser(userId, notification);
    return notification;
}

export async function addMessageNotification(senderName, senderId, receiverId, messagePreview) {
    const notification = {
        id: 'message-' + Date.now() + '-' + receiverId,
        type: 'message',
        title: t('notifications.types.message.title'),
        message: t('notifications.types.message.message', { name: senderName, preview: messagePreview }),
        sender: senderName,
        senderId: senderId,
        date: new Date().toISOString(),
        read: false,
        status: 'unread',
        actions: ['view']
    };
    
    await addNotificationToUser(receiverId, notification);
    return notification;
}

export async function addCardAssignmentNotification(assignerName, assigneeId, cardTitle, boardTitle) {
    const notification = {
        id: 'card-assign-' + Date.now() + '-' + assigneeId,
        type: 'card_assignment',
        title: t('notifications.types.cardAssignment.title'),
        message: t('notifications.types.cardAssignment.message', { assignerName: assignerName, cardTitle: cardTitle, boardTitle: boardTitle }),
        sender: assignerName,
        date: new Date().toISOString(),
        read: false,
        status: 'unread',
        data: {
            cardTitle: cardTitle,
            boardTitle: boardTitle
        }
    };
    
    await addNotificationToUser(assigneeId, notification);
    return notification;
}

export async function addCardDueNotification(userId, cardTitle, boardName, cardId, dueDate) {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let type = 'card_due_today';
    let message = t('notifications.types.cardDueToday.message', { cardTitle: cardTitle });
    
    if (diffDays < 0) {
        type = 'card_overdue';
        message = t('notifications.types.cardOverdue.message', { cardTitle: cardTitle });
    } else if (diffDays <= 7) {
        type = 'card_due_week';
        message = t('notifications.types.cardDueWeek.message', { cardTitle: cardTitle, days: diffDays });
    } else if (diffDays <= 30) {
        type = 'card_due_month';
        message = t('notifications.types.cardDueMonth.message', { cardTitle: cardTitle, weeks: Math.ceil(diffDays/7) });
    }
    
    const notification = {
        id: `card-due-${cardId}`,
        type: type,
        title: t('notifications.types.dueDate.title'),
        message: message,
        date: new Date().toISOString(),
        read: false,
        data: { boardName, cardId, dueDate }
    };
    await addNotificationToUser(userId, notification);
}

export async function addMeetingNotification(meetingTitle, groupName, meetingDate) {
    await addNotificationToUser(currentUser.id, { // Notifica o usuário atual
        type: 'meeting', title: t('notifications.types.meeting.title'), message: t('notifications.types.meeting.message', { title: meetingTitle, groupName: groupName }),
        group: groupName,
        meetingDate: meetingDate
    });
}

export async function addReportNotification(userId, period, groupName) {
    const periodNames = {
        daily: t('ui.daily'),
        weekly: t('ui.weekly'),
        monthly: t('ui.monthly')
    };
    
    const notification = {
        id: `report-${groupName}-${Date.now()}`,
        type: 'report',
        title: t('notifications.types.report.title'),
        message: t('notifications.types.report.message', { period: periodNames[period], groupName: groupName }),
        date: new Date().toISOString(),
        read: false,
        data: { groupName, period }
    };
    await addNotificationToUser(userId, notification);
}

export async function addGroupRequestNotification(groupName, groupId, userName, userId, adminId) {
    const notification = {
        id: 'group-request-' + Date.now(),
        type: 'group_request',
        title: t('notifications.types.groupRequest.title'),
        message: t('notifications.types.groupRequest.message', { name: userName, groupName: groupName }),
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
    await addNotificationToUser(adminId, notification);
}