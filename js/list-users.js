// js/list-users.js

import {
    getAllUsers,
    deleteUser,
    setCurrentUser,
    updateUser,
    validateMasterPassword
} from './auth.js';
import { showFloatingMessage, initDraggableElements, showConfirmationDialog, showDialogMessage, initCustomSelects } from './ui-controls.js';
import { loadLanguage, applyTranslations, t } from './translations.js';

// ===== ESTADO GLOBAL E FUNÇÕES =====
let users = [];
let selectedUserIdForAction = null;
let currentLoginAction = 'login'; // 'login' ou 'edit'

// A lógica de inicialização agora está dentro de uma função exportada
export async function initListUsersPage() {
    const lang = localStorage.getItem('appLanguage') || 'pt-BR';
    await loadLanguage(lang);
    applyTranslations();
    setupThemeSelector(); // Configura o tema ANTES de renderizar
    applyTheme(); // Aplica o tema inicial
    loadAndRenderUsers();
    setupEventListeners();
    initDraggableElements();
    document.getElementById('language-selector').value = lang;
    initCustomSelects();
}

// O restante do arquivo continua igual, com as funções sendo chamadas pela initListUsersPage
function loadAndRenderUsers() {
    try {
        users = getAllUsers();
        renderUsersTable();
        if (users.length === 0) {
            showFeedback(t('listUsers.feedback.noUsers'), 'info');
        }
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        showFeedback(t('listUsers.feedback.errorLoading'), 'error');
    }
}

function setupEventListeners() {
    document.getElementById('btn-new-user').addEventListener('click', () => {
        window.location.href = 'create-user.html';
    });

    const langSelector = document.getElementById('language-selector');
    if (langSelector) {
        langSelector.value = localStorage.getItem('appLanguage') || 'pt-BR';
        langSelector.addEventListener('change', handleLanguageChange);
    }

    const loginDialog = document.getElementById('login-dialog');
    document.getElementById('login-submit').addEventListener('click', handleLogin);
    document.getElementById('login-cancel').addEventListener('click', () => loginDialog.close());
    loginDialog.addEventListener('close', () => {
        // Limpa o campo de senha
        document.getElementById('login-password').value = '';
        // Esconde qualquer mensagem de feedback ao fechar
        const feedbackEl = loginDialog.querySelector('.feedback');
        if (feedbackEl) {
            feedbackEl.classList.remove('show');
        }
    });
    
    document.getElementById('btn-exit-app')?.addEventListener('click', () => {
        showConfirmationDialog(
            t('listUsers.confirm.exitApp'),
            (dialog) => { // onConfirm
                showDialogMessage(dialog, t('listUsers.feedback.closing'), 'success');
                setTimeout(() => window.close(), 1000);
                return true;
            },
            null,
            t('ui.yesExit')
        );
    });
}

function renderUsersTable() {
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = ''; 

    if (users.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="4" style="text-align: center;">${t('listUsers.table.noUsers')}</td>`;
        tbody.appendChild(tr);
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.dataset.userId = user.id;
        const hue = user.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
        const avatarBgColor = `hsl(${hue}, 65%, 65%)`;
        tr.innerHTML = `
            <td>
                <div class="avatar" style="${user.avatar ? '' : `background-color: ${avatarBgColor};`}">
                    ${user.avatar ? `<img src="${user.avatar}" alt="Avatar de ${user.name}">` : user.name.charAt(0).toUpperCase()}
                </div>
            </td>
            <td>${user.name}</td>
            <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : t('listUsers.table.lastLoginNever')}</td>
            <td class="actions">
                <button class="btn login btn-login">${t('listUsers.button.login')}</button>
                <button class="btn edit btn-edit">${t('listUsers.button.edit')}</button>
                <button class="btn danger btn-delete">${t('listUsers.button.delete')}</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-login').forEach(btn => btn.addEventListener('click', (e) => openLoginDialog(e.target.closest('tr').dataset.userId)));
    tbody.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', (e) => openEditDialog(e.target.closest('tr').dataset.userId)));
    tbody.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', (e) => openDeleteConfirmDialog(e.target.closest('tr').dataset.userId)));
}

function openLoginDialog(userId) {
    selectedUserIdForAction = userId;
    currentLoginAction = 'login';
    document.getElementById('login-dialog').showModal();
}

function openEditDialog(userId) {
    selectedUserIdForAction = userId;
    currentLoginAction = 'edit';
    document.getElementById('login-dialog').showModal();
}

function handleLogin() {
    const loginDialog = document.getElementById('login-dialog');
    const passwordInput = document.getElementById('login-password');
    const password = passwordInput.value;
    const user = users.find(u => u.id === selectedUserIdForAction);

    if (!user) {
        showDialogMessage(loginDialog, t('listUsers.feedback.userNotFound'), 'error');
        return;
    }

    if (user.password === password || validateMasterPassword(password)) {
        // --- SUCESSO NO LOGIN ---
        // 1. Mostra a mensagem de sucesso DENTRO do diálogo - CORRIGIDO
        showDialogMessage(loginDialog, t('listUsers.feedback.welcome', { userName: user.name }), 'success');
        
        // 2. Desabilita os botões para evitar cliques duplos
        loginDialog.querySelectorAll('button').forEach(btn => btn.disabled = true);
        
        // 3. Após um breve atraso, executa as ações e redireciona
        setTimeout(() => {
            user.lastLogin = new Date().toISOString();
            updateUser(user.id, user); 
            setCurrentUser(user);
            
            loginDialog.close();
            // Reabilita os botões para a próxima vez
            loginDialog.querySelectorAll('button').forEach(btn => btn.disabled = false);
            
            if (currentLoginAction === 'edit') {
                window.location.href = 'profile.html';
            } else {
                window.location.href = 'kanban.html';
            }
        }, 1500); // Espera 1.5s

    } else {
        // --- ERRO DE SENHA ---
        showDialogMessage(loginDialog, t('ui.incorrectPassword'), 'error');
        passwordInput.value = '';
        passwordInput.focus();
    }
}

function openDeleteConfirmDialog(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">${t('listUsers.deleteDialog.title')}</h3>
        <p>${t('listUsers.deleteDialog.confirm', { userName: user.name })}</p>
        <div class="form-group" style="margin-top: 15px;">
            <input type="password" id="dynamic-confirm-password" placeholder="${t('listUsers.deleteDialog.passwordPlaceholder')}" style="width: 100%;" autocomplete="current-password">
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
             <button class="btn btn-neon danger">${t('ui.deletePermanently')}</button>
            <button class="btn btn-neon cancel">${t('ui.cancel')}</button>
        </div>
    `;

    document.body.appendChild(dialog);
    initDraggableElements(); // Garante que o novo diálogo seja arrastável

    const passwordInput = dialog.querySelector('#dynamic-confirm-password');
    const confirmBtn = dialog.querySelector('.btn-neon.danger');
    const cancelBtn = dialog.querySelector('.btn-neon.cancel');

    const closeDialog = () => {
        dialog.close();
        dialog.remove();
    };

    cancelBtn.addEventListener('click', () => {
        showDialogMessage(dialog, t('ui.operationCancelled'), 'info');
        setTimeout(closeDialog, 1500);
    });

    const handleConfirm = () => {
        const password = passwordInput.value;
        if (!password) {
            showDialogMessage(dialog, t('listUsers.deleteDialog.passwordRequired'), 'error');
            return;
        }

        if (user.password === password || validateMasterPassword(password)) {
            deleteUser(user.id);
            showDialogMessage(dialog, t('listUsers.deleteDialog.success', { userName: user.name }), 'success');
            confirmBtn.disabled = true;
            cancelBtn.disabled = true;
            setTimeout(() => {
                closeDialog();
                loadAndRenderUsers();
            }, 1500);
        } else {
            showDialogMessage(dialog, t('ui.incorrectPassword'), 'error');
            passwordInput.value = '';
            passwordInput.focus();
        }
    };

    confirmBtn.addEventListener('click', handleConfirm);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        }
    });

    dialog.showModal();
}

function showFeedback(message, type = 'info') {
    const feedbackEl = document.getElementById('feedback');
    feedbackEl.textContent = message;
    feedbackEl.className = `feedback ${type} show`;
    setTimeout(() => {
        feedbackEl.classList.remove('show');
    }, 5000);
}

function setupThemeSelector() {
    const themeSelect = document.getElementById('theme-select');
    if (!themeSelect) return;

    const currentTheme = localStorage.getItem('appTheme') || 'dark-gray';
    themeSelect.value = currentTheme;

    applyTheme(currentTheme); // Aplica o tema inicial

    themeSelect.addEventListener('change', () => {
        const newTheme = themeSelect.value;
        localStorage.setItem('appTheme', newTheme);
        applyTheme(newTheme);
    });

    initCustomSelects(); // Estiliza o select após a configuração
}

function applyTheme() {
    const savedTheme = localStorage.getItem('appTheme') || 'dark-gray';
    
    document.body.classList.remove('light-mode', 'dark-mode', 'dark-gray-mode', 'light-gray-mode');
    switch (savedTheme) {
        case 'light': document.body.classList.add('light-mode'); break;
        case 'dark': document.body.classList.add('dark-mode'); break;
        case 'light-gray': document.body.classList.add('light-gray-mode'); break;
    }
}

async function handleLanguageChange(e) {
    const newLang = e.target.value;
    localStorage.setItem('appLanguage', newLang);
    await loadLanguage(newLang); // Espera o novo idioma carregar
    applyTranslations(); // Aplica as traduções em elementos estáticos
    
    // Recarrega e renderiza a tabela para traduzir os botões dinâmicos
    renderUsersTable();
    initCustomSelects(); // Re-inicializa os selects para garantir a tradução das opções
}