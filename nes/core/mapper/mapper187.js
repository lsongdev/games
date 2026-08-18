import { Mapper4 } from './mapper4.js';

// MMC3-derived board with protection data and extended PRG/CHR banking.
export class Mapper187 extends Mapper4 {
    constructor(cartridge, ram, prg, chr) {
        super(cartridge, ram, prg, chr);
        this.expansion = 0;
        this.commandArmed = 0;
    }
    read(address) {
        address &= 0xFFFF;
        if (address >= 0x5000 && address < 0x6000) {
            return [0x83, 0x83, 0x42, 0x00][this.commandArmed & 3];
        }
        return super.read(address);
    }
    write(address, data) {
        address &= 0xFFFF;
        data &= 0xFF;
        if (address >= 0x5000 && address < 0x7000) {
            if (address === 0x5000 || address === 0x6000) this.expansion = data;
            return;
        }
        if (address === 0x8000) {
            this.commandArmed = 1;
            this.writeBankSelect(data);
            return;
        }
        if (address === 0x8001) {
            if (this.commandArmed) this.writeBankData(data);
            return;
        }
        super.write(address, data);
    }
    parsePrgAddress(address) {
        const slot = (address - 0x8000) >> 13;
        const offset = address & 0x1FFF;
        if (this.expansion & 0x80) {
            const bank = this.expansion & 0x1F;
            if (this.expansion & 0x20) {
                const bank32 = bank >> (this.expansion & 0x40 ? 2 : 1);
                return (bank32 * 0x8000 + (address - 0x8000)) % this.prg.length;
            }
            return (bank * 0x4000 + (slot & 1) * 0x2000 + offset) % this.prg.length;
        }
        return super.parsePrgAddress(address);
    }
    parseChrAddress(address) {
        const base = super.parseChrAddress(address);
        let bank = base >> 10;
        const selectedHalf = this.chrA12Inversion ? 0x1000 : 0;
        if ((address & 0x1000) === selectedHalf) bank |= 0x100;
        return (bank * 0x400 + (base & 0x3FF)) % this.chr.length;
    }
}
