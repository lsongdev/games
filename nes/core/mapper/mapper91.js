// Early Hummer/J.Y. board.
export class Mapper91 {
    constructor(cartridge, ram, prg, chr) {
        this.cartridge = cartridge;
        this.ram = ram;
        this.prg = prg;
        this.chr = chr.length ? chr : new Uint8Array(0x2000);
        this.chrWritable = chr.length === 0;
        this.prgBanks = new Uint8Array(2);
        this.chrBanks = new Uint8Array(4);
        this.irqEnabled = false;
        this.irqCounter = 0;
    }
    read(address) {
        address &= 0xFFFF;
        if (address < 0x2000) {
            const slot = address >> 11;
            return this.chr[(this.chrBanks[slot] * 0x800 + (address & 0x7FF)) % this.chr.length];
        }
        if (address >= 0x8000) {
            const slot = (address - 0x8000) >> 13;
            const totalBanks = this.prg.length >> 13;
            const bank = slot < 2 ? this.prgBanks[slot] : totalBanks - (4 - slot);
            return this.prg[(bank * 0x2000 + (address & 0x1FFF)) % this.prg.length];
        }
        return 0;
    }
    write(address, data) {
        address &= 0xFFFF;
        data &= 0xFF;
        if (address < 0x2000) {
            if (this.chrWritable) {
                const slot = address >> 11;
                this.chr[(this.chrBanks[slot] * 0x800 + (address & 0x7FF)) % this.chr.length] = data;
            }
        }
        else if (address >= 0x6000 && address < 0x7000) this.chrBanks[address & 3] = data;
        else if (address >= 0x7000 && address < 0x8000) {
            switch (address & 3) {
                case 0:
                case 1: this.prgBanks[address & 1] = data; break;
                case 2: this.irqEnabled = false; this.irqCounter = 0; break;
                case 3: this.irqEnabled = true; break;
            }
        }
    }
    ppuClockHandle(scanLine, cycle) {
        if (cycle !== 260 || !this.irqEnabled || this.irqCounter >= 8) return;
        this.irqCounter++;
        if (this.irqCounter >= 8 && this.interrupt) this.interrupt.irq();
    }
}
