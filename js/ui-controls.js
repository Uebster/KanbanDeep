// js/ui-controls.js - Controles de UI universais e avançados
import { getCurrentUser, updateUser } from './auth.js';
import { 
    saveUserBoardTemplates, getUserBoardTemplates, 
    saveUserTagTemplates, getUserTagTemplates,
    getGroup, saveGroup, getAllGroups
} from './storage.js';

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
 * Tenta fechar o elemento de UI que está na camada superior.
 * Para diálogos, dispara um evento 'cancel' que pode ser prevenido.
 */
function closeTopLayer() {
    const topLayer = getTopmostLayer();
    if (!topLayer) return;

    if (topLayer.tagName === 'DIALOG') {
        // Dispara um evento 'cancel' no diálogo.
        // Se o evento não for cancelado (ou seja, se dispatchEvent retornar true),
        // então o diálogo será fechado.
        const cancelEvent = new Event('cancel', { cancelable: true });
        if (topLayer.dispatchEvent(cancelEvent)) {
            topLayer.close();
        }
    } else if (topLayer.classList.contains('dropdown')) {
        topLayer.classList.remove('show');
    }
}

/**
 * Configura os listeners globais para fechar elementos de forma controlada.
 */
function setupGlobalCloseListeners() {
    // Lida com a tecla ESC de forma inteligente.
    document.addEventListener('keydown', (e) => {
        if (e.key === "Escape") {
            const topLayer = getTopmostLayer();
            // Se a camada superior for um dropdown, nós a fechamos.
            // Se for um diálogo, deixamos o navegador disparar o evento 'cancel' nativo,
            // que será interceptado pelo listener do próprio diálogo (ex: em kanban.js).
            if (topLayer && topLayer.tagName !== 'DIALOG') {
                closeTopLayer();
            }
        }
    });

    // Fecha ao clicar fora (no backdrop de um modal ou fora de um dropdown)
    document.addEventListener('click', (e) => {
        const topLayer = getTopmostLayer();
        if (!topLayer) return;

        // Se a camada superior for um diálogo, tenta fechar apenas se o clique for no backdrop.
        if (topLayer.tagName === 'DIALOG' && e.target === topLayer) {
            closeTopLayer();
        } 
        // Se for um dropdown, fecha se o clique for fora do seu container.
        else if (topLayer.classList.contains('dropdown') && !e.target.closest('.menu-container')) { // Dropdowns fecham direto
            topLayer.classList.remove('show');
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

    // 4. Aplica o comportamento do header inteligente
    initSmartHeader();
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
 * Inicializa ou desativa o comportamento de "header inteligente" (auto-ocultar).
 */
function initSmartHeader() {
    const user = getCurrentUser();
    const header = document.getElementById('main-header');
    if (!user || !header) return;

    const isEnabled = user.preferences?.smartHeader === true;

    // Remove listeners antigos para evitar duplicação
    document.removeEventListener('mousemove', handleHeaderMouseMove);

    if (isEnabled) {
        document.body.classList.add('smart-header-enabled');
        document.addEventListener('mousemove', handleHeaderMouseMove);
    } else {
        document.body.classList.remove('smart-header-enabled');
        header.classList.remove('show-header');
        // Garante que a classe do indicador seja removida ao desativar a função
        document.body.classList.remove('header-is-visible');
    }
}

/**
 * Lida com o movimento do mouse para mostrar/ocultar o header.
 */
function handleHeaderMouseMove(e) {
    const header = document.getElementById('main-header');
    if (!header) return;

    // Mostra o header se o mouse estiver na área do topo da página (ex: 60px)
    // ou sobre o próprio header, caso ele já esteja visível.
    if (e.clientY < 60 || header.matches(':hover')) {
        header.classList.add('show-header');
        document.body.classList.add('header-is-visible');
    } else {
        // Esconde o header se o mouse estiver fora da área de ativação.
        header.classList.remove('show-header');
        document.body.classList.remove('header-is-visible');
    }
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

        // --- CORREÇÃO: Lida com a reinicialização de selects dinâmicos ---
        // Remove elementos customizados existentes para evitar duplicação ao atualizar a UI.
        const existingSelected = customSelects[i].querySelector('.select-selected');
        if (existingSelected) existingSelected.remove();
        const existingItems = customSelects[i].querySelector('.select-items');
        if (existingItems) existingItems.remove();

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
        const createOptionItem = (optionEl) => {
            const itemDiv = document.createElement("DIV");
            itemDiv.setAttribute("class", "select-item");
            itemDiv.innerHTML = optionEl.innerHTML;

            itemDiv.addEventListener("click", function(e) {
                const select = this.closest('.custom-select').getElementsByTagName("select")[0];
                const selectedDisplay = this.closest('.custom-select').querySelector('.select-selected');

                for (let k = 0; k < select.options.length; k++) {
                    if (select.options[k].innerHTML == this.innerHTML) {
                        select.selectedIndex = k;
                        selectedDisplay.innerHTML = this.innerHTML;
                        
                        // Dispara o evento 'change' no select original para que outros scripts possam reagir
                        select.dispatchEvent(new Event('change'));
                        break;
                    }
                }
                selectedDisplay.click();
            });
            return itemDiv;
        };

        // Itera sobre os filhos diretos (pode ser OPTION ou OPTGROUP)
        for (let j = 0; j < selElmnt.children.length; j++) {
            const child = selElmnt.children[j];

            if (child.tagName === 'OPTGROUP') {
                const groupLabel = document.createElement("DIV");
                groupLabel.setAttribute("class", "select-group-label");
                groupLabel.innerHTML = child.label;
                optionsDiv.appendChild(groupLabel);

                for (let k = 0; k < child.children.length; k++) {
                    const groupOption = child.children[k];
                    optionsDiv.appendChild(createOptionItem(groupOption));
                }
            } else if (child.tagName === 'OPTION') {
                optionsDiv.appendChild(createOptionItem(child));
            }
        }
        customSelects[i].appendChild(optionsDiv);

        selectedDiv.addEventListener("click", function(e) {
            e.stopPropagation();
            closeAllSelect(this);
            this.nextSibling.classList.toggle("select-hide");
        });
    }
}

/**
 * Cria e exibe um menu de contexto (clique direito) padronizado.
 * @param {MouseEvent} event - O evento do mouse para obter as coordenadas.
 * @param {Array<Object>} items - Um array de objetos que definem os itens do menu.
 *   Cada objeto pode ter:
 *   - `label` (string): O texto do botão.
 *   - `icon` (string, opcional): O emoji ou ícone.
 *   - `action` (function): A função a ser executada no clique.
 *   - `isDestructive` (boolean, opcional): Se o botão deve ter estilo de "perigo".
 *   - `isSeparator` (boolean, opcional): Se o item é um separador <hr>.
 */
export function showContextMenu(event, items) {
    event.preventDefault();
    document.querySelectorAll('.context-menu').forEach(menu => menu.remove());

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    items.forEach(item => {
        if (item.isSeparator) {
            menu.appendChild(document.createElement('hr'));
        } else {
            const button = document.createElement('button');
            button.innerHTML = `${item.icon || ''} ${item.label}`;
            if (item.isDestructive) {
                button.classList.add('destructive');
            }
            button.onclick = () => {
                item.action();
                menu.remove();
            };
            menu.appendChild(button);
        }
    });

    document.body.appendChild(menu);

    const { innerWidth, innerHeight } = window;
    menu.style.left = `${event.clientX + menu.offsetWidth > innerWidth ? innerWidth - menu.offsetWidth - 5 : event.clientX}px`;
    menu.style.top = `${event.clientY + menu.offsetHeight > innerHeight ? innerHeight - menu.offsetHeight - 5 : event.clientY}px`;

    setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
    }, 0);
}

/**
 * Exibe um editor de template universal para quadros ou etiquetas.
 * @param {'board' | 'tag'} type - O tipo de template ('board' ou 'tag').
 * @param {object} context - O contexto de salvamento. Ex: { ownerType: 'user' } ou { ownerType: 'group', ownerId: '...' }.
 * @param {string|null} templateId - O ID do template para editar, ou null para criar um novo.
 */
export function showTemplateEditorDialog(type, context, templateId = null) {
    const isBoard = type === 'board';
    const dialogId = isBoard ? 'board-template-dialog' : 'tag-template-dialog';

    // CORREÇÃO: Remove qualquer diálogo antigo para evitar conflitos de estrutura.
    const oldDialog = document.getElementById(dialogId);
    if (oldDialog) {
        oldDialog.remove();
    }

    // Sempre cria um novo diálogo para garantir a estrutura correta.
    const dialog = createTemplateEditorDialog(type);
    document.body.appendChild(dialog);
    makeDraggable(dialog);

    const title = isBoard ? 'Template de Quadro' : 'Conjunto de Etiquetas';
    const item = isBoard ? 'Coluna' : 'Etiqueta';
    const icon = isBoard ? '📋' : '🏷️';

    dialog.querySelector('.dialog-title').textContent = templateId ? `Editar ${title}` : `Criar Novo ${title}`;
    dialog.querySelector('.template-icon-input').value = icon;
    dialog.querySelector('.template-name-input').value = '';
    dialog.querySelector('.template-desc-input').value = '';
    dialog.querySelector('.editor-container').innerHTML = '';
    dialog.dataset.editingId = templateId || '';
    dialog.dataset.context = JSON.stringify(context);

    // --- LÓGICA PARA O SELETOR DE GRUPO (SE APLICÁVEL) ---
    const groupSelectorContainer = dialog.querySelector('.group-selector-container');
    if (context.ownerType === 'group') {
        groupSelectorContainer.style.display = 'block';
        const groupSelect = groupSelectorContainer.querySelector('select');
        const adminGroups = getAllGroups().filter(g => g.adminId === getCurrentUser().id);

        groupSelect.innerHTML = '<option value="">-- Selecione um grupo --</option>';
        adminGroups.forEach(g => {
            groupSelect.innerHTML += `<option value="${g.id}">${g.name}</option>`;
        });

        if (templateId && context.ownerId) {
            // Se estiver editando, pré-seleciona e desabilita o grupo.
            groupSelect.value = context.ownerId;
            groupSelect.disabled = true;
        } else {
            // Se estiver criando, habilita o seletor.
            groupSelect.disabled = false;
        }
        initCustomSelects(); // Inicializa o select customizado
    } else {
        // Esconde o seletor se o contexto for 'user'.
        groupSelectorContainer.style.display = 'none';
    }

    // Lógica para preencher os dados se estiver editando
    let template = null;
    if (templateId) {
        if (context.ownerType === 'user') {
            const templates = isBoard ? getUserBoardTemplates(getCurrentUser().id) : getUserTagTemplates(getCurrentUser().id);
            template = templates.find(t => t.id === templateId);
        } else if (context.ownerType === 'group') {
            const group = getGroup(context.ownerId);
            const templates = isBoard ? group?.boardTemplates : group?.tagTemplates;
            template = (templates || []).find(t => t.id === templateId);
        }
    }

    if (template) {
        dialog.querySelector('.template-icon-input').value = template.icon || icon;
        dialog.querySelector('.template-name-input').value = template.name;
        dialog.querySelector('.template-desc-input').value = template.description || '';
        const items = isBoard ? template.columns : template.tags;
        items.forEach(it => addTemplateItemToEditor(dialog, it.name, it.color));
    } else {
        addTemplateItemToEditor(dialog, `Nova ${item}`, isBoard ? '#e74c3c' : '#3498db');
    }

    // Configura os botões
    dialog.querySelector('.btn-add-item').onclick = () => addTemplateItemToEditor(dialog);
    dialog.querySelector('.btn-save-template').onclick = () => saveTemplateFromEditor(dialog, type);
    dialog.querySelector('.btn-cancel').onclick = () => dialog.close();
    dialog.querySelector('.btn-choose-icon').onclick = () => {
        showIconPickerDialog(selectedIcon => {
            dialog.querySelector('.template-icon-input').value = selectedIcon;
        });
    };

    updateItemCount(dialog);
    dialog.showModal();
}

function createTemplateEditorDialog(type) {
    const isBoard = type === 'board';
    const dialog = document.createElement('dialog');
    dialog.id = isBoard ? 'board-template-dialog' : 'tag-template-dialog';
    dialog.className = 'draggable';

    const title = isBoard ? 'Template de Quadro' : 'Conjunto de Etiquetas';
    const item = isBoard ? 'Coluna' : 'Etiqueta';

    dialog.innerHTML = `
        <h3 class="drag-handle dialog-title">Criar ${title}</h3>
        <div class="form-group group-selector-container" style="display: none;">
            <label>Salvar no Grupo:</label>
            <div class="custom-select">
                <select class="template-group-select"></select>
            </div>
        </div>
        <div class="form-group">
            <label>Ícone:</label>
            <div class="icon-input-group">
                <input type="text" class="icon-display template-icon-input" readonly>
                <button type="button" class="btn edit btn-choose-icon">Escolher</button>
            </div>
        </div>
        <div class="form-group">
            <label>Nome do ${title}:</label>
            <input type="text" class="template-name-input">
        </div>
        <div class="form-group">
            <label>Descrição:</label>
            <textarea class="template-desc-input" rows="2"></textarea>
        </div>
        <div class="form-group">
            <label>${isBoard ? 'Colunas' : 'Etiquetas'} (<span class="item-count">0</span>/8):</label>
            <div class="editor-container"></div>
            <button type="button" class="btn alternative1 btn-add-item" style="width:100%; margin-top:10px;">Adicionar ${item}</button>
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn cancel">Cancelar</button>
            <button class="btn confirm btn-save-template">Salvar</button>
        </div>
    `;
    return dialog;
}

function addTemplateItemToEditor(dialog, name = '', color = '#333') {
    const editor = dialog.querySelector('.editor-container');
    if (editor.children.length >= 8) {
        showDialogMessage(dialog, 'Limite de 8 itens atingido.', 'warning');
        return;
    }
    const itemEl = document.createElement('div');
    itemEl.className = 'editor-item';
    itemEl.innerHTML = `
        <input type="text" value="${name}" placeholder="Nome do item" class="form-control">
        <input type="color" value="${color}">
        <button class="btn btn-sm danger remove-btn">-</button>
    `;
    itemEl.querySelector('.remove-btn').onclick = () => {
        itemEl.remove();
        updateItemCount(dialog);
    };
    editor.appendChild(itemEl);
    updateItemCount(dialog);
}

function updateItemCount(dialog) {
    const count = dialog.querySelector('.editor-container').children.length;
    dialog.querySelector('.item-count').textContent = count;
    dialog.querySelector('.btn-add-item').disabled = count >= 8;
}

function saveTemplateFromEditor(dialog, type) {
    const context = JSON.parse(dialog.dataset.context);
    const templateId = dialog.dataset.editingId;
    const name = dialog.querySelector('.template-name-input').value.trim();
    if (!name) {
        showDialogMessage(dialog, 'O nome é obrigatório.', 'error');
        return;
    }

    // Validação para templates de grupo
    if (context.ownerType === 'group') {
        const groupId = dialog.querySelector('.template-group-select').value;
        if (!groupId) {
            showDialogMessage(dialog, 'É necessário selecionar um grupo.', 'error');
            return;
        }
        context.ownerId = groupId; // Atualiza o ownerId com o grupo selecionado
    }

    const items = Array.from(dialog.querySelectorAll('.editor-container .editor-item')).map(item => ({
        name: item.querySelector('input[type="text"]').value.trim() || 'Item sem nome',
        color: item.querySelector('input[type="color"]').value
    }));

    if (items.length === 0) {
        showDialogMessage(dialog, 'Adicione pelo menos um item.', 'error');
        return;
    }

    const newTemplateData = {
        id: templateId || `${context.ownerType}-${type}-${Date.now()}`,
        name: name,
        icon: dialog.querySelector('.template-icon-input').value,
        description: dialog.querySelector('.template-desc-input').value.trim()
    };
    if (type === 'board') newTemplateData.columns = items;
    else newTemplateData.tags = items;

    showConfirmationDialog('Deseja salvar este template?', (confirmDialog) => {
        let success = false;
        if (context.ownerType === 'user') {
            const userId = getCurrentUser().id;
            const getFunc = type === 'board' ? getUserBoardTemplates : getUserTagTemplates;
            const saveFunc = type === 'board' ? saveUserBoardTemplates : saveUserTagTemplates;
            let templates = getFunc(userId);
            const index = templates.findIndex(t => t.id === templateId);
            if (index !== -1) templates[index] = newTemplateData;
            else templates.push(newTemplateData);
            success = saveFunc(userId, templates);
        } else if (context.ownerType === 'group') {
            const group = getGroup(context.ownerId);
            if (group) {
                const templateKey = type === 'board' ? 'boardTemplates' : 'tagTemplates';
                if (!group[templateKey]) group[templateKey] = [];
                const index = group[templateKey].findIndex(t => t.id === templateId);
                if (index !== -1) group[templateKey][index] = newTemplateData;
                else group[templateKey].push(newTemplateData);
                success = saveGroup(group);
            }
        }

        if (success) {
            showDialogMessage(confirmDialog, 'Template salvo com sucesso!', 'success');
            // Recarrega a lista de templates na página que chamou
            window.dispatchEvent(new CustomEvent('templatesUpdated'));
            setTimeout(() => dialog.close(), 1500);
            return true;
        } else {
            showDialogMessage(confirmDialog, 'Erro ao salvar o template.', 'error');
            return false;
        }
    });
}
