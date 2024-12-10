const { ipcRenderer } = require('electron');

let miningInProgress = false;
let currentWords = [];
let minedWords = 0;
let originalText = '';
let textArea = document.getElementById('text-input');
let startButton = document.getElementById('start-mining');
let stopButton = document.getElementById('stop-mining');
let clearButton = document.getElementById('clear-database');
let miningStartTime = 0;
let currentWordStartTime = 0;
let updateInterval = null;
let currentTimeout = null;

// Configurações de mineração
const BASE_TIME = 3; // tempo base em segundos
const MINING_TIME_PER_LETTER = 120; // segundos por letra

// Configurações de tier
const TIER_CONFIG = {
    monossilaba: { discount: 0.30, label: 'Monossílaba', class: 'tier-mono' },
    dissilaba: { discount: 0.20, label: 'Dissílaba', class: 'tier-di' },
    trissilaba: { discount: 0.10, label: 'Trissílaba', class: 'tier-tri' },
    polissilaba: { discount: 0.05, label: 'Polissílaba', class: 'tier-poli' }
};

// Função para contar sílabas em uma palavra
function countSyllables(word) {
    word = word.toLowerCase();
    if (!word) return 0;

    // Regras básicas para contar sílabas em português
    const vowels = 'aáàãâeéêiíoóôõuú';
    const diphthongs = ['ai', 'au', 'ei', 'eu', 'éu', 'ia', 'ie', 'io', 'iu', 'oi', 'ou', 'ua', 'ue', 'ui', 'uo'];
    
    let syllables = 0;
    let isLastCharVowel = false;

    for (let i = 0; i < word.length; i++) {
        const char = word[i];
        const nextChar = word[i + 1];
        const isDiphthong = nextChar && diphthongs.includes(char + nextChar);

        if (vowels.includes(char)) {
            if (!isLastCharVowel || isDiphthong) {
                syllables++;
            }
            isLastCharVowel = true;
        } else {
            isLastCharVowel = false;
        }
    }

    return syllables || 1; // Retorna pelo menos 1 sílaba
}

// Função para classificar palavra por número de sílabas
function classifyWord(word) {
    const syllables = countSyllables(word);
    
    if (syllables === 1) return 'monossilaba';
    if (syllables === 2) return 'dissilaba';
    if (syllables === 3) return 'trissilaba';
    return 'polissilaba';
}

// Função para calcular tempo de mineração baseado no tier
function calculateMiningTime(word) {
    const tier = classifyWord(word);
    const baseTime = word.length * BASE_TIME;
    const discount = TIER_CONFIG[tier].discount;
    return baseTime - (baseTime * discount);
}

// Navegação entre páginas
document.querySelectorAll('.nav-button').forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all buttons and pages
        document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));

        // Add active class to clicked button and corresponding page
        button.classList.add('active');
        const pageId = `${button.dataset.page}-page`;
        document.getElementById(pageId).classList.add('active');
    });
});

// Tab switching
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        button.classList.add('active');
        document.getElementById(button.dataset.tab + '-tab').classList.add('active');
        
        if (button.dataset.tab === 'mined') {
            updateMinedWordsList();
        }
    });
});

function updateMinedWordsList() {
    const wordsList = document.getElementById('mined-words-list');
    wordsList.innerHTML = '';

    // Criar containers para cada categoria
    const containers = {
        monossilaba: document.createElement('div'),
        dissilaba: document.createElement('div'),
        trissilaba: document.createElement('div'),
        polissilaba: document.createElement('div')
    };

    // Configurar containers
    Object.entries(containers).forEach(([tier, container]) => {
        container.className = `word-category ${TIER_CONFIG[tier].class}`;
        container.innerHTML = `<h3>${TIER_CONFIG[tier].label}s</h3><div class="word-grid"></div>`;
        wordsList.appendChild(container);
    });

    ipcRenderer.invoke('get-mined-words').then(words => {
        words.forEach(word => {
            const tier = classifyWord(word.word);
            const container = containers[tier].querySelector('.word-grid');
            
            const wordCard = document.createElement('div');
            wordCard.className = 'word-card';
            wordCard.innerHTML = `
                <strong>${word.word}</strong>
                <div class="word-stats">
                    <span>Sílabas: ${countSyllables(word.word)}</span>
                    <span>Minerada: ${word.count}x</span>
                </div>
            `;
            container.appendChild(wordCard);
        });
    });
}

ipcRenderer.on('mined-words-list', (event, words) => {
    const list = document.getElementById('mined-words-list');
    list.innerHTML = '';
    words.forEach(word => {
        const li = document.createElement('li');
        li.className = 'mined-word';
        li.innerHTML = `
            <div class="word-info">
                <div class="word-text">${word.word}</div>
                <div class="word-stats">${word.length} letras</div>
            </div>
            <div class="mined-count">${word.mined_count}x</div>
        `;
        list.appendChild(li);
    });
});

startButton.addEventListener('click', startMining);
stopButton.addEventListener('click', stopMining);
clearButton.addEventListener('click', clearDatabase);

function startMining() {
    if (miningInProgress) return;
    
    const text = textArea.value;
    if (!text.trim()) return;

    originalText = text;
    currentWords = [...new Set(text.trim().split(/\s+/))];
    miningStartTime = Date.now();
    
    // Check which words are already mined
    ipcRenderer.send('check-mined-words', currentWords);
}

function stopMining() {
    if (!miningInProgress) return;
    
    if (currentTimeout) {
        clearTimeout(currentTimeout);
        currentTimeout = null;
    }
    
    stopLiveUpdates();
    miningInProgress = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    
    // Restaura o texto original
    textArea.value = originalText;
    
    // Reseta as estatísticas
    document.getElementById('mining-progress').style.width = '0%';
    document.getElementById('progress-text').textContent = '0%';
    document.getElementById('words-remaining').textContent = '0';
    document.getElementById('words-mined').textContent = '0';
    document.getElementById('estimated-time').textContent = '0s';
    
    const currentWordStatus = document.querySelector('.mining-status');
    if (currentWordStatus) {
        currentWordStatus.remove();
    }
}

function clearDatabase() {
    ipcRenderer.send('clear-database');
}

ipcRenderer.on('database-cleared', (event, success) => {
    if (success) {
        updateMinedWordsList();
        // Se estiver minerando, para a mineração
        if (miningInProgress) {
            stopMining();
        }
    }
});

ipcRenderer.on('mined-words-result', (event, minedWordsList) => {
    // Remove already mined words
    currentWords = currentWords.filter(word => !minedWordsList.includes(word));
    
    // Start mining if there are words left
    if (currentWords.length > 0) {
        minedWords = 0;
        miningInProgress = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        startLiveUpdates();
        mineNextWord();
    }
});

function startLiveUpdates() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    updateInterval = setInterval(updateLiveStats, 100); // Atualiza a cada 100ms
}

function stopLiveUpdates() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}

function updateLiveStats() {
    if (!miningInProgress || currentWords.length === 0) return;

    const currentWord = currentWords[0];
    const currentTime = Date.now();
    const elapsedTime = (currentTime - currentWordStartTime) / 1000;
    const totalMiningTime = calculateMiningTime(currentWord);
    const currentProgress = Math.min(100, (elapsedTime / totalMiningTime) * 100);

    // Atualiza progresso da palavra atual
    const totalWords = minedWords + currentWords.length;
    const wordProgress = minedWords / totalWords;
    const overallProgress = ((wordProgress * 100) + (currentProgress / totalWords));
    
    document.getElementById('mining-progress').style.width = `${overallProgress}%`;
    document.getElementById('progress-text').textContent = `${Math.round(overallProgress)}%`;

    // Atualiza tempo restante
    const remainingTimeForCurrentWord = Math.max(0, totalMiningTime - elapsedTime);
    const remainingTimeForOtherWords = currentWords.slice(1).reduce((acc, word) => acc + calculateMiningTime(word), 0);
    const totalTimeRemaining = remainingTimeForCurrentWord + remainingTimeForOtherWords;
    
    document.getElementById('estimated-time').textContent = formatTime(Math.ceil(totalTimeRemaining));
    
    // Atualiza outras estatísticas
    document.getElementById('words-remaining').textContent = currentWords.length;
    document.getElementById('words-mined').textContent = minedWords;

    // Adiciona estatísticas extras
    const statsDiv = document.querySelector('.stats');
    if (!document.querySelector('.mining-status')) {
        const miningStatus = document.createElement('div');
        miningStatus.className = 'mining-status mining-active';
        statsDiv.appendChild(miningStatus);
    }
    
    document.querySelector('.mining-status').innerHTML = `
        Minerando: <strong>${currentWord}</strong><br>
        Progresso: ${Math.round(currentProgress)}%
    `;
}

function mineNextWord() {
    if (currentWords.length === 0) {
        miningInProgress = false;
        startButton.disabled = false;
        stopButton.disabled = true;
        stopLiveUpdates();
        return;
    }

    const word = currentWords[0];
    const miningTime = calculateMiningTime(word) * 1000; // converter para milissegundos
    currentWordStartTime = Date.now();

    // Remove the word from the text
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    textArea.value = textArea.value.replace(regex, '');

    currentTimeout = setTimeout(() => {
        ipcRenderer.send('store-word', word);
    }, miningTime);
}

ipcRenderer.on('word-stored', (event, word) => {
    currentWords.shift();
    minedWords++;
    updateMinedWordsList();
    mineNextWord();
});

function formatTime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${minutes}m ${seconds}s`;
}
