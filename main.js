// main.js
import { SerialPort } from './serial.js';
import { SLCAN } from './slcan.js';
import { logBuffer } from './buffer.js';
import { UI } from './ui.js';
import { saveTrace, loadTrace } from './file-io.js';

const serial = new SerialPort();
const slcan = new SLCAN();
// Initialize UI after DOM is ready? No, module script runs deferred by default
const ui = new UI();

let autoSendInterval = null;
let lastPacketTime = Date.now();

// --- Serial Data Handler ---
serial.onData = (chunk) => {
    const packets = slcan.parse(chunk);
    packets.forEach(packet => {
        const now = Date.now();
        // Calculate delta from previous packet in buffer or lastPacketTime?
        // Let's use lastPacketTime which tracks any packet (RX or TX)
        const delta = (now - lastPacketTime) / 1000;
        lastPacketTime = now;
        
        logBuffer.add({
            ...packet,
            timestamp: now,
            delta: delta
        });
    });
};

// --- UI Event Listeners ---

const btnConnect = document.getElementById('btn-connect');
const btnDisconnect = document.getElementById('btn-disconnect');
const btnSend = document.getElementById('btn-send');
const chkAuto = document.getElementById('chk-auto');
const slcanBaud = document.getElementById('slcan-baud');
const slcanBaudFd = document.getElementById('slcan-baud-fd');
const slcanMode = document.getElementById('slcan-mode');

// Helper to update UI state
function updateConnectionState(isConnected) {
    btnConnect.disabled = isConnected;
    btnDisconnect.disabled = !isConnected;
    document.getElementById('status-conn').textContent = isConnected ? 'Connected' : 'Disconnected';
    
    if (!isConnected) {
        chkAuto.checked = false;
        clearInterval(autoSendInterval);
        autoSendInterval = null;
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Connection
btnConnect.addEventListener('click', async () => {
    try {
        const connected = await serial.connect();
        if (connected) {
            updateConnectionState(true);
            
            // Initial Setup
            // 1. Close first
            await serial.write(slcan.cmdClose());
            await sleep(100);
            
            // 2. Set Baudrate (Classic CAN)
            const baud = slcanBaud.value.replace('S', ''); 
            await serial.write(slcan.cmdSetup(baud));
            await sleep(50);

            // 3. Set FD Baudrate
            // const baudFd = slcanBaudFd.value.replace('Y', '');
            // await serial.write(slcan.cmdSetupFD(baudFd));
            // await sleep(50);

            // 4. Set Mode
            // const mode = slcanMode.value.replace('M', '');
            // await serial.write(slcan.cmdSetMode(mode));
            // await sleep(50);
            
            // 5. Open Channel
            await serial.write(slcan.cmdOpen());
            
            await sleep(50);
            // Start reading AFTER setup is complete
            serial.startReading();
        }
    } catch (e) {
        console.error(e);
        alert('Connection failed: ' + e.message);
    }
});

btnDisconnect.addEventListener('click', async () => {
    await serial.disconnect();
    updateConnectionState(false);
});

// Helper for changing settings that require close/open
async function changeSetting(cmd) {
    if (!serial.isConnected) return;
    
    await serial.write(slcan.cmdClose());
    await sleep(50); // Short delay to ensure device processes it
    
    await serial.write(cmd);
    await sleep(50);
    
    await serial.write(slcan.cmdOpen());
}

slcanBaud.addEventListener('change', (e) => changeSetting(slcan.cmdSetup(e.target.value.replace('S', ''))));
slcanBaudFd.addEventListener('change', (e) => changeSetting(slcan.cmdSetupFD(e.target.value.replace('Y', ''))));
slcanMode.addEventListener('change', (e) => changeSetting(slcan.cmdSetMode(e.target.value.replace('M', ''))));

// Transmit
async function sendPacket() {
    const idStr = document.getElementById('tx-id').value;
    const isExt = document.getElementById('tx-ext').checked;
    const dataInput = document.getElementById('tx-data').value;
    const type = document.getElementById('tx-type').value; // std, fd, fd_brs, rtr
    
    // Parse ID
    const id = parseInt(idStr, 16);
    if (isNaN(id)) return;

    // Parse Data
    const dataBytes = dataInput.match(/[0-9A-Fa-f]{1,2}/g)?.map(b => parseInt(b, 16)) || [];
    
    if (serial.isConnected) {
        let cmd = '';
        let packetType = 'TX';
        let brs = false;

        switch(type) {
            case 'std':
                cmd = isExt ? slcan.cmdTxExt(id, dataBytes) : slcan.cmdTxStd(id, dataBytes);
                break;
            case 'rtr':
                cmd = isExt ? slcan.cmdTxRtrExt(id, dataBytes.length) : slcan.cmdTxRtrStd(id, dataBytes.length);
                packetType = 'TX_RTR';
                break;
            case 'fd':
                cmd = isExt ? slcan.cmdTxFdExt(id, dataBytes) : slcan.cmdTxFdStd(id, dataBytes);
                packetType = 'TX_FD';
                break;
            case 'fd_brs':
                cmd = isExt ? slcan.cmdTxFdBrsExt(id, dataBytes) : slcan.cmdTxFdBrsStd(id, dataBytes);
                packetType = 'TX_FD';
                brs = true;
                break;
        }

        await serial.write(cmd);
        
        // Log TX locally
        const now = Date.now();
        const delta = (now - lastPacketTime) / 1000;
        lastPacketTime = now;

        logBuffer.add({
            type: packetType,
            id,
            ext: isExt,
            dlc: dataBytes.length,
            data: dataBytes,
            brs: brs, // New field for FD
            timestamp: now,
            delta: delta
        });
    }
}

btnSend.addEventListener('click', sendPacket);

// Auto Send
chkAuto.addEventListener('change', (e) => {
    if (e.target.checked) {
        const interval = parseInt(document.getElementById('tx-interval').value) || 1000;
        autoSendInterval = setInterval(sendPacket, interval);
    } else {
        clearInterval(autoSendInterval);
        autoSendInterval = null;
    }
});

// Logging Tools
document.getElementById('btn-clear').addEventListener('click', () => {
    logBuffer.clear();
});

document.getElementById('btn-save').addEventListener('click', () => {
    saveTrace(logBuffer.getAll());
});

// Trace Playback (Mockup logic for now, or simple send loop)
const btnPlay = document.getElementById('btn-play-trace');
const chkLoop = document.getElementById('chk-loop-trace');
const elTraceStatus = document.getElementById('trace-status');
const elTraceProgress = document.getElementById('trace-progress');

let playbackInterval = null;
let loadedPackets = [];

function updateTraceStatus(status) {
    elTraceStatus.textContent = status;
}

function updateTraceProgress(current, total) {
    if (total > 0) {
        elTraceProgress.value = (current / total) * 100;
        updateTraceStatus(`${current} / ${total}`);
    } else {
        elTraceProgress.value = 0;
    }
}

document.getElementById('btn-load').addEventListener('click', () => {
    document.getElementById('file-input').click(); // Trigger hidden file input
});

document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    loadTrace(file, (packets) => {
        // Just store them for playback
        loadedPackets = packets;
        btnPlay.disabled = false;
        
        updateTraceStatus(`Loaded: ${packets.length} frames`);
        elTraceProgress.value = 0;
        
        alert(`Loaded ${packets.length} packets. Ready to play.`);
    });
});

btnPlay.addEventListener('click', () => {
    if (playbackInterval) {
        // Stop
        clearInterval(playbackInterval);
        playbackInterval = null;
        btnPlay.textContent = `Play Trace`;
        updateTraceStatus(`Stopped: ${loadedPackets.length} frames`);
        return;
    }

    if (loadedPackets.length === 0) return;

    let idx = 0;
    btnPlay.textContent = "Stop Playback";
    
    // Reuse the TX Interval input for playback rate
    const interval = parseInt(document.getElementById('tx-interval').value) || 100;

    playbackInterval = setInterval(async () => {
        if (idx >= loadedPackets.length) {
            if (chkLoop.checked) {
                idx = 0;
            } else {
                clearInterval(playbackInterval);
                playbackInterval = null;
                btnPlay.textContent = "Play Trace";
                updateTraceStatus(`Done: ${loadedPackets.length} frames`);
                elTraceProgress.value = 100;
                return;
            }
        }

        const p = loadedPackets[idx];
        if (serial.isConnected) {
            const cmd = p.ext ? slcan.cmdTxExt(p.id, p.data) : slcan.cmdTxStd(p.id, p.data);
            await serial.write(cmd);
            
             // Log locally as TX
             const now = Date.now();
             logBuffer.add({ ...p, type: 'TX', timestamp: now, delta: 0 }); 
        }
        
        idx++;
        
        // Update progress every 10 frames to avoid heavy DOM updates
        if (idx % 10 === 0 || idx >= loadedPackets.length) {
             updateTraceProgress(idx, loadedPackets.length);
        }
    }, interval);
});
