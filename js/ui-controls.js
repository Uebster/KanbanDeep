// js/ui-controls.js - Controles de UI universais e avançados

// ===== FUNÇÕES DE CONTROLE DE MODAIS E TECLADO =====

/**
 * Inicializa todos os controles de UI universais: modais, teclado e arrastar elementos.
 * Deve ser chamada uma única vez no início da aplicação.
 */
export function initUIControls() {
    setupGlobalCloseListeners();
    setupKeyboardShortcuts();
    initDraggableElements(); // Inicializa o arrastar de elementos com a classe .draggable
}

/**
 * Retorna o elemento de UI de maior prioridade que está aberto.
 * A ordem de prioridade é: Diálogos > Dropdowns.
 * @returns {HTMLElement|null} O elemento da camada superior ou null.
 */
function getTopmostLayer() {
    // Prioridade 1: Diálogos (<dialog>) abertos
    const openDialogs = document.querySelectorAll('dialog[open]');
    if (openDialogs.length > 0) {
        return openDialogs[openDialogs.length - 1]; // Retorna o último aberto, que está no topo
    }

    // Prioridade 2: Dropdowns (.dropdown.show) abertos
    const openDropdown = document.querySelector('.dropdown.show');
    if (openDropdown) {
        return openDropdown;
    }

    return null;
}

/**
 * Fecha o elemento de UI que está na camada superior.
 */
function closeTopLayer() {
    const topLayer = getTopmostLayer();
    if (!topLayer) return;

    if (topLayer.tagName === 'DIALOG') {
        topLayer.close();
    } else if (topLayer.classList.contains('dropdown')) {
        topLayer.classList.remove('show');
    }
}

/**
 * Configura os listeners globais para fechar elementos.
 */
function setupGlobalCloseListeners() {
    // Fecha com a tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            closeTopLayer();
        }
    });

    // Fecha ao clicar fora
    document.addEventListener('click', (e) => {
        const topLayer = getTopmostLayer();
        if (!topLayer) return;

        // Se a camada superior for um diálogo, fecha apenas se o clique for no backdrop.
        if (topLayer.tagName === 'DIALOG' && e.target === topLayer) {
            closeTopLayer();
        } 
        // Se for um dropdown, fecha se o clique for fora do seu container.
        else if (topLayer.classList.contains('dropdown') && !e.target.closest('.menu-container')) {
            closeTopLayer();
        }
    });
}

/**
 * Configura atalhos de teclado globais:
 * - Navegação por TAB em modais.
 * - Submissão de diálogos com ENTER.
 */
function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
        // Navegação por TAB dentro de modais
        if (e.key === "Tab") {
            handleTabNavigation(e);
        }

        // --- LÓGICA DE ENTER APRIMORADA E CENTRALIZADA ---
        // Se a tecla "Enter" for pressionada em um campo que não seja uma área de texto...
        if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA") {
            // ...e houver um diálogo (<dialog>) aberto na tela...
            const openDialog = document.querySelector('dialog[open]');
            if (openDialog) {
                // ...procuramos pelo botão de ação principal (nossa convenção é usar a classe .btn-primary).
                const primaryButton = openDialog.querySelector('.btn-primary');
                
                // Se o botão existir e não estiver desabilitado...
                if (primaryButton && !primaryButton.disabled) {
                    e.preventDefault(); // Previne o comportamento padrão do Enter (ex: submeter um formulário)
                    primaryButton.click(); // Simula o clique no botão "Salvar" ou "Confirmar".
                }
            }
        }
    });
}

/**
 * Gerencia a navegação por TAB para manter o foco dentro do modal aberto.
 * @param {KeyboardEvent} e - O evento de teclado.
 */
function handleTabNavigation(e) {
    const modal = document.querySelector("dialog[open]");
    if (!modal) return;

    const focusableElements = 'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(modal.querySelectorAll(focusableElements));

    if (focusable.length === 0) return; // Nenhum elemento focável no modal

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];

    if (e.shiftKey) { // Shift + Tab
        if (document.activeElement === firstElement || !modal.contains(document.activeElement)) {
            lastElement.focus();
            e.preventDefault();
        }
    } else { // Tab
        if (document.activeElement === lastElement || !modal.contains(document.activeElement)) {
            firstElement.focus();
            e.preventDefault();
        }
    }
}

// ===== FUNÇÕES PARA ARRASTAR ELEMENTOS (MODAIS, JANELAS) =====

/**
 * Inicializa a funcionalidade de arrastar para todos os elementos com a classe 'draggable'.
 * O elemento arrastável deve ter um 'drag-handle' (elemento com classe 'drag-handle')
 * ou o próprio elemento será o handle se nenhum for especificado.
 */
export function initDraggableElements() {
    document.querySelectorAll(".draggable").forEach(element => {
        makeDraggable(element);
    });
}

/**
 * Torna um elemento HTML arrastável.
 * @param {HTMLElement} element - O elemento HTML a ser tornado arrastável.
 */
export function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const dragHandle = element.querySelector(".drag-handle") || element; // Usa o handle ou o próprio elemento

    if (!dragHandle) return; // Não há handle para arrastar

    dragHandle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // Pega a posição do mouse no início
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();

        //console.log("Target:", e.target);
        //console.log("Current target:", e.currentTarget)

        // Garante que só arraste se clicar na área de drag (drag-handle)
        if (!e.target.classList.contains('drag-handle')) return;

        // Calcula a nova posição do cursor
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
    

        // Define a nova posição do elemento
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// ===== FUNÇÕES DE MENSAGENS FLUTUANTES =====

/**
 * Exibe uma mensagem flutuante na tela, agora posicionada abaixo do header.
 * @param {string} message - O texto da mensagem a ser exibida.
 * @param {string} type - 'success', 'error', 'warning', 'info'.
 * @param {number} duration - Duração em milissegundos.
 */
export function showFloatingMessage(message, type = 'info', duration = 4000) {
    let container = document.getElementById('message-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'message-container';
        container.style.position = 'fixed';
        container.style.top = '49px';      // Distância do topo, abaixo do header
        container.style.right = '20px';     // Distância da direita
        container.style.left = 'auto';      // Remove o alinhamento à esquerda
        container.style.transform = 'none'; // Remove a centralização
        container.style.zIndex = '3000';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'flex-end'; // Alinha as mensagens à direita dentro do container
        container.style.gap = '10px';
        document.body.appendChild(container);
    }


    const messageEl = document.createElement('div');
    
    // --- A CORREÇÃO PRINCIPAL ESTÁ AQUI ---
    // Adiciona a classe .feedback para herdar o estilo que você já padronizou
    messageEl.className = `feedback ${type}`; 
    messageEl.textContent = message;
    
    // Adiciona alguns estilos inline para garantir a aparência
    messageEl.style.padding = '14px 25px';
    messageEl.style.borderRadius = '8px';
    messageEl.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    messageEl.style.fontWeight = '500';
    messageEl.style.minWidth = '300px';
    messageEl.style.textAlign = 'center';

    container.appendChild(messageEl);

    // Mostra o elemento (para futuras animações)
    setTimeout(() => {
        messageEl.style.display = 'block';
    }, 10);

    // Remove a mensagem após a duração
    setTimeout(() => {
        messageEl.remove();
    }, duration);
}

/**
 * Cria e exibe um diálogo de confirmação genérico e estilizado.
 * @param {string} message - A pergunta a ser exibida.
 * @param {function} onConfirm - A função a ser executada se o usuário confirmar. Retorna `true` para fechar o diálogo.
 * @param {function|null} onCancel - A função a ser executada se o usuário cancelar.
 * @param {string} confirmText - O texto do botão de confirmação.
 * @param {string} cancelText - O texto do botão de cancelamento.
 */
export function showConfirmationDialog(message, onConfirm, onCancel = null, confirmText = 'Sim', cancelText = 'Não') {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Confirmação</h3>
        <p>${message}</p>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn btn-secondary">${cancelText}</button>
            <button class="btn btn-primary">${confirmText}</button>
        </div>
    `;
    document.body.appendChild(dialog);
    initDraggableElements();
    dialog.showModal();

    const confirmBtn = dialog.querySelector('.btn-primary');
    const cancelBtn = dialog.querySelector('.btn-secondary');

    const closeAndCleanup = () => {
        dialog.close();
        setTimeout(() => dialog.remove(), 300);
    };

    cancelBtn.addEventListener('click', () => {
        if (onCancel) {
            const result = onCancel(dialog);
            if (result) {
                setTimeout(closeAndCleanup, 1500);
            }
        } else {
            showDialogMessage(dialog, 'Operação cancelada.', 'info');
            confirmBtn.disabled = true;
            cancelBtn.disabled = true;
            setTimeout(closeAndCleanup, 1500);
        }
    });
    
    confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        const success = await onConfirm(dialog);
        if (success) {
            setTimeout(closeAndCleanup, 1500);
        } else {
            confirmBtn.disabled = false;
            cancelBtn.disabled = false;
        }
    });
}

/**
 * Exibe uma mensagem em um diálogo.
 * @param {HTMLElement} dialog - O elemento do diálogo.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} type - O tipo de mensagem ('success', 'error', 'info').
 */
export function showDialogMessage(dialog, message, type = 'info') {
    const feedbackEl = dialog.querySelector('.feedback');
    if (!feedbackEl) return;
    
    feedbackEl.textContent = message;
    feedbackEl.className = `feedback ${type} show`;
    
    // Não esconde a mensagem de erro, apenas as outras
    if (type !== 'error') {
        setTimeout(() => {
            feedbackEl.classList.remove('show');
        }, 3000);
    }
}

/**
 * Atualiza o avatar do usuário na interface (versão independente)
 * @param {Object} user - Objeto do usuário com informações de avatar e nome
 */
export function updateUserAvatar(user) {
    const avatarImg = document.getElementById('user-avatar');
    const avatarBtn = document.getElementById('user-avatar-btn');
    
    if (!avatarImg || !avatarBtn) {
        console.warn('Elementos do avatar não encontrados na página.');
        return;
    }
    
    // Se o usuário tem um avatar definido
    if (user.avatar) {
        avatarImg.src = user.avatar;
        avatarImg.alt = `Avatar de ${user.name}`;
    } else {
        // Avatar padrão baseado nas iniciais
        const initials = user.name.split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase();
        
        // Cor de fundo baseada no ID do usuário (para consistência)
        const hue = user.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
        const backgroundColor = `hsl(${hue}, 65%, 65%)`;
        
        // Criar avatar com iniciais (usando SVG para evitar dependências externas)
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
            <rect width="38" height="38" fill="${backgroundColor}" rx="19"/>
            <text x="19" y="24" font-family="Arial" font-size="14" fill="white" text-anchor="middle">${initials}</text>
        </svg>`;
        
        avatarImg.src = 'data:image/svg+xml;base64,' + btoa(svgString);
        avatarImg.alt = `Avatar de ${user.name} (${initials})`;
    }
    
    // Adicionar tooltip com nome do usuário
    avatarBtn.title = `Logado como: ${user.name}`;
}
