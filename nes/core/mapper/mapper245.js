import { Mapper4 } from './mapper4.js';

// MMC3 clone used by several Dragon Quest pirate boards.
export class Mapper245 extends Mapper4 {
    constructor(cartridge, ram, prg, chr) {
        super(cartridge, ram, prg, chr);
        this.outerBank = 0;
    }
    writeBankData(data) {
        if (this.register <= 5) {
            this.outerBank = data;
            super.writeBankData(data & 7);
        }
        else super.writeBankData(data);
    }
    parsePrgAddress(address) {
        const base = super.parsePrgAddress(address);
        const bank = ((base >> 13) & 0x3F) | ((this.outerBank & 2) << 5);
        return (bank * 0x2000 + (base & 0x1FFF)) % this.prg.length;
    }
}
