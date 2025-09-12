// js/ui-controls.js - Controles de UI universais e avançados
import { getCurrentUser, updateUser } from './auth.js';

/**
 * Biblioteca de ícones padrão para uso em toda a aplicação.
 */
export const ICON_LIBRARY = [
  '📋', '🏷️', '💼', '📚', '🛒', '🎮', '🔥', '📊', '🚀', '🎯', '💡', '🎉', '🏆', '⚙️', '🔧', '🏠', '❤️', '⭐', '📌', '📎', '📁', '📅', '⏰', '✅', '❌', '❓', '❗', '💰', '👥', '🧠'
];

// ===== FUNÇÕES DE CONTROLE DE MODAIS E TECLADO =====

/**
 * Inicializa todos os controles de UI universais: modais, teclado e arrastar elementos.
 * Deve ser chamada uma única vez no início da aplicação.
 */
export function initUIControls() {
    setupGlobalCloseListeners();
    setupKeyboardShortcuts();
    initDraggableElements();
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
                // ...procuramos pelo botão de ação principal.
                // A nova convenção é '.btn.confirm', mas mantemos '.btn-primary' para compatibilidade.
                // O seletor agora busca por um botão que tenha a classe 'confirm' OU a classe 'btn-primary'.
                const primaryButton = openDialog.querySelector('.btn.confirm, .btn-primary');
                
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
            <button class="btn confirm">${confirmText}</button>
            <button class="btn cancel">${cancelText}</button>
        </div>
    `;
    document.body.appendChild(dialog);
    initDraggableElements();
    dialog.showModal();

    const confirmBtn = dialog.querySelector('.btn.confirm');
    const cancelBtn = dialog.querySelector('.btn.cancel');

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
            // Se o retorno for explicitamente false, não faz nada (mantém o diálogo aberto e botões desabilitados).
            // Se for undefined ou null, reabilita os botões.
            if (success !== false) {
                confirmBtn.disabled = false;
                cancelBtn.disabled = false;
            }
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
    
    // Define um temporizador para esconder a mensagem após 3 segundos, para todos os tipos.
    setTimeout(() => {
        feedbackEl.classList.remove('show');
    }, 2000);
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

// ===== FUNÇÕES DE TEMA E FONTE UNIVERSAIS =====

/**
 * Aplica o tema (claro/escuro) e a fonte com base nas preferências do usuário.
 * Esta função deve ser chamada em todas as páginas após o login.
 */
export function applyUserTheme() {
    const user = getCurrentUser();
    if (!user) return;

    // 1. Aplica o tema (claro/escuro)
    const userTheme = user.preferences?.theme || user.theme || 'auto';
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

    // 2. Aplica a fonte
    applyUserFont();

    // 3. Aplica a cor primária
    applyPrimaryColor(user.preferences?.primaryColor);
}

/**
 * Aplica a cor primária salva nas preferências do usuário em toda a interface.
 * @param {object|string} colorData - O objeto de cor ({hex, rgb}) ou a string 'none'.
 */
function applyPrimaryColor(colorData) {
    if (colorData && colorData.hex && colorData.rgb) {
        document.body.classList.remove('no-primary-effects');
        document.documentElement.style.setProperty('--primary', colorData.hex);
        document.documentElement.style.setProperty('--primary-rgb', colorData.rgb);
    } else {
        document.body.classList.add('no-primary-effects');
    }
}

function applyUserFont() {
    const user = getCurrentUser();
    if (!user || !user.preferences) return;
    
    applyFontFamily(user.preferences.fontFamily || 'Segoe UI');
    applyFontSize(user.preferences.fontSize || 'medium');
}

function applyFontFamily(fontFamily) {
    // Define a variável CSS global. O universal.css cuidará de aplicar a fonte.
    document.documentElement.style.setProperty('--app-font-family', fontFamily);
}

function applyFontSize(size) {
    const sizeMap = { small: '0.75rem', medium: '1rem', large: '1.3rem', 'x-large': '1.6rem' };
    const fontSizeValue = sizeMap[size] || '1rem'; // Padrão para 1rem (medium)
    document.documentElement.style.fontSize = fontSizeValue;
}

/**
 * Exibe um diálogo para o usuário selecionar um ícone da biblioteca padrão.
 * @param {function(string): void} callback - Função a ser chamada com o ícone selecionado.
 */
export function showIconPickerDialog(callback) {
    // Reutiliza um diálogo existente ou cria um novo
    let dialog = document.getElementById('icon-picker-dialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'icon-picker-dialog';
        dialog.className = 'draggable';
        dialog.innerHTML = `
            <h3 class="drag-handle">Selecione um Ícone</h3>
            <div id="icon-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(50px, 1fr)); gap: 10px; max-height: 300px; overflow-y: auto; padding: 10px; border: 1px solid var(--border);">
                <!-- Ícones serão inseridos aqui -->
            </div>
            <div class="modal-actions">
                <button id="close-icon-picker-btn" class="btn btn-secondary">Fechar</button>
            </div>
        `;
        document.body.appendChild(dialog);
        makeDraggable(dialog); // Garante que seja arrastável
    }

    const iconGrid = dialog.querySelector('#icon-grid');
    iconGrid.innerHTML = ''; // Limpa ícones anteriores

    ICON_LIBRARY.forEach(icon => {
        const iconBtn = document.createElement('button');
        iconBtn.className = 'icon-picker-btn'; // Use uma classe para estilização se necessário
        iconBtn.textContent = icon;
        iconBtn.style.fontSize = '2rem';
        iconBtn.style.padding = '10px';
        iconBtn.style.cursor = 'pointer';
        iconBtn.onclick = () => {
            callback(icon);
            dialog.close();
        };
        iconGrid.appendChild(iconBtn);
    });

    dialog.showModal();
    dialog.querySelector('#close-icon-picker-btn').onclick = () => dialog.close();
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Inicializa todos os elementos .custom-select da página, transformando-os
 * em dropdowns estilizados e funcionais.
 */
export function initCustomSelects() {
    // Função para fechar todos os selects abertos, exceto o atual
    function closeAllSelect(elmnt) {
        const selectItems = document.getElementsByClassName("select-items");
        const selectSelected = document.getElementsByClassName("select-selected");
        const arrNo = [];
        for (let i = 0; i < selectSelected.length; i++) {
            if (elmnt == selectSelected[i]) {
                arrNo.push(i);
            }
        }
        for (let i = 0; i < selectItems.length; i++) {
            if (arrNo.indexOf(i)) {
                selectItems[i].classList.add("select-hide");
            }
        }
    }

    // Adiciona o listener para fechar ao clicar fora
    document.addEventListener("click", () => closeAllSelect(null));

    const customSelects = document.getElementsByClassName("custom-select");

    for (let i = 0; i < customSelects.length; i++) {
        const selElmnt = customSelects[i].getElementsByTagName("select")[0];
        if (!selElmnt) continue;

        // Evita reinicializar um select que já foi processado
        if (customSelects[i].querySelector('.select-selected')) {
            continue;
        }

        // Se o select não tiver opções (pode ser preenchido dinamicamente mais tarde), pule.
        // Se não houver opção selecionada (selectedIndex === -1), também pula. Isso acontece
        // quando o valor salvo no storage não corresponde a nenhuma opção disponível ou o select está vazio.
        // Esta é a correção definitiva para o erro 'Cannot read properties of undefined (reading 'innerHTML')'.
        if (selElmnt.options.length === 0 || selElmnt.selectedIndex === -1) {
            continue;
        }

        // Cria o elemento que mostrará a opção selecionada
        const selectedDiv = document.createElement("DIV");
        selectedDiv.setAttribute("class", "select-selected");
        selectedDiv.innerHTML = selElmnt.options[selElmnt.selectedIndex].innerHTML;
        customSelects[i].appendChild(selectedDiv);

        // Cria o container para as opções
        const optionsDiv = document.createElement("DIV");
        optionsDiv.setAttribute("class", "select-items select-hide");

        // Cria cada item de opção
        for (let j = 0; j < selElmnt.length; j++) {
            const optionItem = document.createElement("DIV");
            optionItem.setAttribute("class", "select-item");
            optionItem.innerHTML = selElmnt.options[j].innerHTML;

            // Adiciona o listener de clique para cada opção
            optionItem.addEventListener("click", function(e) {
                const select = this.parentNode.parentNode.getElementsByTagName("select")[0];
                const selectedDisplay = this.parentNode.previousSibling;

                for (let k = 0; k < select.length; k++) {
                    if (select.options[k].innerHTML == this.innerHTML) {
                        select.selectedIndex = k;
                        selectedDisplay.innerHTML = this.innerHTML;
                        
                        // Dispara o evento 'change' no select original para que outros scripts possam reagir
                        select.dispatchEvent(new Event('change'));
                        break;
                    }
                }
                selectedDisplay.click(); // Fecha o menu
            });
            optionsDiv.appendChild(optionItem);
        }
        customSelects[i].appendChild(optionsDiv);

        selectedDiv.addEventListener("click", function(e) {
            e.stopPropagation();
            closeAllSelect(this);
            this.nextSibling.classList.toggle("select-hide");
        });
    }
}
