// js/list-users.js

import {
    getAllUsers,
    deleteUser,
    setCurrentUser,
    updateUser,
    validateMasterPassword
} from './auth.js';
import { showFloatingMessage, initDraggableElements, showConfirmationDialog, showDialogMessage } from './ui-controls.js';

// ===== ESTADO GLOBAL E FUNÇÕES =====
let users = [];
let selectedUserIdForAction = null;
let currentLoginAction = 'login'; // 'login' ou 'edit'

// A lógica de inicialização agora está dentro de uma função exportada
export function initListUsersPage() {
    applyTheme();
    loadAndRenderUsers();
    setupEventListeners(); // Chamada única
    initDraggableElements();
}

// O restante do arquivo continua igual, com as funções sendo chamadas pela initListUsersPage
function loadAndRenderUsers() {
    try {
        users = getAllUsers();
        renderUsersTable();
        if (users.length === 0) {
            showFeedback('Nenhum usuário cadastrado. Clique em "Criar Novo Usuário" para começar.', 'info');
        }
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        showFeedback('Ocorreu um erro ao carregar a lista de usuários.', 'error');
    }
}

function setupEventListeners() {
    document.getElementById('btn-new-user').addEventListener('click', () => {
        window.location.href = 'create-user.html';
    });
    document.getElementById('toggleTheme').addEventListener('click', toggleTheme);

    const loginDialog = document.getElementById('login-dialog');
    document.getElementById('login-submit').addEventListener('click', handleLogin);
    document.getElementById('login-cancel').addEventListener('click', () => loginDialog.close());
    loginDialog.addEventListener('close', () => document.getElementById('login-password').value = '');
    
    document.getElementById('btn-exit-app')?.addEventListener('click', () => {
        showConfirmationDialog(
            'Tem certeza que deseja fechar a aplicação?',
            (dialog) => { // onConfirm
                showDialogMessage(dialog, 'Fechando...', 'success');
                setTimeout(() => window.close(), 1000);
                return true;
            },
            null, // Usa o comportamento padrão para cancelar
            'Sim, Sair'
        );
    });
}

function renderUsersTable() {
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = ''; 

    if (users.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="4" style="text-align: center;">Nenhum usuário cadastrado.</td>`;
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
            <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleString('pt-BR') : 'Nunca'}</td>
            <td class="actions">
                <button class="btn btn-primary btn-login">🔑 Login</button>
                <button class="btn btn-secondary btn-edit">✏️ Editar</button>
                <button class="btn btn-danger btn-delete">🗑️ Excluir</button>
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
        showDialogMessage(loginDialog, 'Usuário não encontrado.', 'error');
        return;
    }

    if (user.password === password || validateMasterPassword(password)) {
        // --- SUCESSO NO LOGIN ---
        // 1. Mostra a mensagem de sucesso DENTRO do diálogo
        showDialogMessage(loginDialog, `Bem-vindo(a), ${user.name}!`, 'success');
        
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
        showDialogMessage(loginDialog, 'Senha incorreta. Tente novamente.', 'error');
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
        <h3 class="drag-handle">Excluir Usuário</h3>
        <p>Para excluir "${user.name}", por favor, digite a senha do usuário ou a senha mestra.</p>
        <div class="form-group" style="margin-top: 15px;">
            <input type="password" id="dynamic-confirm-password" placeholder="Digite a senha para confirmar" style="width: 100%;" autocomplete="current-password">
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn btn-secondary">Cancelar</button>
            <button class="btn btn-danger">Excluir Permanentemente</button>
        </div>
    `;

    document.body.appendChild(dialog);
    initDraggableElements(); // Garante que o novo diálogo seja arrastável

    const passwordInput = dialog.querySelector('#dynamic-confirm-password');
    const confirmBtn = dialog.querySelector('.btn-danger');
    const cancelBtn = dialog.querySelector('.btn-secondary');

    const closeDialog = () => {
        dialog.close();
        dialog.remove();
    };

    cancelBtn.addEventListener('click', () => {
        showDialogMessage(dialog, 'Operação cancelada.', 'info');
        setTimeout(closeDialog, 1500);
    });

    const handleConfirm = () => {
        const password = passwordInput.value;
        if (!password) {
            showDialogMessage(dialog, 'A senha é obrigatória para confirmar.', 'error');
            return;
        }

        if (user.password === password || validateMasterPassword(password)) {
            deleteUser(user.id);
            showDialogMessage(dialog, `Usuário "${user.name}" excluído.`, 'success');
            confirmBtn.disabled = true;
            cancelBtn.disabled = true;
            setTimeout(() => {
                closeDialog();
                loadAndRenderUsers();
            }, 1500);
        } else {
            showDialogMessage(dialog, 'Senha incorreta. Tente novamente.', 'error');
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

function toggleTheme() {
    // Alterna entre 'dark' e 'light'
    const currentTheme = localStorage.getItem('appTheme') || 'dark'; // Padrão agora é dark
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    localStorage.setItem('appTheme', newTheme);
    applyTheme(); // Reaplica o tema imediatamente
}

function applyTheme() {
    // Padrão do sistema é 'dark' se nada estiver salvo
    const savedTheme = localStorage.getItem('appTheme') || 'dark';
    
    document.body.classList.remove('light-mode', 'dark-mode');

    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.add('dark-mode');
    }
}