import { Mirror } from '../api/cartridge.js';

// FFE Rev. B
export class Mapper17 {
    constructor(cartridge, ram, prg, chr) {
        this.cartridge = cartridge;
        this.ram = ram;
        this.prg = prg;
        this.chr = chr.length ? chr : new Uint8Array(0x2000);
        this.chrWritable = chr.length === 0;
        // FFE software boots from a contiguous 32 KiB window at the end of
        // PRG ROM, then initializes the four 8 KiB registers explicitly.
        const lastBank = (prg.length >> 13) - 1;
        this.prgBanks = new Uint8Array([lastBank - 3, lastBank - 2, lastBank - 1, lastBank]);
        this.chrBanks = new Uint8Array(8);
        this.irqEnabled = false;
        this.irqCounter = 0;
    }
    read(address) {
        address &= 0xFFFF;
        if (address < 0x2000) {
            const bank = this.chrBanks[address >> 10];
            return this.chr[((bank << 10) | (address & 0x3FF)) % this.chr.length];
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
                this.chr[((bank << 10) | (address & 0x3FF)) % this.chr.length] = data;
            }
        }
        else if (address >= 0x6000 && address < 0x8000) this.ram[address - 0x6000] = data;
        else if (address === 0x42FE) {
            this.cartridge.info.mirror = data & 0x10 ?
                Mirror.SINGLE_SCREEN_UPPER_BANK : Mirror.SINGLE_SCREEN_LOWER_BANK;
        }
        else if (address === 0x42FF) {
            this.cartridge.info.mirror = data & 0x10 ? Mirror.HORIZONTAL : Mirror.VERTICAL;
        }
        else if (address === 0x4501) {
            this.irqEnabled = false;
        }
        else if (address === 0x4502) {
            this.irqCounter = (this.irqCounter & 0xFF00) | data;
        }
        else if (address === 0x4503) {
            this.irqCounter = (this.irqCounter & 0x00FF) | (data << 8);
            this.irqEnabled = true;
        }
        else if (address >= 0x4504 && address <= 0x4507) this.prgBanks[address & 3] = data;
        else if (address >= 0x4510 && address <= 0x4517) this.chrBanks[address & 7] = data;
    }
    cpuClockHandle() {
        if (!this.irqEnabled) return;
        this.irqCounter++;
        if (this.irqCounter >= 0x10000) {
            this.irqCounter = 0;
            this.irqEnabled = false;
            if (this.interrupt) this.interrupt.irq();
        }
    }
    ppuClockHandle(scanLine, cycle) { }
}
