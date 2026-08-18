import { Mirror } from '../api/cartridge.js';

// Irem H3001.
export class Mapper65 {
    constructor(cartridge, ram, prg, chr) {
        this.cartridge = cartridge;
        this.ram = ram;
        this.prg = prg;
        this.chr = chr.length ? chr : new Uint8Array(0x2000);
        this.chrWritable = chr.length === 0;
        this.prgBanks = new Uint8Array([0, 0, (prg.length >> 13) - 2]);
        this.chrBanks = new Uint8Array(8);
        this.irqEnabled = false;
        this.irqCounter = 0;
        this.irqLatch = 0;
    }
    read(address) {
        address &= 0xFFFF;
        if (address < 0x2000) {
            const bank = this.chrBanks[address >> 10];
            return this.chr[(bank * 0x400 + (address & 0x3FF)) % this.chr.length];
        }
        if (address >= 0x8000) {
            const slot = (address - 0x8000) >> 13;
            const bank = slot === 3 ? (this.prg.length >> 13) - 1 : this.prgBanks[slot];
            return this.prg[(bank * 0x2000 + (address & 0x1FFF)) % this.prg.length];
        }
        if (address >= 0x6000) return this.ram[address - 0x6000];
        return 0;
    }
    write(address, data) {
        address &= 0xFFFF;
        data &= 0xFF;
        if (address < 0x2000) {
            if (this.chrWritable) {
                const bank = this.chrBanks[address >> 10];
                this.chr[(bank * 0x400 + (address & 0x3FF)) % this.chr.length] = data;
            }
            return;
        }
        if (address >= 0x6000 && address < 0x8000) {
            this.ram[address - 0x6000] = data;
            return;
        }
        if (address === 0x8000) this.prgBanks[0] = data;
        else if (address === 0xA000) this.prgBanks[1] = data;
        else if (address === 0xC000) this.prgBanks[2] = data;
        else if (address === 0x9001) {
            this.cartridge.info.mirror = data & 0x80 ? Mirror.HORIZONTAL : Mirror.VERTICAL;
        }
        else if (address === 0x9003) this.irqEnabled = !!(data & 0x80);
        else if (address === 0x9004) this.irqCounter = this.irqLatch;
        else if (address === 0x9005) this.irqLatch = (this.irqLatch & 0x00FF) | (data << 8);
        else if (address === 0x9006) this.irqLatch = (this.irqLatch & 0xFF00) | data;
        else if (address >= 0xB000 && address <= 0xB007) this.chrBanks[address & 7] = data;
    }
    cpuClockHandle() {
        if (!this.irqEnabled) return;
        this.irqCounter--;
        if (this.irqCounter < -4) {
            this.irqEnabled = false;
            this.irqCounter = -1;
            if (this.interrupt) this.interrupt.irq();
        }
    }
    ppuClockHandle(scanLine, cycle) { }
}
