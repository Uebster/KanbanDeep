// js/main.js - VERSÃO FINAL SIMPLIFICADA E SEGURA

import { initUIControls, initDraggableElements } from './ui-controls.js';
import { getCurrentUser } from './auth.js';
import { initKanbanPage } from './kanban.js';
import { initListUsersPage } from './list-users.js';
import { initCreateUserPage } from './create-user.js';
import { initProfilePage } from './profile.js';
import { initGroupsPage } from './groups.js';
import { initNotificationsPage } from './notifications.js';
import { initTemplatesPage } from './template.js';
import { updateUserAvatar } from './ui-controls.js';

/**
 * Ponto de entrada principal da aplicação.
 */
function main() {
    initUIControls(); // <-- CHAMA A NOVA FUNÇÃO
    initDraggableElements();

    const path = window.location.pathname;

    // Roteador:
    // Se for a página Kanban, apenas a sua inicialização específica é chamada.
    if (path.includes('kanban.html')) {
        initKanbanPage();
        return;
    } 
    // Para TODAS as outras páginas, aplicamos o cabeçalho global ANTES de sua inicialização.
    else {
        setupGlobalHeader();

        if (path.includes('create-user.html')) {
            initCreateUserPage();
        } else if (path.includes('profile.html')) {
            initProfilePage();
        } else if (path.includes('groups.html')) {
            initGroupsPage();
        } else if (path.includes('notifications.html')) {
            initNotificationsPage();
        } else if (path.includes('templates.html')) {
            initTemplatesPage();
        } else if (path.includes('kanban.html')) {
            initKanbanPage();
        } else if (path.includes('list-users.html') || path.endsWith('/')) {
            initListUsersPage();
    }
}
}

function initUserAvatar() {
    const currentUser = getCurrentUser();
    if (currentUser) {
        updateUserAvatar(currentUser);
    }
}

/**
 * Configura um cabeçalho global SIMPLES para todas as páginas, EXCETO o Kanban.
 * Ele é flexível: só adiciona funcionalidade aos botões que existem no HTML.
 */
function setupGlobalHeader() {
    const header = document.getElementById('main-header');
    if (!header) return;

    const currentUser = getCurrentUser();
    if (!currentUser && !window.location.pathname.includes('list-users.html')) {
        window.location.href = 'list-users.html';
        return;
    }

    // --- Lógica Flexível de Botões ---
    // Procura por cada botão e adiciona o listener APENAS se ele existir.
    
    const avatarBtn = document.getElementById('user-avatar-btn');
    if (avatarBtn) {
        const userAvatar = document.getElementById('user-avatar');
        if (userAvatar && currentUser) {
            userAvatar.src = currentUser.avatar || '../assets/kanban-deep-logo.png';
        }
        avatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('profile-dropdown')?.classList.toggle('show');
        });
    }

    // Listener global para fechar o dropdown de perfil
    document.addEventListener('click', (e) => {
        if (avatarBtn && !avatarBtn.contains(e.target)) {
            document.getElementById('profile-dropdown')?.classList.remove('show');
        }
    });

    // Adiciona listeners de navegação apenas aos botões que encontrar
    const profileBtn = document.getElementById('user-profile-btn');
    if (profileBtn) profileBtn.addEventListener('click', () => window.location.href = 'profile.html');

    const groupsBtn = document.getElementById('my-groups-btn');
    if (groupsBtn) groupsBtn.addEventListener('click', () => window.location.href = 'groups.html');
    
    const templatesBtn = document.getElementById('templates-btn'); 
    if (templatesBtn) templatesBtn.addEventListener('click', () => window.location.href = 'templates.html');

    const notificationsBtn = document.getElementById('notifications-btn');
    if (notificationsBtn) notificationsBtn.addEventListener('click', () => window.location.href = 'notifications.html');

    const switchUserBtn = document.getElementById('switch-user-btn');
    if (switchUserBtn) switchUserBtn.addEventListener('click', () => window.location.href = 'list-users.html');

    const exitBtn = document.getElementById('exit-btn');
    if (exitBtn) exitBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja fechar o aplicativo?')) window.close();
    });

    // Define o título da página (pode ser sobrescrito pelo script da página)
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        // Tenta pegar o título da tag <title> do HTML
        pageTitle.textContent = document.title.split('-')[0].trim(); 
    }
}

document.addEventListener('DOMContentLoaded', main);