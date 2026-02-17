// ui.js
import { logBuffer } from './buffer.js';

export class UI {
    constructor() {
        this.logContainer = document.getElementById('log-list-viewport');
        this.logContent = document.getElementById('log-list-content');
        this.rowHeight = 24; // Must match CSS
        this.visibleRows = 0;
        this.scrollTop = 0;
        
        this.logContainer.addEventListener('scroll', () => {
            this.scrollTop = this.logContainer.scrollTop;
            this.render();
        });

        // Auto-scroll
        this.autoScroll = true;
        this.logContainer.addEventListener('scroll', () => {
             const maxScroll = this.logContainer.scrollHeight - this.logContainer.clientHeight;
             if (this.logContainer.scrollTop < maxScroll - 50) { // Tolerance
                 this.autoScroll = false;
             } else {
                 this.autoScroll = true;
             }
        });

        // Initialize visible rows
        this.updateDimensions();
        window.addEventListener('resize', () => this.updateDimensions());
        
        // Stats
        this.elRx = document.getElementById('status-rx');
        this.elTx = document.getElementById('status-tx');
        this.elBuffer = document.getElementById('status-fps');
        
        // Start animation loop
        requestAnimationFrame(() => this.loop());
    }

    updateDimensions() {
        this.visibleRows = Math.ceil(this.logContainer.clientHeight / this.rowHeight) + 5; // Buffer a few extra rows
    }

    loop() {
        // Check buffer size and update stats
        const count = logBuffer.length;
        this.elRx.textContent = `Buffer: ${count}`;
        
        // If autoscroll is enabled, set scrollTop to max
        if (this.autoScroll) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }

        this.render();
        requestAnimationFrame(() => this.loop());
    }

    render() {
        const totalItems = logBuffer.length;
        const totalHeight = totalItems * this.rowHeight;
        this.logContent.style.height = `${totalHeight}px`;

        const scrollTop = this.logContainer.scrollTop;
        const startIdx = Math.floor(scrollTop / this.rowHeight);
        // Render a bit more than visible to prevent flickering
        const endIdx = Math.min(totalItems, startIdx + this.visibleRows + 5); 

        let html = '';
        for (let i = startIdx; i < endIdx; i++) {
            const packet = logBuffer.get(i);
            if (!packet) continue;
            
            // Basic formatting
            const ts = typeof packet.timestamp === 'number' ? new Date(packet.timestamp).toLocaleTimeString() + '.' + (packet.timestamp % 1000).toString().padStart(3, '0') : packet.timestamp;
            const top = i * this.rowHeight;
            
            const typeClass = packet.type.startsWith('TX') ? 'type-tx' : (packet.type.startsWith('RX') ? 'type-rx' : 'type-err');
            
            // Format Data: Hex string
            let dataHex = '';
            if (packet.type.includes('RTR')) {
                dataHex = '[RTR]';
            } else {
                dataHex = packet.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            }

            // Compact type label
            let typeLabel = '';
            if (packet.ext) typeLabel += 'E';
            if (packet.type.includes('FD')) typeLabel += 'F';
            if (packet.brs) typeLabel += 'B';
            if (typeLabel) typeLabel = `<span style="color:#888; font-size:10px; margin-left: 2px;">${typeLabel}</span>`;

            html += `
                <div class="log-row ${typeClass}" style="transform: translateY(${top}px);">
                    <div>${ts}</div>
                    <div>${packet.delta.toFixed(4)}</div>
                    <div style="display:flex; align-items:center;">${packet.id.toString(16).toUpperCase().padStart(3, '0')} ${typeLabel}</div>
                    <div>${packet.dlc}</div>
                    <div class="col-data">${dataHex}</div>
                </div>
            `;
        }
        this.logContent.innerHTML = html;
    }
}
