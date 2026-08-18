// VS UniSystem mapper. CHR selection is latched through controller port $4016.
export class Mapper99 {
    constructor(cartridge, ram, prg, chr) {
        this.cartridge = cartridge;
        this.ram = ram;
        this.prg = prg;
        this.chr = chr.length ? chr : new Uint8Array(0x2000);
        this.chrWritable = chr.length === 0;
        this.chrBank = 0;
    }
    read(address) {
        address &= 0xFFFF;
        if (address < 0x2000) return this.chr[(this.chrBank * 0x2000 + address) % this.chr.length];
        if (address >= 0x8000) return this.prg[(address - 0x8000) % this.prg.length];
        if (address >= 0x6000) return this.ram[address - 0x6000];
        return 0;
    }
    write(address, data) {
        address &= 0xFFFF;
        if (address < 0x2000) {
            if (this.chrWritable) this.chr[(this.chrBank * 0x2000 + address) % this.chr.length] = data;
        }
        else if (address === 0x4016) this.chrBank = (data >> 2) & 1;
        else if (address >= 0x6000 && address < 0x8000) this.ram[address - 0x6000] = data;
    }
    ppuClockHandle(scanLine, cycle) { }
}
