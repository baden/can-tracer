// buffer.js

export class LogBuffer {
    constructor() {
        this.buffer = []; // Array of objects
        this.maxSize = 1000000; // Hard limit 1M packets to prevent browser crash, though "infinite" was requested, practical limits apply.
        this.listeners = [];
        this.startTime = Date.now();
    }

    add(packet) {
        // packet: { id, data, dlc, type, timestamp, delta }
        if (this.buffer.length >= this.maxSize) {
            this.buffer.shift(); // Remove oldest
        }
        this.buffer.push(packet);
        this.notify();
    }

    clear() {
        this.buffer = [];
        this.notify();
    }

    get length() {
        return this.buffer.length;
    }

    get(index) {
        return this.buffer[index];
    }

    getAll() {
        return this.buffer;
    }

    subscribe(callback) {
        this.listeners.push(callback);
    }

    notify() {
        // Debounce or just let the UI loop handle it?
        // We'll let the UI loop pull data, but maybe notify on specific events?
        // Actually, for high freq, polling in requestAnimationFrame is better.
    }
}

export const logBuffer = new LogBuffer();
