import { Mapper4 } from './mapper4.js';

// MMC3 clone with an outer 32 KiB PRG bank latch at $4120-$7FFF.
export class Mapper189 extends Mapper4 {
    constructor(cartridge, ram, prg, chr) {
        super(cartridge, ram, prg, chr);
        this.outerPrgBank = 0;
    }
    write(address, data) {
        address &= 0xFFFF;
        if (address >= 0x4120 && address < 0x8000) {
            this.outerPrgBank = (data | (data >> 4)) & 7;
            return;
        }
        super.write(address, data);
    }
    parsePrgAddress(address) {
        return (this.outerPrgBank * 0x8000 + (address - 0x8000)) % this.prg.length;
    }
}
