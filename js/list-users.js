// js/list-users.js

import {
    getAllUsers,
    deleteUser,
    setCurrentUser,
    validateMasterPassword,
    updateUser
} from './auth.js';
import { showFloatingMessage, initDraggableElements } from './ui-controls.js';

// ===== ESTADO GLOBAL E FUNÇÕES =====
let users = [];
let selectedUserIdForAction = null;

// A lógica de inicialização agora está dentro de uma função exportada
export function initListUsersPage() {
    applyTheme();
    loadAndRenderUsers();
    setupEventListeners();

        setupEventListeners();
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

    const confirmDialog = document.getElementById('confirm-dialog');
    document.getElementById('confirm-ok').addEventListener('click', handleConfirmAction);
    document.getElementById('confirm-cancel').addEventListener('click', () => confirmDialog.close());

    document.getElementById('btn-exit-app')?.addEventListener('click', () => {
    if (confirm('Tem certeza que deseja fechar a aplicação?')) {
        window.close();
    }
});

    document.getElementById('reset-database-btn')?.addEventListener('click', () => {
    if (confirm('TEM CERTEZA? Isso vai apagar TODOS os usuários e quadros. Esta ação não pode ser desfeita.')) {
        if (confirm('CONFIRMAÇÃO FINAL: Apagar tudo?')) {
            localStorage.clear();
            alert('Banco de dados zerado. A página será recarregada.');
            window.location.reload();
        }
    }
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
        tr.innerHTML = `
            <td>
                <div class="avatar">
                    ${user.avatar ? `<img src="${user.avatar}" alt="Avatar de ${user.name}">` : user.name.charAt(0).toUpperCase()}
                </div>
            </td>
            <td>${user.name}</td>
            <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleString('pt-BR') : 'Nunca'}</td>
            <td class="actions">
                <button class="btn btn-primary btn-login">🔑 Login</button>
                <button class="btn btn-edit">✏️ Editar</button>
                <button class="btn btn-delete">🗑️ Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-login').forEach(btn => btn.addEventListener('click', (e) => openLoginDialog(e.target.closest('tr').dataset.userId)));
    tbody.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', (e) => editUser(e.target.closest('tr').dataset.userId)));
    tbody.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', (e) => openDeleteConfirmDialog(e.target.closest('tr').dataset.userId)));
}

function openLoginDialog(userId) {
    selectedUserIdForAction = userId;
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
            
            window.location.href = 'kanban.html'; 
        }, 1500); // Espera 1.5s

    } else {
        // --- ERRO DE SENHA ---
        showDialogMessage(loginDialog, 'Senha incorreta. Tente novamente.', 'error');
        passwordInput.value = '';
        passwordInput.focus();
    }
}

function editUser(userId) {
    window.location.href = `profile.html?userId=${userId}`;
}

function openDeleteConfirmDialog(userId) {
    selectedUserIdForAction = userId;
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const confirmDialog = document.getElementById('confirm-dialog');
    document.getElementById('confirm-title').textContent = 'Excluir Usuário';
    document.getElementById('confirm-message').textContent = `Para excluir "${user.name}", por favor, digite a senha do usuário ou a senha mestra.`;
    
    // --- INÍCIO DA CORREÇÃO ---
    let passwordInputContainer = confirmDialog.querySelector('#confirm-password-container');
    if (!passwordInputContainer) {
        // 1. Cria a div container com a classe correta
        passwordInputContainer = document.createElement('div');
        passwordInputContainer.id = 'confirm-password-container';
        passwordInputContainer.className = 'form-group'; // A div tem a classe .form-group
        passwordInputContainer.style.marginTop = '15px';

        // 2. Cria o input de senha (sem classes especiais)
        const passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.id = 'confirm-password-input';
        passwordInput.placeholder = 'Digite a senha para confirmar';

        // 3. Coloca o input dentro da div
        passwordInputContainer.appendChild(passwordInput);

        // 4. Adiciona a div completa ao diálogo
        document.getElementById('confirm-message').after(passwordInputContainer);
    }
    
    // Limpa o valor do input ao abrir o diálogo
    const passwordInput = passwordInputContainer.querySelector('#confirm-password-input');
    if(passwordInput) passwordInput.value = '';
    // --- FIM DA CORREÇÃO ---
    
    confirmDialog.showModal();
}

function handleConfirmAction() {
    const confirmDialog = document.getElementById('confirm-dialog');
    const passwordInput = document.getElementById('confirm-password-input');
    const password = passwordInput.value;
    const user = users.find(u => u.id === selectedUserIdForAction);

    if (!user) {
        showDialogMessage(confirmDialog, 'Usuário não encontrado.', 'error');
        setTimeout(() => confirmDialog.close(), 2000);
        return;
    }

    if (user.password === password || validateMasterPassword(password)) {
        // --- SUCESSO NA EXCLUSÃO ---
        deleteUser(user.id);
        
        // 1. Mostra a mensagem de sucesso DENTRO do diálogo
        showDialogMessage(confirmDialog, `Usuário "${user.name}" excluído.`, 'success');

        // 2. Desabilita os botões
        confirmDialog.querySelectorAll('button').forEach(btn => btn.disabled = true);

        // 3. Após o atraso, fecha o diálogo e atualiza a tabela
        setTimeout(() => {
            loadAndRenderUsers(); // Atualiza a tabela na página
            confirmDialog.close();
            // Reabilita os botões
            confirmDialog.querySelectorAll('button').forEach(btn => btn.disabled = false);
        }, 1500);

    } else {
        // --- ERRO DE SENHA ---
        showDialogMessage(confirmDialog, 'Senha incorreta. Tente novamente.', 'error');
        passwordInput.value = '';
        passwordInput.focus();
    }
}

/**
 * Exibe uma mensagem dentro de um diálogo específico.
 * @param {HTMLElement} dialog O elemento do diálogo.
 * @param {string} message A mensagem a ser exibida.
 * @param {string} type 'error' ou 'success'.
 */
function showDialogMessage(dialog, message, type) {
    const feedbackEl = dialog.querySelector('.feedback');
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.className = `feedback ${type} show`;
    setTimeout(() => {
        feedbackEl.classList.remove('show');
    }, 4000);
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