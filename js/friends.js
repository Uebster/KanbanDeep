// js/friends.js

import { getCurrentUser, updateUser } from './auth.js';
import { getAllUsers, getUserProfile, removeFriend, addFriend, getNotifications, saveNotifications, } from './storage.js';
import { addFriendRequestNotification, addFriendAcceptedNotification } from './notifications.js'; // A importação de 't' já estava aqui
import { showFloatingMessage, showConfirmationDialog, showDialogMessage, debounce } from './ui-controls.js';
import { t, initTranslations } from './translations.js'; // Garantindo que a importação esteja presente

let currentUser;
let allUsers = [];
let friends = [];
let receivedRequests = [];
let sentRequests = [];

export async function initFriendsPage() {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.href = 'list-users.html';
        return;
    }

    await initTranslations();

    allUsers = await getAllUsers();
    
    setupEventListeners();
    await loadAndRenderAll();
}

function setupEventListeners() {
document.querySelectorAll('.nav-item').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

    document.getElementById('friend-filter-input')?.addEventListener('input', (e) => renderFriendsList(e.target.value));
    document.getElementById('user-search-input')?.addEventListener('input', debounce((e) => renderUserSearchResults(e.target.value), 300));

    document.querySelector('main.card').addEventListener('click', handleActionClick);
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.nav-item[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

async function loadAndRenderAll() {
    const userProfile = await getUserProfile(currentUser.id);
    friends = (userProfile.friends || []).map(id => allUsers.find(u => u.id === id)).filter(Boolean);
    
    const notifications = await getNotifications(currentUser.id);
    receivedRequests = (notifications || []).filter(n => n.type === 'friend_request' && n.status === 'pending');

    // CORREÇÃO: Para solicitações enviadas, precisamos manter o contexto de quem é o destinatário.
    const allNotificationsWithContext = [];
    for (const user of allUsers) {
        const userNotifications = await getNotifications(user.id) || [];
        userNotifications.forEach(notification => {
            allNotificationsWithContext.push({ ...notification, receiverId: user.id }); // Adiciona o ID do destinatário
        });
    sentRequests = allNotificationsWithContext.filter(n => n.type === 'friend_request' && n.senderId === currentUser.id && n.status === 'pending');

    renderFriendsList();
    renderRequests();
    renderUserSearchResults();
}

function renderFriendsList(filter = '') {
    const listEl = document.getElementById('friends-list');
    listEl.innerHTML = '';
    const filteredFriends = friends.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));

    if (filteredFriends.length === 0) {
        listEl.innerHTML = `<div class="empty-list-message"><span class="icon">🧑‍🤝‍🧑</span>${t('friends.list.noFriends')}</div>`;
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
                <button class="btn btn-secondary btn-sm" data-action="view-profile" data-id="${friend.id}">${t('friends.button.viewProfile')}</button>
                <button class="btn btn-danger btn-sm" data-action="remove-friend" data-id="${friend.id}">${t('friends.button.remove')}</button>
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
        receivedListEl.innerHTML = `<div class="empty-list-message"><span class="icon">📥</span>${t('friends.requests.emptyList')}</div>`;
    } else {
        receivedRequests.forEach(req => {
            const itemEl = document.createElement('div');
            itemEl.className = 'request-item';
            itemEl.innerHTML = `
                <div class="request-avatar"><img src="${allUsers.find(u => u.id === req.senderId)?.avatar || `https://ui-avatars.com/api/?name=${req.sender}&background=random`}" alt="Avatar de ${req.sender}"></div>
                <div class="request-info">
                    <div class="request-name">${req.sender}</div>
                    <div class="request-message">${t('friends.requests.sentYouRequest')}</div>
                </div>
                <div class="request-actions">
                    <button class="btn btn-primary btn-sm" data-action="accept-request" data-id="${req.id}">${t('friends.button.accept')}</button>
                    <button class="btn btn-secondary btn-sm" data-action="reject-request" data-id="${req.id}">${t('friends.button.reject')}</button>
                </div>
            `;
            receivedListEl.appendChild(itemEl);
        });
    }

    if (sentRequests.length === 0) {
        sentListEl.innerHTML = `<div class="empty-list-message"><span class="icon">📤</span>${t('friends.requests.sentEmptyList')}</div>`;
    } else {
        sentRequests.forEach(req => {
            const receiver = allUsers.find(u => u.id === req.receiverId); // CORREÇÃO: Usa a propriedade receiverId
            if (!receiver) return;
            const itemEl = document.createElement('div');
            itemEl.className = 'request-item';
            itemEl.innerHTML = `
                <div class="request-avatar"><img src="${receiver.avatar || `https://ui-avatars.com/api/?name=${receiver.name}&background=random`}" alt="Avatar de ${receiver.name}"></div>
                <div class="request-info">
                    <div class="request-name">${t('friends.requests.sentTo', { name: receiver.name })}</div>
                </div>
                <div class="request-actions">
                    <button class="btn btn-danger btn-sm" data-action="cancel-request" data-id="${req.id}" data-receiver-id="${receiver.id}">${t('friends.button.cancel')}</button>
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
        resultsEl.innerHTML = `<p class="empty-list-message">${t('friends.search.empty')}</p>`;
        return;
    }

    const friendIds = friends.map(f => f.id);
    const filteredUsers = allUsers.filter(user => 
        user.id !== currentUser.id &&
        !friendIds.includes(user.id) &&
        (user.name.toLowerCase().includes(query.toLowerCase()) || user.username.toLowerCase().includes(query.toLowerCase()))
    );

    if (filteredUsers.length === 0) {
        resultsEl.innerHTML = `<p class="empty-list-message">${t('friends.search.noResults')}</p>`;
        return;
    }

    filteredUsers.forEach(user => {
        // Calcula amigos em comum
        const currentUserFriendIds = friends.map(f => f.id);
        const targetUserFriendIds = user.friends || [];
        const mutualFriendsCount = currentUserFriendIds.filter(id => targetUserFriendIds.includes(id)).length;

        const itemEl = document.createElement('div');
        itemEl.className = 'user-item';
        itemEl.innerHTML = `
            <div class="user-avatar"><img src="${user.avatar || `https://ui-avatars.com/api/?name=${user.name}&background=random`}" alt="Avatar de ${user.name}"></div>
            <div class="user-info">
                <div class="user-name">${user.name}</div>
                <div class="user-username">@${user.username}</div>
                ${mutualFriendsCount > 0 ? 
                    `<div class="user-mutual-friends">🧑‍🤝‍🧑 ${t('friends.search.mutualFriends', { count: mutualFriendsCount })}</div>` : ''
                }
            </div>
            <div class="user-actions">
                <button class="btn btn-secondary btn-sm" data-action="view-profile" data-id="${user.id}">${t('friends.button.viewProfile')}</button>
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
            showConfirmationDialog(t('friends.confirm.removeFriend'), async (dialog) => {
                await removeFriend(currentUser.id, id);
                showDialogMessage(dialog, t('friends.feedback.friendRemovedSuccess'), 'success');
                await loadAndRenderAll();
                return true;
            });
            break;

        case 'accept-request':
            const requestToAccept = receivedRequests.find(r => r.id === id);
            if (requestToAccept) {
                await addFriend(currentUser.id, requestToAccept.senderId);
                requestToAccept.status = 'accepted';
                await saveNotifications(currentUser.id, await getNotifications(currentUser.id));

                // Notifica o usuário que enviou a solicitação
                await addFriendAcceptedNotification(currentUser.name, currentUser.id, requestToAccept.senderId);

                showFloatingMessage(t('friends.feedback.friendAdded'), 'success');
                await loadAndRenderAll();
            }
            break;

        case 'reject-request':
            const requestToReject = receivedRequests.find(r => r.id === id);
            if (requestToReject) {
                requestToReject.status = 'rejected';
                await saveNotifications(currentUser.id, await getNotifications(currentUser.id));
                showFloatingMessage(t('friends.feedback.requestRejected'), 'info');
                await loadAndRenderAll();
            }
            break;

        case 'cancel-request':
            const receiverId = button.dataset.receiverId;
            const receiverNotifications = await getNotifications(receiverId);
            const updatedReceiverNotifications = receiverNotifications.filter(n => n.id !== id);
            await saveNotifications(receiverId, updatedReceiverNotifications);
            showFloatingMessage(t('friends.feedback.requestCancelled'), 'info');
            await loadAndRenderAll();
            break;

        case 'add-friend':
            const userToAdd = allUsers.find(u => u.id === id);
            if (userToAdd) {
                await addFriendRequestNotification(currentUser.name, currentUser.id, userToAdd.id);
                showFloatingMessage(t('friends.feedback.requestSent', { name: userToAdd.name }), 'success');
                await loadAndRenderAll();
            }
            break;

        case 'view-profile':
            window.location.href = `public-profile.html?userId=${id}`;
            break;
    }
}
}