import { Mirror } from '../api/cartridge.js';

// AxROM / AOROM
export class Mapper7 {
    constructor(cartridge, ram, prg, chr) {
        this.cartridge = cartridge;
        this.ram = ram;
        this.prg = prg;
        this.chr = chr.length ? chr : new Uint8Array(0x2000);
        this.chrWritable = chr.length === 0;
        this.prgBank = 0;
    }
    read(address) {
        address &= 0xFFFF;
        if (address < 0x2000) return this.chr[address % this.chr.length];
        if (address >= 0x8000) return this.prg[(this.prgBank * 0x8000 + (address - 0x8000)) % this.prg.length];
        if (address >= 0x6000) return this.ram[address - 0x6000];
        return 0;
    }
    write(address, data) {
        address &= 0xFFFF;
        if (address < 0x2000) {
            if (this.chrWritable) this.chr[address] = data;
        }
        else if (address >= 0x8000) {
            this.prgBank = data & 0x0F;
            this.cartridge.info.mirror = data & 0x10 ?
                Mirror.SINGLE_SCREEN_UPPER_BANK : Mirror.SINGLE_SCREEN_LOWER_BANK;
        }
        else if (address >= 0x6000) this.ram[address - 0x6000] = data;
    }
    ppuClockHandle(scanLine, cycle) { }
}
