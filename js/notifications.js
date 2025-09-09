// js/notifications.js - Versão final refatorada
import { 
    getNotifications, 
    saveNotifications,
    getGroup,
    saveGroup,
    getUserProfile,
    saveUserProfile
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
    applyUserTheme();
    
    const currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'list-users.html';
        return;
    }
   
    if (currentUser) {
        updateUserAvatar(currentUser);
    }

    setupEventListeners();
    setupTabs();
    loadNotifications();
    renderNotifications();
    updateNotificationBadge();
}

function setupEventListeners() {
    document.getElementById('kanban-btn')?.addEventListener('click', () => window.location.href = 'kanban.html');
    // Botão de marcar todas como lidas
    document.getElementById('markAllRead')?.addEventListener('click', markAllAsRead);
    
    // Filtro de notificações
    document.getElementById('notificationFilter')?.addEventListener('change', filterNotifications);
    document.getElementById('timeFilter')?.addEventListener('change', filterNotificationsByTime);
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
    
    document.getElementById('confirmation-confirm')?.addEventListener('click', handleConfirmation);
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => tab.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
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
    
    notifications = getNotifications(currentUser.id);
    
    // Se não houver notificações, criar algumas de exemplo
    if (notifications.length === 0) {
        notifications = generateSampleNotifications();
        saveNotifications(currentUser.id, notifications);
    }
}

function generateSampleNotifications() {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    return [
        {
            id: 'notif-1',
            type: 'friend_request',
            title: 'Solicitação de Amizade',
            message: 'Maria Silva quer ser sua amiga',
            sender: 'user-maria',
            date: now.toISOString(),
            read: false,
            status: 'pending'
        },
        {
            id: 'notif-2',
            type: 'friend_accepted',
            title: 'Amizade Aceita',
            message: 'João Santos aceitou sua solicitação de amizade',
            sender: 'user-joao',
            date: yesterday.toISOString(),
            read: false
        },
        {
            id: 'notif-3',
            type: 'group_request',
            title: 'Solicitação de Grupo',
            message: 'Você foi convidado para o grupo "Projeto Alpha"',
            group: 'group-alpha',
            date: now.toISOString(),
            read: false,
            status: 'pending'
        },
        {
            id: 'notif-4',
            type: 'card_overdue',
            title: 'Cartão Atrasado',
            message: 'O cartão "Relatório Trimestral" está atrasado',
            board: 'Trabalho',
            card: 'card-123',
            date: now.toISOString(),
            read: false
        },
        {
            id: 'notif-5',
            type: 'card_due_today',
            title: 'Cartão com Vencimento Hoje',
            message: 'O cartão "Reunião de Equipe" vence hoje',
            board: 'Trabalho',
            card: 'card-456',
            date: now.toISOString(),
            read: false
        },
        {
            id: 'notif-6',
            type: 'card_mention',
            title: 'Menção em Cartão',
            message: 'Você foi mencionado no cartão "Planejamento de Sprint"',
            board: 'Trabalho',
            card: 'card-789',
            sender: 'user-carlos',
            date: yesterday.toISOString(),
            read: false
        },
        {
            id: 'notif-7',
            type: 'message_user',
            title: 'Mensagem de Usuário',
            message: 'Ana Costa enviou uma mensagem para você',
            sender: 'user-ana',
            date: now.toISOString(),
            read: false
        },
        {
            id: 'notif-8',
            type: 'message_group',
            title: 'Mensagem de Grupo',
            message: 'Nova mensagem no grupo "Projeto Beta"',
            group: 'group-beta',
            sender: 'user-pedro',
            date: yesterday.toISOString(),
            read: false
        },
        {
            id: 'notif-9',
            type: 'meeting',
            title: 'Reunião Agendada',
            message: 'Reunião de equipe marcada para amanhã às 14:00',
            group: 'group-alpha',
            meetingDate: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            date: now.toISOString(),
            read: false
        },
        {
            id: 'notif-10',
            type: 'report',
            title: 'Relatório Semanal',
            message: 'Seu relatório semanal está disponível',
            period: 'week',
            date: lastWeek.toISOString(),
            read: true
        }
    ];
}

function renderNotifications() {
    const notificationsList = document.querySelector('.notifications-list');
    if (!notificationsList) return;
    
    notificationsList.innerHTML = '';
    
    if (notifications.length === 0) {
        notificationsList.innerHTML = '<p class="no-notifications">Nenhuma notificação encontrada.</p>';
        return;
    }
    
    const filteredNotifications = filterNotificationsByType(notifications, currentFilter);
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
    
    notificationEl.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-content">
            <div class="notification-title">${notification.title}</div>
            <div class="notification-message">${notification.message}</div>
            <div class="notification-meta">
                ${notification.board ? `<span>Quadro: ${notification.board}</span>` : ''}
                ${notification.group ? `<span>Grupo: ${notification.group}</span>` : ''}
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
        card_mention: '📍',
        card_overdue: '⏰',
        card_due_today: '📅',
        card_due_week: '📆',
        card_due_month: '🗓️',
        card_assignment: '📌',
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
    const notificationsList = notifications.filter(n => n.type.includes('card_'));
    
    const cardNotificationsList = document.querySelector('#card-notifications .notifications-list');
    if (!cardNotificationsList) return;
    
    cardNotificationsList.innerHTML = '';
    
    let filteredNotifications = notificationsList;
    
    if (filter !== 'all') {
        filteredNotifications = notificationsList.filter(notification => notification.type === `card_${filter}`);
    }
    
    if (filteredNotifications.length === 0) {
        cardNotificationsList.innerHTML = '<p class="no-notifications">Nenhuma notificação de cartão encontrada.</p>';
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
    
    const groupRequests = notifications.filter(n => n.type === 'group_request' && n.status === 'pending');
    
    requestsList.innerHTML = '';
    
    if (groupRequests.length === 0) {
        requestsList.innerHTML = '<p class="no-requests">Nenhuma solicitação de grupo pendente.</p>';
        return;
    }
    
    groupRequests.forEach(request => {
        const requestEl = document.createElement('div');
        requestEl.className = 'request-item';
        requestEl.dataset.id = request.id;
        
        requestEl.innerHTML = `
            <div class="request-avatar">
                <img src="https://ui-avatars.com/api/?name=${request.group}&background=random" alt="${request.group}">
            </div>
            <div class="request-info">
                <div class="request-name">${request.group}</div>
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
                    showDialogMessage(dialog.querySelector('.feedback'), 'Solicitação de amizade aceita!', 'success');
                } else if (notification.type === 'group_request') {
                    // Adicionar usuário ao grupo
                    const group = getGroup(notification.groupId);
                    if (group) {
                        if (!group.memberIds.includes(currentUser.id)) {
                            group.memberIds.push(currentUser.id);
                            saveGroup(group);
                            
                            // Adicionar grupo ao perfil do usuário
                            const userProfile = getUserProfile(currentUser.id);
                            if (userProfile) {
                                if (!userProfile.groupIds) userProfile.groupIds = [];
                                if (!userProfile.groupIds.includes(group.id)) {
                                    userProfile.groupIds.push(group.id);
                                    saveUserProfile(userProfile);
                                }
                            }
                            
                            showDialogMessage(dialog.querySelector('.feedback'), 'Você entrou no grupo com sucesso!', 'success');
                        }
                    }
                } else if (notification.type === 'group_invitation') {
                    // Lógica para convites de grupo
                    const group = getGroup(notification.groupId);
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
                        
                        showDialogMessage(dialog.querySelector('.feedback'), 'Convite de grupo aceito!', 'success');
                    }
                }
                
                saveNotifications(currentUser.id, notifications);
                renderNotifications();
                updateNotificationBadge();
                
                return true;
            } catch (error) {
                console.error('Erro ao aceitar notificação:', error);
                showDialogMessage(dialog.querySelector('.feedback'), 'Erro ao processar a solicitação.', 'error');
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
            updateNotificationBadge();
            
            showDialogMessage(dialog.querySelector('.feedback'), 'Solicitação recusada.', 'info');
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
        actionBtn.textContent = 'Abrir Cartão';
        actionBtn.style.display = 'block';
        actionBtn.onclick = () => {
            // Lógica para abrir o cartão
            showFloatingMessage(`Abrindo cartão: ${notification.card}`, 'info');
            dialog.close();
        };
    } else if (notification.type.includes('message_')) {
        actionBtn.textContent = 'Responder';
        actionBtn.style.display = 'block';
        actionBtn.onclick = () => {
            // Lógica para responder mensagem
            showFloatingMessage('Abrindo conversa...', 'info');
            dialog.close();
        };
    } else {
        actionBtn.style.display = 'none';
    }
    
    dialog.showModal();
}

function handleNotificationDialogAction() {
    // Esta função será implementada com base no tipo de notificação
    const dialog = document.getElementById('notification-details-dialog');
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

function applyUserTheme() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const userTheme = currentUser.theme || 'auto';
    const systemTheme = localStorage.getItem('appTheme') || 'dark';
    
    document.body.classList.remove('light-mode', 'dark-mode');

    if (userTheme === 'light') {
        document.body.classList.add('light-mode');
    } else if (userTheme === 'dark') {
        document.body.classList.add('dark-mode');
    } else { // Modo 'auto'
        if (systemTheme === 'light') {
            document.body.classList.add('light-mode');
        } else {
            document.body.classList.add('dark-mode');
        }
    }
}

// Função para adicionar uma nova notificação
export function addNotification(type, title, message, data = {}) {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    const newNotification = {
        id: 'notif-' + Date.now(),
        type,
        title,
        message,
        date: new Date().toISOString(),
        read: false,
        ...data
    };
    
    notifications.unshift(newNotification);
    saveNotifications(currentUser.id, notifications);
    
    // Se estiver na página de notificações, atualizar a lista
    if (window.location.pathname.includes('notifications.html')) {
        renderNotifications();
    } else {
        updateNotificationBadge();
    }
    
    // Mostrar notificação flutuante
    showFloatingMessage(message, type.includes('overdue') ? 'error' : 'info');
}

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
        showFloatingMessage(notification.message, 
                           notification.type.includes('removal') ? 'error' : 'info');
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
        group: groupName,
        groupId: groupId,
        adminId: adminId,
        date: new Date().toISOString(),
        read: false,
        status: 'pending',
        actions: ['accept', 'reject']
    };
    
    addNotificationToUser(userId, notification);
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

export function addCardDueNotification(cardTitle, boardName, cardId, dueDate) {
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
    
    addNotification(type, 'Notificação de Cartão', message, {
        board: boardName,
        card: cardId,
        dueDate: dueDate
    });
}

export function addMeetingNotification(meetingTitle, groupName, meetingDate) {
    addNotification('meeting', 'Reunião Agendada', `${meetingTitle} no grupo ${groupName}`, {
        group: groupName,
        meetingDate: meetingDate
    });
}

export function addReportNotification(period) {
    const periodNames = {
        daily: 'diário',
        weekly: 'semanal',
        monthly: 'mensal'
    };
    
    addNotification('report', 'Relatório Disponibilizado', `Seu relatório ${periodNames[period]} está disponível`, {
        period: period
    });
}

export function addCardAssignmentNotification(assignerName, assigneeId, cardTitle, boardName) {
    const notification = {
        id: 'card-assign-' + Date.now() + '-' + assigneeId,
        type: 'card_assignment',
        title: 'Nova Tarefa Atribuída',
        message: `${assignerName} atribuiu o cartão "${cardTitle}" a você no quadro "${boardName}".`,
        sender: assignerName,
        board: boardName,
        date: new Date().toISOString(),
        read: false,
        status: 'unread',
        actions: ['view']
    };
    
    addNotificationToUser(assigneeId, notification);
    return notification;
}

function handleConfirmation() {
    const dialog = document.getElementById('confirmation-dialog');
    const feedbackEl = dialog.querySelector('.feedback');
    
    // Fechar o diálogo de confirmação
    dialog.close();
}