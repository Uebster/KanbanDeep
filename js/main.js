// js/main.js - VERSÃO FINAL SIMPLIFICADA E SEGURA

import { initUIControls, initDraggableElements, showConfirmationDialog, showDialogMessage, applyUserTheme, initCustomSelects } from './ui-controls.js';
import { getCurrentUser } from './auth.js';
import { initKanbanPage } from './kanban.js';
import { initListUsersPage } from './list-users.js';
import { initCreateUserPage } from './create-user.js';
import { initProfilePage } from './profile.js';
import { initGroupsPage, checkAndSendReports } from './groups.js';
import { initNotificationsPage } from './notifications.js';
import { initFriendsPage } from './friends.js'; // Já estava aqui
import { initTemplatesPage } from './templates.js';
import { initPublicProfilePage } from './public-profile.js';
import { updateUserAvatar } from './ui-controls.js';
import { t } from './translations.js';

/**
 * Ponto de entrada principal da aplicação.
 */
async function main() { // <-- Torna a função principal assíncrona
    initUIControls(); // <-- CHAMA A NOVA FUNÇÃO
    checkAndSendReports(); // Verifica e envia relatórios agendados

    const path = window.location.pathname;

    // Roteador:
    // Se for a página Kanban, apenas a sua inicialização específica é chamada.
    if (path.includes('kanban.html')) {
        await initKanbanPage();
        return;
    } 
    // Para TODAS as outras páginas, aplicamos o cabeçalho global ANTES de sua inicialização.
    else {
        if (path.includes('create-user.html')) {
            await initCreateUserPage();
        } else if (path.includes('public-profile.html')) {
            await initPublicProfilePage(); // <-- Adiciona await
        } else if (path.includes('profile.html')) {
            await initProfilePage();
        } else if (path.includes('groups.html')) {
            await initGroupsPage();
        } else if (path.includes('friends.html')) {
            await initFriendsPage();
        } else if (path.includes('notifications.html')) {
            await initNotificationsPage();
        } else if (path.includes('templates.html')) {
            await initTemplatesPage();
        } else if (path.includes('list-users.html') || path.endsWith('/')) {
            await initListUsersPage();
        }
        // O cabeçalho global é configurado DEPOIS que a página e suas traduções foram carregadas
        setupGlobalHeader();
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

    // Aplica o tema e a fonte do usuário em todas as páginas logadas
    applyUserTheme();

    // Inicializa selects customizados em todas as páginas
    initCustomSelects();

    // --- Lógica Flexível de Botões ---
    // Procura por cada botão e adiciona o listener APENAS se ele existir.
    
    const avatarBtn = document.getElementById('user-avatar-btn');
    if (avatarBtn) {
        // CORREÇÃO: Usa a função padronizada para exibir o avatar corretamente
        if (currentUser) updateUserAvatar(currentUser);

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

    // O botão Kanban é específico do Kanban, mas pode aparecer em outras páginas.
    // Se aparecer, ele deve redirecionar para a página Kanban.
    // A inicialização da página Kanban é feita no roteador principal.
    const kanbanBtn = document.getElementById('kanban-btn');
    if (kanbanBtn) kanbanBtn.addEventListener('click', () => window.location.href = 'kanban.html');

    const groupsBtn = document.getElementById('my-groups-btn');
    if (groupsBtn) groupsBtn.addEventListener('click', () => window.location.href = 'groups.html');
    
    const templatesBtn = document.getElementById('templates-btn'); 
    if (templatesBtn) templatesBtn.addEventListener('click', () => window.location.href = 'templates.html');

    const friendsBtn = document.getElementById('friends-btn');
    if (friendsBtn) friendsBtn.addEventListener('click', () => window.location.href = 'friends.html');

    const notificationsBtn = document.getElementById('notifications-btn');
    if (notificationsBtn) notificationsBtn.addEventListener('click', () => window.location.href = 'notifications.html');

    const switchUserBtn = document.getElementById('switch-user-btn');
    if (switchUserBtn) switchUserBtn.addEventListener('click', () => window.location.href = 'list-users.html');

    const exitBtn = document.getElementById('exit-btn');
    if (exitBtn) exitBtn.addEventListener('click', () => {
        showConfirmationDialog(
            t('listUsers.confirm.exitApp'),
            (dialog) => {
                showDialogMessage(dialog, t('listUsers.feedback.closing'), 'info');
                setTimeout(() => window.close(), 1000);
                return true;
            },
            null, t('ui.yesExit')
        );
    });

    // Define o título da página (pode ser sobrescrito pelo script da página)
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        // Tenta pegar o título da tag <title> do HTML
        pageTitle.textContent = document.title.split('-')[0].trim(); 
    }
}

document.addEventListener('DOMContentLoaded', main);