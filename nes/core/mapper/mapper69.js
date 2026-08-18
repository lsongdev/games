import { Mirror } from '../api/cartridge.js';

// Sunsoft FME-7 / Sunsoft 5B. The mapper and IRQ hardware are implemented;
// the optional AY-3-8910-compatible expansion audio is accepted silently.
export class Mapper69 {
    constructor(cartridge, ram, prg, chr) {
        this.cartridge = cartridge;
        this.ram = ram;
        this.prg = prg;
        this.chr = chr.length ? chr : new Uint8Array(0x2000);
        this.chrWritable = chr.length === 0;
        this.command = 0;
        this.prgBanks = new Uint8Array(4);
        this.chrBanks = new Uint8Array(8);
        this.irqControl = 0;
        this.irqCounter = 0xFFFF;
        this.soundCommand = 0;
    }
    chrAddress(address) {
        const bank = this.chrBanks[address >> 10];
        return (bank * 0x400 + (address & 0x3FF)) % this.chr.length;
    }
    read(address) {
        address &= 0xFFFF;
        if (address < 0x2000) return this.chr[this.chrAddress(address)];
        if (address >= 0xE000) {
            return this.prg[this.prg.length - 0x2000 + (address & 0x1FFF)];
        }
        if (address >= 0x8000) {
            const slot = (address - 0x8000) >> 13;
            return this.prg[(this.prgBanks[slot] * 0x2000 + (address & 0x1FFF)) % this.prg.length];
        }
        if (address >= 0x6000) {
            const mode = this.prgBanks[3] & 0xC0;
            if (mode === 0xC0) return this.ram[address - 0x6000];
            if (mode === 0x40) return 0;
            return this.prg[((this.prgBanks[3] & 0x3F) * 0x2000 + (address & 0x1FFF)) % this.prg.length];
        }
        return 0;
    }
    write(address, data) {
        address &= 0xFFFF;
        data &= 0xFF;
        if (address < 0x2000) {
            if (this.chrWritable) this.chr[this.chrAddress(address)] = data;
            return;
        }
        if (address >= 0x6000 && address < 0x8000) {
            if ((this.prgBanks[3] & 0xC0) === 0xC0) this.ram[address - 0x6000] = data;
            return;
        }
        if (address >= 0x8000 && address < 0xA000) {
            this.command = data & 0x0F;
            return;
        }
        if (address >= 0xA000 && address < 0xC000) {
            this.writeCommand(data);
            return;
        }
        if (address >= 0xC000 && address < 0xE000) {
            this.soundCommand = data & 0x0F;
            return;
        }
        // $E000-$FFFF writes target Sunsoft 5B expansion audio registers.
    }
    writeCommand(data) {
        if (this.command <= 7) {
            this.chrBanks[this.command] = data;
            return;
        }
        if (this.command === 8) this.prgBanks[3] = data;
        else if (this.command >= 9 && this.command <= 11) this.prgBanks[this.command - 9] = data;
        else if (this.command === 12) {
            const mirrors = [Mirror.VERTICAL, Mirror.HORIZONTAL, Mirror.SINGLE_SCREEN_LOWER_BANK, Mirror.SINGLE_SCREEN_UPPER_BANK];
            this.cartridge.info.mirror = mirrors[data & 3];
        }
        else if (this.command === 13) this.irqControl = data;
        else if (this.command === 14) this.irqCounter = (this.irqCounter & 0xFF00) | data;
        else if (this.command === 15) this.irqCounter = (this.irqCounter & 0x00FF) | (data << 8);
    }
    cpuClockHandle() {
        if (!this.irqControl) return;
        this.irqCounter--;
        if (this.irqCounter <= 0) {
            this.irqCounter = 0xFFFF;
            this.irqControl = 0;
            if (this.interrupt) this.interrupt.irq();
        }
    }
    ppuClockHandle(scanLine, cycle) { }
}
