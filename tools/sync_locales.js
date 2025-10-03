const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../locales');
const referenceFile = 'en-US.json';
const referenceFilePath = path.join(localesDir, referenceFile);

console.log('🚀 Iniciando sincronização e ordenação dos arquivos de tradução...');

if (!fs.existsSync(referenceFilePath)) {
    console.error(`❌ Arquivo de referência "${referenceFile}" não encontrado.`);
    process.exit(1);
}

// 1. Carrega e ordena o arquivo de referência (en-US.json)
let referenceContent;
try {
    referenceContent = JSON.parse(fs.readFileSync(referenceFilePath, 'utf8'));
} catch (e) {
    console.error(`❌ Erro de sintaxe no arquivo de referência "${referenceFile}": ${e.message}`);
    process.exit(1);
}

const sortedReference = {};
Object.keys(referenceContent).sort().forEach(key => {
    sortedReference[key] = referenceContent[key];
});

// Salva o arquivo de referência ordenado
fs.writeFileSync(referenceFilePath, JSON.stringify(sortedReference, null, 4));
console.log(`✅ Arquivo de referência "${referenceFile}" foi ordenado alfabeticamente.`);

const referenceKeys = Object.keys(sortedReference);

// 2. Itera sobre os outros arquivos e os sincroniza
const files = fs.readdirSync(localesDir);

files.forEach(file => {
    if (file === referenceFile || !file.endsWith('.json')) {
        return;
    }

    const filePath = path.join(localesDir, file);
    let targetContent;
    try {
        targetContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`⚠️  Aviso: Erro de sintaxe em "${file}", pulando...`);
        return;
    }

    const newTargetContent = {};
    let hasChanges = false;

    referenceKeys.forEach(key => {
        if (targetContent.hasOwnProperty(key)) {
            newTargetContent[key] = targetContent[key];
        } else {
            // Chave faltando: adiciona com o valor do arquivo de referência como placeholder
            newTargetContent[key] = sortedReference[key];
            hasChanges = true;
        }
    });

    // Salva o arquivo de destino sincronizado e ordenado
    fs.writeFileSync(filePath, JSON.stringify(newTargetContent, null, 4));
    console.log(`✅ Arquivo "${file}" foi sincronizado e ordenado.`);
});

console.log('\n🎉 Sincronização concluída com sucesso!');