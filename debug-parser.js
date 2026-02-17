
// const fs = require('fs');

const fileContent = `@ TEXT @ 3 @ 64 @ 0 @ 84 @ 2399 @ 00:00:02.399 @
# $LocalTime=18:29:42.675
01,332276\t1\t00000004\t440\t8\t00\t00\t00\t00\t00\t00\t00\t00
`;

console.log("--- Debugging loadTrace logic ---");

// Emulate loadTrace logic
const text = fileContent;
// Normalize line endings first to handle \r\n, \r, \n consistently
const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const lines = normalizedText.split('\n');

console.log(`Total lines after split: ${lines.length}`);

const firstLine = lines.find(l => {
    const trimmed = l.trim();
    return trimmed && !trimmed.startsWith('@') && !trimmed.startsWith('#') && !trimmed.startsWith(';');
});

console.log("First data line detected:", firstLine);

function parseCanHacker(text) {
    // Better split regex to handle mixed line endings
    const lines = text.split(/\r?\n/);
    const packets = [];
    let lastTime = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line || line.startsWith('@') || line.startsWith('#') || line.startsWith(';')) continue;
        
        // Replace commas in timestamp with dots for float parsing
        // The log showed "01,332276" which is likely seconds,microseconds
        
        // Split by whitespace (tabs or spaces)
        const parts = line.split(/\s+/);
        
        console.log(`Line ${i} parts:`, parts);

        // Check length
        if (parts.length < 5) {
            console.warn(`Skipping line ${i} (parts < 5):`, line);
            continue;
        }

        const timeStr = parts[0].replace(',', '.');
        const channel = parts[1];
        const flagHex = parts[2]; // 00000004 -> Flags
        const idHex = parts[3];   // 440 -> ID
        const dlcStr = parts[4];  // 8 -> DLC (?)
        
        // In the user log: 01,332276  1  00000004  440
        // parts[0] = 01,332276 (Time)
        // parts[1] = 1 (Channel)
        // parts[2] = 00000004 (Flags?) or ID?
        // Let's verify standard CAN Hacker format.
        // Usually: timestamp, ID, DLC, Data... OR timestamp, ch, ID, DLC...
        // The user log has: 01,332276 [tab] 1 [tab] 00000004 [tab] 440
        // If 440 is ID (hex), it's reasonable (1088 decimal).
        // If 00000004 is flags? 
        
        // Let's look at the existing parser logic in file-io.js:
        // const flagHex = parts[2];
        // const idHex = parts[3];
        // const dlcStr = parts[4];
        
        // If existing parser expects: Time, Ch, Flags, ID, DLC
        // 0: 01,332276
        // 1: 1
        // 2: 00000004
        // 3: 440
        // 4: 8 (Assuming next part is DLC based on typical logs, though user snippet cut off)

        const flags = parseInt(flagHex, 16);
        const id = parseInt(idHex, 16);
        const dlc = parseInt(dlcStr, 10);

        console.log(`Parsed: Time=${timeStr}, Flags=${flagHex}, ID=${idHex}, DLC=${dlcStr}`);
        
        if (isNaN(flags) || isNaN(id) || isNaN(dlc)) {
             console.warn(`Skipping line ${i} (NaN check)`);
             continue;
        }

        packets.push({ id, dlc });
    }
    return packets;
}

const packets = parseCanHacker(fileContent);
console.log(`Parsed packets: ${packets.length}`);
