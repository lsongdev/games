import { Mirror } from '../api/cartridge.js';

// Nintendo MMC2 (PNROM), used by Punch-Out!!.
export class Mapper9 {
    constructor(cartridge, ram, prg, chr) {
        this.cartridge = cartridge;
        this.ram = ram;
        this.prg = prg;
        this.chr = chr.length ? chr : new Uint8Array(0x2000);
        this.chrWritable = chr.length === 0;
        this.prgBank = 0;
        this.chrBanks = new Uint8Array(4);
        this.latches = new Uint8Array([1, 1]);
    }
    chrAddress(address) {
        const half = address >> 12;
        const register = half * 2 + this.latches[half];
        return (this.chrBanks[register] * 0x1000 + (address & 0x0FFF)) % this.chr.length;
    }
    updateLatch(address) {
        if (address >= 0x0FD8 && address <= 0x0FDF) this.latches[0] = 0;
        else if (address >= 0x0FE8 && address <= 0x0FEF) this.latches[0] = 1;
        else if (address >= 0x1FD8 && address <= 0x1FDF) this.latches[1] = 0;
        else if (address >= 0x1FE8 && address <= 0x1FEF) this.latches[1] = 1;
    }
    read(address) {
        address &= 0xFFFF;
        if (address < 0x2000) {
            const value = this.chr[this.chrAddress(address)];
            this.updateLatch(address);
            return value;
        }
        if (address >= 0x8000) {
            const slot = (address - 0x8000) >> 13;
            const totalBanks = this.prg.length >> 13;
            const bank = slot === 0 ? this.prgBank : totalBanks - (4 - slot);
            return this.prg[(bank * 0x2000 + (address & 0x1FFF)) % this.prg.length];
        }
        return 0;
    }
    write(address, data) {
        address &= 0xFFFF;
        data &= 0xFF;
        if (address < 0x2000) {
            if (this.chrWritable) this.chr[this.chrAddress(address)] = data;
            this.updateLatch(address);
            return;
        }
        switch (address & 0xF000) {
            case 0xA000: this.prgBank = data & 0x0F; break;
            case 0xB000: this.chrBanks[0] = data & 0x1F; break;
            case 0xC000: this.chrBanks[1] = data & 0x1F; break;
            case 0xD000: this.chrBanks[2] = data & 0x1F; break;
            case 0xE000: this.chrBanks[3] = data & 0x1F; break;
            case 0xF000:
                this.cartridge.info.mirror = data & 1 ? Mirror.HORIZONTAL : Mirror.VERTICAL;
                break;
        }
    }
    ppuClockHandle(scanLine, cycle) { }
}
