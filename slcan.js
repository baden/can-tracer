// slcan.js
// Handles SLCAN protocol parsing and generation

export class SLCAN {
    constructor() {
        this.buffer = '';
    }

    // Parse incoming serial data chunk
    parse(chunk) {
        this.buffer += chunk;
        const packets = [];
        let index;

        // Process all complete commands (terminated by \r)
        while ((index = this.buffer.indexOf('\r')) >= 0) {
            const line = this.buffer.substring(0, index);
            this.buffer = this.buffer.substring(index + 1);
            if (line.length > 0) {
                const packet = this.parseLine(line);
                if (packet) packets.push(packet);
            }
        }
        return packets;
    }

    parseLine(line) {
        const cmd = line.charAt(0);
        
        // Standard ID (tiiildd...)
        if (cmd === 't') {
            const id = parseInt(line.substring(1, 4), 16);
            const dlc = parseInt(line.charAt(4), 16);
            const dataStr = line.substring(5);
            const data = this.hexStringToBytes(dataStr);
            return { type: 'RX', id, ext: false, dlc, data, raw: line };
        }
        
        // Extended ID (Tiiiiiiiildd...)
        if (cmd === 'T') {
            const id = parseInt(line.substring(1, 9), 16);
            const dlc = parseInt(line.charAt(9), 16);
            const dataStr = line.substring(10);
            const data = this.hexStringToBytes(dataStr);
            return { type: 'RX', id, ext: true, dlc, data, raw: line };
        }

        // Remote Standard (riiil)
        if (cmd === 'r') {
            const id = parseInt(line.substring(1, 4), 16);
            const dlc = parseInt(line.charAt(4), 16);
            return { type: 'RTR', id, ext: false, dlc, data: [], raw: line };
        }

        // Remote Extended (Riiiiiiiil)
        if (cmd === 'R') {
            const id = parseInt(line.substring(1, 9), 16);
            const dlc = parseInt(line.charAt(9), 16);
            return { type: 'RTR', id, ext: true, dlc, data: [], raw: line };
        }

        // CANFD Standard (diiildd...) - No BRS
        if (cmd === 'd') {
             // For FD, DLC char maps to len > 8
             const id = parseInt(line.substring(1, 4), 16);
             const dlcChar = line.charAt(4);
             // const len = this.dlcCharToLen(dlcChar); // Not needed for parsing bytes directly from string, but good for display
             const dataStr = line.substring(5);
             const data = this.hexStringToBytes(dataStr);
             return { type: 'RX_FD', id, ext: false, dlc: data.length, brs: false, data, raw: line };
        }

        // CANFD Extended (Diiiiiiiildd...) - No BRS
        if (cmd === 'D') {
             const id = parseInt(line.substring(1, 9), 16);
             const dataStr = line.substring(10);
             const data = this.hexStringToBytes(dataStr);
             return { type: 'RX_FD', id, ext: true, dlc: data.length, brs: false, data, raw: line };
        }

        // CANFD Standard (biiildd...) - BRS
        if (cmd === 'b') {
             const id = parseInt(line.substring(1, 4), 16);
             const dataStr = line.substring(5);
             const data = this.hexStringToBytes(dataStr);
             return { type: 'RX_FD', id, ext: false, dlc: data.length, brs: true, data, raw: line };
        }

        // CANFD Extended (Biiiiiiiildd...) - BRS
        if (cmd === 'B') {
             const id = parseInt(line.substring(1, 9), 16);
             const dataStr = line.substring(10);
             const data = this.hexStringToBytes(dataStr);
             return { type: 'RX_FD', id, ext: true, dlc: data.length, brs: true, data, raw: line };
        }

        // Setup confirmations (z, Z) or others
        if (cmd === 'z' || cmd === 'Z') {
             // success
             return { type: 'CMD_OK', raw: line };
        }
        
        // Error or Bell
        if (cmd === '\x07') {
             return { type: 'ERROR', raw: line };
        }

        return { type: 'UNKNOWN', raw: line };
    }

    hexStringToBytes(hex) {
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.substr(i, 2), 16));
        }
        return bytes;
    }

    // Generate SLCAN commands
    
    // Setup Bitrate: S0-SD
    cmdSetup(bitrateIndex) {
        return `S${bitrateIndex}\r`;
    }

    // Setup FD Bitrate: Y1-Y5
    cmdSetupFD(bitrateIndex) {
        return `Y${bitrateIndex}\r`;
    }

    // Set Mode: M0 (Normal), M1 (Silent)
    cmdSetMode(mode) {
        return `M${mode}\r`;
    }

    // Open/Close: O/C
    cmdOpen() { return 'O\r'; }
    cmdClose() { return 'C\r'; }

    // Helper: Map data length to DLC char (0-F) for CAN FD
    lenToDlcChar(len) {
        if (len <= 8) return len.toString(16).toUpperCase();
        if (len <= 12) return '9';
        if (len <= 16) return 'A';
        if (len <= 20) return 'B';
        if (len <= 24) return 'C';
        if (len <= 32) return 'D';
        if (len <= 48) return 'E';
        return 'F'; // 64
    }

    // Helper: Map DLC char (0-F) to length
    dlcCharToLen(char) {
        const val = parseInt(char, 16);
        if (val <= 8) return val;
        switch(char.toUpperCase()) {
            case '9': return 12;
            case 'A': return 16;
            case 'B': return 20;
            case 'C': return 24;
            case 'D': return 32;
            case 'E': return 48;
            case 'F': return 64;
            default: return 0;
        }
    }

    // Transmit Standard: tIIILDD...
    cmdTxStd(id, data) {
        const idStr = id.toString(16).padStart(3, '0').toUpperCase();
        const len = Math.min(data.length, 8);
        const dlc = len.toString(16).toUpperCase();
        const dataStr = data.slice(0, len).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
        return `t${idStr}${dlc}${dataStr}\r`;
    }

    // Transmit Extended: TIIIIIIIILDD...
    cmdTxExt(id, data) {
        const idStr = id.toString(16).padStart(8, '0').toUpperCase();
        const len = Math.min(data.length, 8);
        const dlc = len.toString(16).toUpperCase();
        const dataStr = data.slice(0, len).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
        return `T${idStr}${dlc}${dataStr}\r`;
    }

    // Transmit Remote Standard: rIIIL
    cmdTxRtrStd(id, len) {
        const idStr = id.toString(16).padStart(3, '0').toUpperCase();
        const dlc = Math.min(len, 8).toString(16).toUpperCase();
        return `r${idStr}${dlc}\r`;
    }

    // Transmit Remote Extended: RIIIIIIIIL
    cmdTxRtrExt(id, len) {
        const idStr = id.toString(16).padStart(8, '0').toUpperCase();
        const dlc = Math.min(len, 8).toString(16).toUpperCase();
        return `R${idStr}${dlc}\r`;
    }

    // Transmit FD Standard (No BRS): dIIILDD...
    cmdTxFdStd(id, data) {
        const idStr = id.toString(16).padStart(3, '0').toUpperCase();
        const len = Math.min(data.length, 64);
        const dlc = this.lenToDlcChar(len);
        const dataStr = data.slice(0, len).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
        return `d${idStr}${dlc}${dataStr}\r`;
    }

    // Transmit FD Extended (No BRS): DIIIIIIIILDD...
    cmdTxFdExt(id, data) {
        const idStr = id.toString(16).padStart(8, '0').toUpperCase();
        const len = Math.min(data.length, 64);
        const dlc = this.lenToDlcChar(len);
        const dataStr = data.slice(0, len).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
        return `D${idStr}${dlc}${dataStr}\r`;
    }

    // Transmit FD Standard (BRS): bIIILDD...
    cmdTxFdBrsStd(id, data) {
        const idStr = id.toString(16).padStart(3, '0').toUpperCase();
        const len = Math.min(data.length, 64);
        const dlc = this.lenToDlcChar(len);
        const dataStr = data.slice(0, len).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
        return `b${idStr}${dlc}${dataStr}\r`;
    }

    // Transmit FD Extended (BRS): BIIIIIIIILDD...
    cmdTxFdBrsExt(id, data) {
        const idStr = id.toString(16).padStart(8, '0').toUpperCase();
        const len = Math.min(data.length, 64);
        const dlc = this.lenToDlcChar(len);
        const dataStr = data.slice(0, len).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
        return `B${idStr}${dlc}${dataStr}\r`;
    }
}

