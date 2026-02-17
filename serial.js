// serial.js

export class SerialPort {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.onData = null; // Callback for incoming data chunks
    }

    async connect() {
        if (!navigator.serial) {
            throw new Error('Web Serial API not supported in this browser.');
        }

        try {
            this.port = await navigator.serial.requestPort();
            await this.port.open({
                baudRate: 115200,
                bufferSize: 8192, // Збільшити буфер
                flowControl: 'none' // Явно вимкнути
            }); // SLCAN usually runs at 115200 or higher for the UART link itself
            
            this.isConnected = true;
            // this.readLoop(); // Don't start reading immediately to avoid setup crashes
            return true;
        } catch (err) {
            console.error('Connection failed:', err);
            return false;
        }
    }

    startReading() {
        if (this.isConnected && !this.reader) {
            this.readLoop();
        }
    }

    async disconnect() {
        if (this.reader) {
            await this.reader.cancel();
            this.reader = null;
        }
        if (this.writer) {
            this.writer.releaseLock();
            this.writer = null;
        }
        if (this.port) {
            await this.port.close();
            this.port = null;
        }
        this.isConnected = false;
    }

    async readLoop() {
        while (this.isConnected) {
            if (!this.port || !this.port.readable) {
                 // Якщо порт відвалився зовсім, чекаємо або виходимо
                 await new Promise(r => setTimeout(r, 100));
                 continue;
            }

            try {
                this.reader = this.port.readable.getReader();
                while (true) {
                    const { value, done } = await this.reader.read();
                    if (done) break;
                    if (value && this.onData) {
                        const chunk = new TextDecoder().decode(value);
                        this.onData(chunk);
                    }
                }
            } catch (err) {
                console.error('Read error (retrying in 1s):', err);
                // Важливо: не виходимо з циклу, а пробуємо ще раз
                await new Promise(r => setTimeout(r, 1000));
            } finally {
                if (this.reader) {
                    this.reader.releaseLock();
                    this.reader = null; // Явно очищаємо
                }
            }
        }
    }

    async write(data) {
        if (!this.port || !this.port.writable) return;
        console.log("Write to serial:", [data]);
        const writer = this.port.writable.getWriter();
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(data));
        writer.releaseLock();
    }
}
