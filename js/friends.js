// js/friends.js

import { getCurrentUser, updateUser } from './auth.js';
import { getAllUsers, getUserProfile, removeFriend, addFriend, getNotifications, saveNotifications } from './storage.js';
import { addFriendRequestNotification } from './notifications.js';
import { showFloatingMessage, showConfirmationDialog, showDialogMessage } from './ui-controls.js';

let currentUser;
let allUsers = [];
let friends = [];
let receivedRequests = [];
let sentRequests = [];

export function initFriendsPage() {
    currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'list-users.html';
        return;
    }
    allUsers = getAllUsers();
    
    setupEventListeners();
    loadAndRenderAll();
}

function setupEventListeners() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.tab));
    });

    document.getElementById('friend-filter-input')?.addEventListener('input', (e) => renderFriendsList(e.target.value));
    document.getElementById('user-search-input')?.addEventListener('input', debounce((e) => renderUserSearchResults(e.target.value), 300));

    document.querySelector('main.container').addEventListener('click', handleActionClick);
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

function loadAndRenderAll() {
    const userProfile = getUserProfile(currentUser.id);
    friends = (userProfile.friends || []).map(id => allUsers.find(u => u.id === id)).filter(Boolean);
    
    const notifications = getNotifications(currentUser.id);
    receivedRequests = notifications.filter(n => n.type === 'friend_request' && n.status === 'pending');

    // Para solicitações enviadas, precisamos verificar as notificações de outros usuários
    const allNotifications = allUsers.flatMap(u => getNotifications(u.id));
    sentRequests = allNotifications.filter(n => n.type === 'friend_request' && n.senderId === currentUser.id && n.status === 'pending');

    renderFriendsList();
    renderRequests();
    renderUserSearchResults();
}

function renderFriendsList(filter = '') {
    const listEl = document.getElementById('friends-list');
    listEl.innerHTML = '';
    const filteredFriends = friends.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));

    if (filteredFriends.length === 0) {
        listEl.innerHTML = '<div class="empty-list-message"><span class="icon">🧑‍🤝‍🧑</span>Você ainda não tem amigos. Use a aba "Buscar Usuários" para encontrar pessoas.</div>';
        return;
    }

    filteredFriends.forEach(friend => {
        const itemEl = document.createElement('div');
        itemEl.className = 'user-item';
        itemEl.innerHTML = `
            <div class="user-avatar">
                <img src="${friend.avatar || `https://ui-avatars.com/api/?name=${friend.name}&background=random`}" alt="Avatar de ${friend.name}">
            </div>
            <div class="user-info">
                <div class="user-name">${friend.name}</div>
                <div class="user-username">@${friend.username}</div>
            </div>
            <div class="user-actions">
                <button class="btn btn-secondary btn-sm" data-action="view-profile" data-id="${friend.id}">Ver Perfil</button>
                <button class="btn btn-danger btn-sm" data-action="remove-friend" data-id="${friend.id}">Remover</button>
            </div>
        `;
        listEl.appendChild(itemEl);
    });
}

function renderRequests() {
    const receivedListEl = document.getElementById('received-requests-list');
    const sentListEl = document.getElementById('sent-requests-list');
    receivedListEl.innerHTML = '';
    sentListEl.innerHTML = '';

    if (receivedRequests.length === 0) {
        receivedListEl.innerHTML = '<p class="empty-list-message">Nenhuma solicitação de amizade recebida.</p>';
    } else {
        receivedRequests.forEach(req => {
            const itemEl = document.createElement('div');
            itemEl.className = 'request-item';
            itemEl.innerHTML = `
                <div class="request-avatar"><img src="${allUsers.find(u => u.id === req.senderId)?.avatar || `https://ui-avatars.com/api/?name=${req.sender}&background=random`}" alt="Avatar de ${req.sender}"></div>
                <div class="request-info">
                    <div class="request-name">${req.sender}</div>
                    <div class="request-message">Enviou uma solicitação de amizade.</div>
                </div>
                <div class="request-actions">
                    <button class="btn btn-primary btn-sm" data-action="accept-request" data-id="${req.id}">Aceitar</button>
                    <button class="btn btn-secondary btn-sm" data-action="reject-request" data-id="${req.id}">Recusar</button>
                </div>
            `;
            receivedListEl.appendChild(itemEl);
        });
    }

    if (sentRequests.length === 0) {
        sentListEl.innerHTML = '<p class="empty-list-message">Nenhuma solicitação de amizade enviada.</p>';
    } else {
        sentRequests.forEach(req => {
            const receiver = allUsers.find(u => u.id === req.userId);
            if (!receiver) return;
            const itemEl = document.createElement('div');
            itemEl.className = 'request-item';
            itemEl.innerHTML = `
                <div class="request-avatar"><img src="${receiver.avatar || `https://ui-avatars.com/api/?name=${receiver.name}&background=random`}" alt="Avatar de ${receiver.name}"></div>
                <div class="request-info">
                    <div class="request-name">Solicitação enviada para ${receiver.name}</div>
                </div>
                <div class="request-actions">
                    <button class="btn btn-danger btn-sm" data-action="cancel-request" data-id="${req.id}" data-receiver-id="${receiver.id}">Cancelar</button>
                </div>
            `;
            sentListEl.appendChild(itemEl);
        });
    }
}

function renderUserSearchResults(query = '') {
    const resultsEl = document.getElementById('user-search-results');
    resultsEl.innerHTML = '';

    if (!query) {
        resultsEl.innerHTML = '<p class="empty-list-message">Digite um nome para começar a buscar.</p>';
        return;
    }

    const friendIds = friends.map(f => f.id);
    const filteredUsers = allUsers.filter(user => 
        user.id !== currentUser.id &&
        !friendIds.includes(user.id) &&
        (user.name.toLowerCase().includes(query.toLowerCase()) || user.username.toLowerCase().includes(query.toLowerCase()))
    );

    if (filteredUsers.length === 0) {
        resultsEl.innerHTML = '<p class="empty-list-message">Nenhum usuário encontrado.</p>';
        return;
    }

    filteredUsers.forEach(user => {
        const isRequestSent = sentRequests.some(req => req.userId === user.id);
        const itemEl = document.createElement('div');
        itemEl.className = 'user-item';
        itemEl.innerHTML = `
            <div class="user-avatar"><img src="${user.avatar || `https://ui-avatars.com/api/?name=${user.name}&background=random`}" alt="Avatar de ${user.name}"></div>
            <div class="user-info">
                <div class="user-name">${user.name}</div>
                <div class="user-username">@${user.username}</div>
            </div>
            <div class="user-actions">
                <button class="btn btn-primary btn-sm" data-action="add-friend" data-id="${user.id}" ${isRequestSent ? 'disabled' : ''}>
                    ${isRequestSent ? 'Solicitado' : 'Adicionar'}
                </button>
            </div>
        `;
        resultsEl.appendChild(itemEl);
    });
}

async function handleActionClick(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    switch (action) {
        case 'remove-friend':
            showConfirmationDialog(`Tem certeza que deseja remover este amigo?`, (dialog) => {
                removeFriend(currentUser.id, id);
                showDialogMessage(dialog, 'Amigo removido.', 'success');
                loadAndRenderAll();
                return true;
            });
            break;

        case 'accept-request':
            const requestToAccept = receivedRequests.find(r => r.id === id);
            if (requestToAccept) {
                addFriend(currentUser.id, requestToAccept.senderId);
                requestToAccept.status = 'accepted';
                saveNotifications(currentUser.id, getNotifications(currentUser.id));
                showFloatingMessage('Amigo adicionado!', 'success');
                loadAndRenderAll();
            }
            break;

        case 'reject-request':
            const requestToReject = receivedRequests.find(r => r.id === id);
            if (requestToReject) {
                requestToReject.status = 'rejected';
                saveNotifications(currentUser.id, getNotifications(currentUser.id));
                showFloatingMessage('Solicitação recusada.', 'info');
                loadAndRenderAll();
            }
            break;

        case 'cancel-request':
            const receiverId = button.dataset.receiverId;
            const receiverNotifications = getNotifications(receiverId);
            const updatedReceiverNotifications = receiverNotifications.filter(n => n.id !== id);
            saveNotifications(receiverId, updatedReceiverNotifications);
            showFloatingMessage('Solicitação cancelada.', 'info');
            loadAndRenderAll();
            break;

        case 'add-friend':
            const userToAdd = allUsers.find(u => u.id === id);
            if (userToAdd) {
                addFriendRequestNotification(currentUser.name, currentUser.id, userToAdd.id);
                showFloatingMessage(`Solicitação enviada para ${userToAdd.name}`, 'success');
                loadAndRenderAll();
            }
            break;

        case 'view-profile':
            window.location.href = `public-profile.html?userId=${id}`;
            break;
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}