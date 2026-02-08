let currentIsland = 'School';
let timerInterval = null;
let timeLeft = 25 * 60;

// Probto Persistent Storage
let islandData = JSON.parse(localStorage.getItem('probtoData')) || {
    'School': ['notion.so'], 
    'Work': ['github.com'], 
    'Break': ['youtube.com']
};

function init() {
    renderLinks();
    updateTimerDisplay();
    selectIsland('School');
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

function selectIsland(name) {
    currentIsland = name;
    document.getElementById('island-title').innerText = `PROBTO // ${name.toUpperCase()}`;
    
    // Highlight active nav item
    ['School', 'Work', 'Break'].forEach(id => {
        const btn = document.getElementById(`btn-${id}`);
        if (id === name) {
            btn.style.color = 'var(--accent)';
            btn.style.borderLeft = '2px solid var(--accent)';
        } else {
            btn.style.color = 'var(--text-dim)';
            btn.style.borderLeft = '2px solid transparent';
        }
    });
    
    renderLinks();
}

function handleAddLink() {
    const input = document.getElementById('link-input');
    let val = input.value.trim();
    if (val) {
        // Basic URL formatting
        if (!val.startsWith('http')) val = 'https://' + val;
        islandData[currentIsland].push(val);
        localStorage.setItem('probtoData', JSON.stringify(islandData));
        renderLinks();
        input.value = '';
    }
}

function renderLinks() {
    const container = document.getElementById('links-container');
    container.innerHTML = islandData[currentIsland].map((url, index) => {
        // Extract a clean name for display
        let displayUrl = url.replace('https://', '').replace('http://', '').split('/')[0];
        return `
            <div class="link-node" onclick="openInApp('${url}')">
                <div style="font-size: 18px; color: var(--accent);">↗</div>
                <span>${displayUrl.toUpperCase()}</span>
            </div>
        `;
    }).join('');
}

function openInApp(url) {
    document.getElementById('browser-view').classList.remove('hidden');
    document.getElementById('web-frame').src = url;
    document.getElementById('url-indicator').innerText = url.toUpperCase();
}

function closeBrowser() {
    document.getElementById('browser-view').classList.add('hidden');
    document.getElementById('web-frame').src = "";
}

function updateTimerDisplay() {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    document.getElementById('timer-display').innerText = 
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function toggleTimer() {
    const btn = document.getElementById('start-btn');
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        btn.innerText = "RESUME";
    } else {
        const inputMins = document.getElementById('timer-input').value;
        if (timeLeft <= 0 || timeLeft === 25*60) timeLeft = inputMins * 60;
        
        btn.innerText = "ABORT";
        timerInterval = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                timerInterval = null;
                alert("PROTOCOL COMPLETE. SESSION ENDED.");
                btn.innerText = "START";
                timeLeft = 25 * 60;
                updateTimerDisplay();
            }
        }, 1000);
    }
}

init();