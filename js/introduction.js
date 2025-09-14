document.addEventListener('DOMContentLoaded', () => {
    const letters = document.querySelectorAll('.letter');
    const finalLogo = document.querySelector('.final-logo');
    const introContainer = document.querySelector('.intro-container');
    const introContent = document.querySelector('.intro-content');
    const introFeatures = document.querySelector('.intro-features');
    const logoText = document.querySelector('.logo-text');
    const logoDeep = document.querySelector('.logo-deep');

    // Animação das letras com efeito de "big bang" suave
    setTimeout(() => {
        document.getElementById('k').style.opacity = '1';
        document.getElementById('k').style.transform = 'translateY(0) scale(1)';
    }, 500);

    setTimeout(() => {
        document.getElementById('a1').style.opacity = '1';
        document.getElementById('a1').style.transform = 'translateY(0) scale(1)';
    }, 800);

    setTimeout(() => {
        document.getElementById('n1').style.opacity = '1';
        document.getElementById('n1').style.transform = 'translateY(0) scale(1)';
    }, 1100);

    setTimeout(() => {
        document.getElementById('b').style.opacity = '1';
        document.getElementById('b').style.transform = 'translateY(0) scale(1)';
    }, 1400);

    setTimeout(() => {
        document.getElementById('a2').style.opacity = '1';
        document.getElementById('a2').style.transform = 'translateY(0) scale(1)';
    }, 1700);

    setTimeout(() => {
        document.getElementById('n2').style.opacity = '1';
        document.getElementById('n2').style.transform = 'translateY(0) scale(1)';
    }, 2000);

    // Animação da palavra DEEP
    setTimeout(() => {
        document.getElementById('d').style.opacity = '1';
        document.getElementById('d').style.transform = 'translateY(0) scale(1)';
    }, 2500);

    setTimeout(() => {
        document.getElementById('e1').style.opacity = '1';
        document.getElementById('e1').style.transform = 'translateY(0) scale(1)';
    }, 2800);

    setTimeout(() => {
        document.getElementById('e2').style.opacity = '1';
        document.getElementById('e2').style.transform = 'translateY(0) scale(1)';
    }, 3100);

    setTimeout(() => {
        document.getElementById('p').style.opacity = '1';
        document.getElementById('p').style.transform = 'translateY(0) scale(1)';
    }, 3400);

    // Efeito de compressão para o centro (sem explosão)
    setTimeout(() => {
        // Esconder conteúdo
        introContent.style.opacity = '0';
        introFeatures.style.opacity = '0';
        
        
        // Calcular posição central
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        // Comprimir todas as letras para o centro
        letters.forEach(letter => {
            const rect = letter.getBoundingClientRect();
            const letterCenterX = rect.left + rect.width / 2;
            const letterCenterY = rect.top + rect.height / 2;
            
            // Calcular direção para o centro
            const deltaX = centerX - letterCenterX;
            const deltaY = centerY - letterCenterY;
            
            // Aplicar transformação
            letter.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.1)`;
            letter.style.opacity = '0';
            
        });

        // Esconder os containers das letras também
        setTimeout(() => {
            logoText.style.display = 'none';
            logoDeep.style.display = 'none';
        }, 80);

        // Mostrar logo final após compressão
        setTimeout(() => {
            finalLogo.classList.add('show');
        }, 800);
    }, 4500);

    // Redirecionar após animação completa
    setTimeout(() => {
        window.location.href = 'list-users.html';
    }, 7000); // Tempo ajustado para 7 segundos
});