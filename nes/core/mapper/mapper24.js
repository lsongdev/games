import { Mirror } from '../api/cartridge.js';

// Konami VRC6 (mapper 24). Expansion audio registers are accepted but audio
// generation remains handled by the base APU in this emulator.
export class Mapper24 {
    constructor(cartridge, ram, prg, chr) {
        this.cartridge = cartridge;
        this.ram = ram;
        this.prg = prg;
        this.chr = chr.length ? chr : new Uint8Array(8 * 1024);
        this.chrWritable = chr.length === 0;
        this.prgBank16 = 0;
        this.prgBank8 = 0;
        this.chrBanks = new Uint8Array(8);
        this.irqLatch = 0;
        this.irqCounter = 0;
        this.irqPrescaler = 341;
        this.irqEnabled = false;
        this.irqEnableAfterAck = false;
        this.irqCycleMode = false;
    }
    read(address) {
        address &= 0xFFFF;
        if (address < 0x2000) {
            const bank = this.chrBanks[address >> 10];
            return this.chr[((bank << 10) | (address & 0x03FF)) % this.chr.length];
        }
        if (address >= 0xE000) {
            return this.prg[this.prg.length - 0x2000 + (address & 0x1FFF)];
        }
        if (address >= 0xC000) {
            const offset = (this.prgBank8 * 0x2000 + (address & 0x1FFF)) % this.prg.length;
            return this.prg[offset];
        }
        if (address >= 0x8000) {
            const offset = (this.prgBank16 * 0x4000 + (address & 0x3FFF)) % this.prg.length;
            return this.prg[offset];
        }
        if (address >= 0x6000) {
            return this.ram[address - 0x6000];
        }
        return 0;
    }
    write(address, data) {
        address &= 0xFFFF;
        data &= 0xFF;
        if (address < 0x2000) {
            if (this.chrWritable) {
                const bank = this.chrBanks[address >> 10];
                this.chr[((bank << 10) | (address & 0x03FF)) % this.chr.length] = data;
            }
            return;
        }
        if (address >= 0x6000 && address < 0x8000) {
            this.ram[address - 0x6000] = data;
            return;
        }
        if (address < 0x8000) return;

        const register = address & 0xF003;
        if (register === 0x8000) {
            this.prgBank16 = data & 0x0F;
        }
        else if (register === 0xB003) {
            this.setMirroring(data);
        }
        else if (register === 0xC000) {
            this.prgBank8 = data & 0x1F;
        }
        else if (register >= 0xD000 && register <= 0xD003) {
            this.chrBanks[register & 0x03] = data;
        }
        else if (register >= 0xE000 && register <= 0xE003) {
            this.chrBanks[4 + (register & 0x03)] = data;
        }
        else if (register === 0xF000) {
            this.irqLatch = data;
        }
        else if (register === 0xF001) {
            this.irqEnableAfterAck = !!(data & 0x01);
            this.irqEnabled = !!(data & 0x02);
            this.irqCycleMode = !!(data & 0x04);
            if (this.irqEnabled) {
                this.irqCounter = this.irqLatch;
                this.irqPrescaler = 341;
            }
        }
        else if (register === 0xF002) {
            this.irqEnabled = this.irqEnableAfterAck;
        }
        // $9000-$B002 are VRC6 expansion-audio registers. They are ignored
        // deliberately so mapper games can run with the standard NES APU.
    }
    setMirroring(data) {
        switch ((data >> 2) & 0x03) {
            case 0:
                this.cartridge.info.mirror = Mirror.VERTICAL;
                break;
            case 1:
                this.cartridge.info.mirror = Mirror.HORIZONTAL;
                break;
            case 2:
                this.cartridge.info.mirror = Mirror.SINGLE_SCREEN_LOWER_BANK;
                break;
            case 3:
                this.cartridge.info.mirror = Mirror.SINGLE_SCREEN_UPPER_BANK;
                break;
        }
    }
    clockIrqCounter() {
        if (this.irqCounter === 0xFF) {
            this.irqCounter = this.irqLatch;
            if (this.interrupt) this.interrupt.irq();
        }
        else {
            this.irqCounter++;
        }
    }
    cpuClockHandle() {
        if (!this.irqEnabled) return;
        if (this.irqCycleMode) {
            this.clockIrqCounter();
            return;
        }
        this.irqPrescaler -= 3;
        if (this.irqPrescaler <= 0) {
            this.irqPrescaler += 341;
            this.clockIrqCounter();
        }
    }
    ppuClockHandle(scanLine, cycle) {
        // VRC6 IRQ timing is driven from CPU clocks via cpuClockHandle().
    }
}
