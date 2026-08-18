import { Mirror } from '../api/cartridge.js';

// Future Media board.
export class Mapper117 {
    constructor(cartridge, ram, prg, chr) {
        this.cartridge = cartridge;
        this.ram = ram;
        this.prg = prg;
        this.chr = chr.length ? chr : new Uint8Array(0x2000);
        this.chrWritable = chr.length === 0;
        const banks = prg.length >> 13;
        this.prgBanks = new Uint8Array([banks - 4, banks - 3, banks - 2, banks - 1]);
        this.chrBanks = new Uint8Array(8);
        this.irqLatch = 0;
        this.irqCounter = 0;
        this.irqArmed = false;
        this.irqEnabled = false;
    }
    read(address) {
        address &= 0xFFFF;
        if (address < 0x2000) {
            const bank = this.chrBanks[address >> 10];
            return this.chr[(bank * 0x400 + (address & 0x3FF)) % this.chr.length];
        }
        if (address >= 0x8000) {
            const slot = (address - 0x8000) >> 13;
            return this.prg[(this.prgBanks[slot] * 0x2000 + (address & 0x1FFF)) % this.prg.length];
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
        }
        else if (address >= 0x6000 && address < 0x8000) this.ram[address - 0x6000] = data;
        else if (address >= 0x8000 && address <= 0x8003) this.prgBanks[address & 3] = data;
        else if (address >= 0xA000 && address <= 0xA007) this.chrBanks[address & 7] = data;
        else if (address === 0xC001) this.irqLatch = data;
        else if (address === 0xC003) {
            this.irqCounter = this.irqLatch;
            this.irqArmed = true;
        }
        else if (address === 0xC002) { }
        else if (address === 0xD000) {
            this.cartridge.info.mirror = data & 1 ? Mirror.HORIZONTAL : Mirror.VERTICAL;
        }
        else if (address === 0xE000) this.irqEnabled = !!(data & 1);
    }
    ppuClockHandle(scanLine, cycle) {
        if (cycle !== 260 || !this.irqEnabled || !this.irqArmed || this.irqCounter === 0) return;
        this.irqCounter--;
        if (this.irqCounter === 0) {
            this.irqArmed = false;
            if (this.interrupt) this.interrupt.irq();
        }
    }
}
