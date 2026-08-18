import { Mirror } from '../api/cartridge.js';

// J.Y. Company board (mapper 90).
export class Mapper90 {
    constructor(cartridge, ram, prg, chr) {
        this.cartridge = cartridge;
        this.ram = ram;
        this.prg = prg;
        this.chr = chr.length ? chr : new Uint8Array(0x2000);
        this.chrWritable = chr.length === 0;
        this.control = new Uint8Array(4);
        this.prgBanks = new Uint8Array(4).fill(0xFF);
        this.chrLow = new Uint8Array(8).fill(0xFF);
        this.chrHigh = new Uint8Array(8).fill(0xFF);
        this.multiply = new Uint8Array([0xFF, 0xFF]);
        this.generalRegister = 0xFF;
        this.irqMode = 0;
        this.irqPrescaler = 0;
        this.irqPrescalerSize = 0;
        this.irqCounter = 0;
        this.irqXor = 0;
        this.irqEnabled = false;
        this.updateMirror();
    }
    prg8Bank(slot) {
        const mode = this.control[0] & 7;
        const bankMode = (this.control[3] & 6) << 5;
        if (mode === 0) {
            const bank32 = 0x0F | ((this.control[3] & 6) << 3);
            return bank32 * 4 + slot;
        }
        if (mode === 1) {
            const bank16 = slot < 2 ? (this.prgBanks[1] & 0x1F) | ((this.control[3] & 6) << 4) :
                0x1F | ((this.control[3] & 6) << 4);
            return bank16 * 2 + (slot & 1);
        }
        if (mode === 2 || mode === 3) return (slot === 3 ? 0x3F : this.prgBanks[slot] & 0x3F) | bankMode;
        if (mode === 4) {
            const bank32 = (this.prgBanks[3] & 0x0F) | ((this.control[3] & 6) << 3);
            return bank32 * 4 + slot;
        }
        if (mode === 5) {
            const selected = slot < 2 ? this.prgBanks[1] : this.prgBanks[3];
            const bank16 = (selected & 0x1F) | ((this.control[3] & 6) << 4);
            return bank16 * 2 + (slot & 1);
        }
        return (this.prgBanks[slot] & 0x3F) | bankMode;
    }
    chr1Bank(slot) {
        let outer = 0;
        let mask = 0xFFFF;
        if (!(this.control[3] & 0x20)) {
            outer = (this.control[3] & 1) | ((this.control[3] & 0x18) >> 2);
            const mode = this.control[0] & 0x18;
            if (mode === 0) { outer <<= 5; mask = 0x1F; }
            else if (mode === 8) { outer <<= 6; mask = 0x3F; }
            else if (mode === 0x10) { outer <<= 7; mask = 0x7F; }
            else { outer <<= 8; mask = 0xFF; }
        }
        const mode = this.control[0] & 0x18;
        let source = slot;
        let bank;
        if (mode === 0) {
            source = 0;
            bank = ((this.chrLow[source] | (this.chrHigh[source] << 8)) & mask) | outer;
            return bank * 8 + slot;
        }
        if (mode === 8) {
            source = slot < 4 ? 0 : 4;
            bank = ((this.chrLow[source] | (this.chrHigh[source] << 8)) & mask) | outer;
            return bank * 4 + (slot & 3);
        }
        if (mode === 0x10) {
            source = slot & 6;
            bank = ((this.chrLow[source] | (this.chrHigh[source] << 8)) & mask) | outer;
            return bank * 2 + (slot & 1);
        }
        return ((this.chrLow[slot] | (this.chrHigh[slot] << 8)) & mask) | outer;
    }
    updateMirror() {
        const mirrors = [Mirror.VERTICAL, Mirror.HORIZONTAL, Mirror.SINGLE_SCREEN_LOWER_BANK, Mirror.SINGLE_SCREEN_UPPER_BANK];
        this.cartridge.info.mirror = mirrors[this.control[1] & 3];
    }
    read(address) {
        address &= 0xFFFF;
        if (address < 0x2000) {
            const bank = this.chr1Bank(address >> 10);
            return this.chr[(bank * 0x400 + (address & 0x3FF)) % this.chr.length];
        }
        if (address >= 0x5000 && address < 0x6000) {
            switch (address & 0x5C03) {
                case 0x5800: return (this.multiply[0] * this.multiply[1]) & 0xFF;
                case 0x5801: return (this.multiply[0] * this.multiply[1]) >> 8;
                case 0x5803: return this.generalRegister;
                default: return 0;
            }
        }
        if (address >= 0x8000) {
            const slot = (address - 0x8000) >> 13;
            return this.prg[(this.prg8Bank(slot) * 0x2000 + (address & 0x1FFF)) % this.prg.length];
        }
        if (address >= 0x6000) return this.ram[address - 0x6000];
        return 0;
    }
    write(address, data) {
        address &= 0xFFFF;
        data &= 0xFF;
        if (address < 0x2000) {
            if (this.chrWritable) {
                const bank = this.chr1Bank(address >> 10);
                this.chr[(bank * 0x400 + (address & 0x3FF)) % this.chr.length] = data;
            }
            return;
        }
        if (address >= 0x5000 && address < 0x6000) {
            switch (address & 0x5C03) {
                case 0x5800: this.multiply[0] = data; break;
                case 0x5801: this.multiply[1] = data; break;
                case 0x5803: this.generalRegister = data; break;
            }
            return;
        }
        if (address >= 0x6000 && address < 0x8000) {
            this.ram[address - 0x6000] = data;
            return;
        }
        if (address >= 0x8000 && address < 0x9000) this.prgBanks[address & 3] = data;
        else if (address >= 0x9000 && address < 0xA000) this.chrLow[address & 7] = data;
        else if (address >= 0xA000 && address < 0xB000) this.chrHigh[address & 7] = data;
        else if (address >= 0xC000 && address < 0xD000) this.writeIrq(address & 7, data);
        else if (address >= 0xD000 && address < 0xD600) {
            this.control[address & 3] = data;
            this.updateMirror();
        }
    }
    writeIrq(register, data) {
        switch (register) {
            case 0: this.irqEnabled = !!(data & 1); break;
            case 1: this.irqMode = data; break;
            case 2: this.irqEnabled = false; break;
            case 3: this.irqEnabled = true; break;
            case 4: this.irqPrescaler = data ^ this.irqXor; break;
            case 5: this.irqCounter = data ^ this.irqXor; break;
            case 6: this.irqXor = data; break;
            case 7: this.irqPrescalerSize = data; break;
        }
    }
    clockIrq() {
        const direction = this.irqMode >> 6;
        const mask = this.irqMode & 4 ? 7 : 0xFF;
        if (direction === 1) {
            this.irqPrescaler = (this.irqPrescaler + 1) & 0xFF;
            if ((this.irqPrescaler & mask) === 0) {
                this.irqCounter = (this.irqCounter + 1) & 0xFF;
                if (this.irqCounter === 0 && this.irqEnabled && this.interrupt) this.interrupt.irq();
            }
        }
        else if (direction === 2) {
            this.irqPrescaler = (this.irqPrescaler - 1) & 0xFF;
            if ((this.irqPrescaler & mask) === mask) {
                this.irqCounter = (this.irqCounter - 1) & 0xFF;
                if (this.irqCounter === 0xFF && this.irqEnabled && this.interrupt) this.interrupt.irq();
            }
        }
    }
    cpuClockHandle() {
        if ((this.irqMode & 3) === 0) this.clockIrq();
    }
    ppuClockHandle(scanLine, cycle) {
        if (cycle === 260 && (this.irqMode & 3) === 1) {
            for (let i = 0; i < 8; i++) this.clockIrq();
        }
    }
}
