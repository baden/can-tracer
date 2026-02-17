// file-io.js

export function saveTrace(buffer) {
    const data = buffer.map(p => {
        const id = p.id.toString(16).toUpperCase();
        const dlc = p.dlc;
        const payload = p.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
        const type = p.ext ? 'T' : 't';
        // Format: timestamp,delta,type,id,dlc,data
        return `${p.timestamp},${p.delta.toFixed(6)},${type},${id},${dlc},${payload}`;
    }).join('\n');

    const blob = new Blob([data], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `can_trace_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function loadTrace(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split('\n');
        const packets = [];
        
        lines.forEach(line => {
            if (!line.trim()) return;
            const parts = line.split(',');
            if (parts.length < 6) return; // Basic validation
            
            // Format: timestamp,delta,type,id,dlc,data
            const typeChar = parts[2];
            const isExt = typeChar === 'T';
            const id = parseInt(parts[3], 16);
            const dlc = parseInt(parts[4]);
            const dataStr = parts[5];
            const data = [];
            for (let i = 0; i < dataStr.length; i += 2) {
                data.push(parseInt(dataStr.substr(i, 2), 16));
            }

            packets.push({
                timestamp: parts[0],
                delta: parseFloat(parts[1]),
                type: 'RX', // Loaded traces are usually viewed as RX or replay? Let's just store as is.
                id: id,
                ext: isExt,
                dlc: dlc,
                data: data
            });
        });
        callback(packets);
    };
    reader.readAsText(file);
}
