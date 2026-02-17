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
        console.log("File loaded, length:", text.length);
        console.log("First 100 chars:", text.substring(0, 100));
        
        // Check format
        // Normalize line endings to avoid issues with \r\n or \r
        const lines = text.split(/\r?\n|\r/);
        const firstLine = lines.find(l => {
             const t = l.trim();
             return t && !t.startsWith('@') && !t.startsWith('#') && !t.startsWith(';') && !t.startsWith('Version');
        });
        console.log("First data line detected:", firstLine);
        
        let isCanHacker = false;
        // Strict check for headers
        if (text.indexOf('@ TEXT @') !== -1 || text.indexOf('LocalTime=') !== -1 || text.indexOf('Device GUID') !== -1) {
            isCanHacker = true;
            console.log("Format detected: CAN Hacker (by Header)");
        } else if (firstLine) {
            // Heuristic
            const commaCount = (firstLine.match(/,/g) || []).length;
            const tabCount = (firstLine.match(/\t/g) || []).length;
            const spaceCount = (firstLine.match(/\s+/g) || []).length;
            
            console.log(`Heuristic: Commas=${commaCount}, Tabs=${tabCount}, Spaces=${spaceCount}`);

            // CAN Hacker uses tabs (or spaces) and usually has a comma in timestamp
            // CSV usually has many commas
            if (commaCount <= 2 && (tabCount > 0 || spaceCount > 5)) {
                isCanHacker = true;
                console.log("Format detected: CAN Hacker (by Heuristic)");
            } else {
                console.log("Format detected: CSV (Default)");
            }
        }

        const packets = isCanHacker ? parseCanHacker(lines) : parseCSV(lines);
        console.log("Parsed packets:", packets.length);
        callback(packets);
    };
    reader.readAsText(file);
}

function parseCSV(lines) {
    const packets = [];
    
    lines.forEach((line, index) => {
        if (!line.trim()) return;
        const parts = line.split(',');
        if (parts.length < 6) {
             // if (index < 5) console.warn(`CSV Parser: Skipping line ${index} (parts < 6):`, line);
             return; 
        }
        
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
            type: 'RX',
            id: id,
            ext: isExt,
            dlc: dlc,
            data: data
        });
    });
    return packets;
}

function parseCanHacker(lines) {
    const packets = [];
    let lastTime = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        // Skip headers and comments
        if (!line || line.startsWith('@') || line.startsWith('#') || line.startsWith(';') || line.startsWith('Version')) continue;
        
        // Example: 01,332276  1  00000004  440  8  40 00 ...
        const parts = line.split(/\s+/);
        
        // Needs at least Time, Ch, Flags, ID, DLC (5 parts)
        if (parts.length < 5) {
            // if (i < 20) console.warn(`Skipping line ${i} (parts < 5):`, line);
            continue;
        }

        // Detect PEAK format: 1) 0.000 Rx ...
        if (parts[0].endsWith(')') && (parts[2] === 'Rx' || parts[2] === 'Tx')) {
            // PEAK Format Handling
            const timeStr = parts[1];
            // const typeStr = parts[2];
            const idHex = parts[3];
            const dlcStr = parts[4];
            
            const id = parseInt(idHex, 16);
            const dlc = parseInt(dlcStr, 10);
            const isExt = idHex.length > 4 || id > 0x7FF; // Simple heuristic

             if (isNaN(id) || isNaN(dlc)) {
                 // if (i < 20) console.warn(`Skipping PEAK line ${i} (NaN check): ID=${idHex}, DLC=${dlcStr}`);
                 continue;
             }
             
             const data = [];
             for (let j = 0; j < dlc; j++) {
                 const byte = parseInt(parts[5 + j], 16);
                 if (!isNaN(byte)) data.push(byte);
             }
             
            let time = parseFloat(timeStr);
            let delta = packets.length > 0 ? (time - lastTime) : 0;
            // PEAK usually gives relative time in ms or us? Assuming seconds here if typical
            // Actually PEAK often is relative to start.
            lastTime = time;

            packets.push({
                timestamp: timeStr,
                delta: delta,
                type: 'RX', // Always RX for playback purposes usually, or map from typeStr
                id: id,
                ext: isExt,
                brs: false,
                dlc: dlc,
                data: data
            });
            continue;
        }

        const timeStr = parts[0].replace(',', '.');
        // const channel = parts[1]; // Ignored usually
        const flagHex = parts[2]; // Hex flags
        const idHex = parts[3];
        const dlcStr = parts[4];
        
        // Parse safely
        // const flags = parseInt(flagHex, 16);
        const id = parseInt(idHex, 16);
        const dlc = parseInt(dlcStr, 10);
        
        if (isNaN(id) || isNaN(dlc)) {
             // if (i < 20) console.warn(`Skipping line ${i} (NaN check): Flags=${flagHex}, ID=${idHex}, DLC=${dlcStr}`, line);
             continue; // Bad line
        }

        // Flags decoding (approximate for common formats)
        // const isExt = (flags & 0x0001) !== 0; 
        const isExt = id > 0x7FF; // Safer heuristic if flags are ambiguous
        // const isRtr = (flags & 0x0008) !== 0; 

        // Data starts at index 5
        const data = [];
        // Assuming standard data frame for simplicity
        for (let j = 0; j < dlc; j++) {
            // If DLC is large, we keep pushing from parts array
            const part = parts[5 + j];
            if (part) {
                const byte = parseInt(part, 16);
                if (!isNaN(byte)) {
                    data.push(byte);
                }
            }
        }

        let time = parseFloat(timeStr);
        let delta = packets.length > 0 ? (time - lastTime) : 0;
        // if (delta < 0) delta = 0; // Optional clamping
        if (isNaN(delta)) delta = 0.001; // Fallback
        lastTime = time;

        let type = 'RX';
        
        packets.push({
            timestamp: timeStr,
            delta: delta,
            type: type,
            id: id,
            ext: isExt,
            brs: false,
            dlc: dlc,
            data: data
        });
    }

    return packets;
}
