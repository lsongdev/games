import { Mirror } from '../api/cartridge.js';

// Cony/Yoko board, iNES mapper 83.
export class Mapper83 {
    constructor(cartridge, ram, prg, chr) {
        this.cartridge = cartridge;
        this.ram = ram;
        this.prg = prg;
        this.chr = chr.length ? chr : new Uint8Array(0x2000);
        this.chrWritable = chr.length === 0;
        this.mode = 0;
        this.bank = 0;
        this.registers = new Uint8Array(11);
        this.low = new Uint8Array(4);
        this.is2kBank = false;
        this.isNot2kBank = false;
        this.irqEnabled = false;
        this.irqCounter = 0;
        this.updateMirror();
    }
    prgBankForSlot(slot) {
        if (this.mode & 0x40) {
            const bank16 = slot < 2 ? (this.bank & 0x3F) : ((this.bank & 0x30) | 0x0F);
            return bank16 * 2 + (slot & 1);
        }
        return slot === 3 ? 0xFF : this.registers[8 + slot];
    }
    chrAddress(address) {
        if (this.is2kBank && !this.isNot2kBank) {
            const slot = address >> 11;
            const table = [0, 1, 6, 7];
            return (this.registers[table[slot]] * 0x800 + (address & 0x7FF)) % this.chr.length;
        }
        const slot = address >> 10;
        const bank = this.registers[slot] | ((this.bank & 0x30) << 4);
        return (bank * 0x400 + (address & 0x3FF)) % this.chr.length;
    }
    updateMirror() {
        const mirrors = [Mirror.VERTICAL, Mirror.HORIZONTAL, Mirror.SINGLE_SCREEN_LOWER_BANK, Mirror.SINGLE_SCREEN_UPPER_BANK];
        this.cartridge.info.mirror = mirrors[this.mode & 3];
    }
    read(address) {
        address &= 0xFFFF;
        if (address < 0x2000) return this.chr[this.chrAddress(address)];
        if (address === 0x5000) return 0;
        if (address >= 0x5100 && address <= 0x5103) return this.low[address & 3];
        if (address >= 0x8000) {
            const slot = (address - 0x8000) >> 13;
            return this.prg[(this.prgBankForSlot(slot) * 0x2000 + (address & 0x1FFF)) % this.prg.length];
        }
        if (address >= 0x6000) return this.ram[address - 0x6000];
        return 0;
    }
    write(address, data) {
        address &= 0xFFFF;
        data &= 0xFF;
        if (address < 0x2000) {
            if (this.chrWritable) this.chr[this.chrAddress(address)] = data;
            return;
        }
        if (address >= 0x5100 && address <= 0x5103) {
            this.low[address & 3] = data;
            return;
        }
        if (address >= 0x6000 && address < 0x8000) {
            this.ram[address - 0x6000] = data;
            return;
        }
        switch (address) {
            case 0x8000:
                this.is2kBank = true;
                this.bank = data;
                this.mode |= 0x40;
                break;
            case 0xB000:
            case 0xB0FF:
            case 0xB1FF:
                this.bank = data;
                this.mode |= 0x40;
                break;
            case 0x8100:
                this.mode = data | (this.mode & 0x40);
                this.updateMirror();
                break;
            case 0x8200:
                this.irqCounter = (this.irqCounter & 0xFF00) | data;
                break;
            case 0x8201:
                this.irqCounter = (this.irqCounter & 0x00FF) | (data << 8);
                this.irqEnabled = !!(this.mode & 0x80);
                break;
            case 0x8300:
            case 0x8301:
            case 0x8302:
                this.registers[8 + (address & 3)] = data;
                this.mode &= 0xBF;
                break;
            default:
                if (address >= 0x8310 && address <= 0x8317) {
                    const index = address & 7;
                    this.registers[index] = data;
                    if (index >= 2 && index <= 5) this.isNot2kBank = true;
                }
        }
    }
    cpuClockHandle() {
        if (!this.irqEnabled) return;
        if (this.irqCounter === 0) {
            this.irqEnabled = false;
            this.irqCounter = 0xFFFF;
            if (this.interrupt) this.interrupt.irq();
        }
        else this.irqCounter--;
    }
    ppuClockHandle(scanLine, cycle) { }
}
